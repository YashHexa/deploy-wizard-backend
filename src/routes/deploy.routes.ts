import { Router } from "express";
import multer from "multer";
import { validateBucketNameFormat } from "../utils/validateBucketName";
import { isSupportedRegion } from "../utils/regions";
import { generateWorkflowYaml } from "../utils/yamlTemplate";
import { MissingCredentialsError } from "../config/env";
import {
  createBucket,
  setPublicAccessBlock,
  setPublicReadPolicy,
  enableStaticWebsiteHosting,
  getWebsiteEndpoint,
  uploadZipToBucket,
  BucketNameTakenError,
} from "../services/s3.service";
import {
  createDistributionForBucket,
  findDistributionForBucket,
} from "../services/cloudfront.service";
import {
  CreateBucketRequest,
  CreateBucketResponse,
  CreateCloudFrontRequest,
  CreateCloudFrontResponse,
  FindCloudFrontResponse,
  GenerateYamlRequest,
  GenerateYamlResponse,
  StepResult,
  UploadBuildResponse,
} from "../types";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post("/create-bucket", async (req, res) => {
  const body = req.body as Partial<CreateBucketRequest>;
  const bucketName = (body.bucketName ?? "").trim().toLowerCase();
  const region = body.region ?? "";
  const publicAccessBlock = body.publicAccessBlock;
  const acknowledged = body.acknowledged === true;

  const nameErrors = validateBucketNameFormat(bucketName);
  if (nameErrors.length > 0) {
    return res.status(400).json({ error: nameErrors.join(" ") });
  }
  if (!region || !isSupportedRegion(region)) {
    return res.status(400).json({ error: "A valid AWS region must be selected." });
  }
  if (!publicAccessBlock) {
    return res.status(400).json({ error: "publicAccessBlock settings are required." });
  }

  const anyBlockDisabled =
    !publicAccessBlock.blockPublicAcls ||
    !publicAccessBlock.ignorePublicAcls ||
    !publicAccessBlock.blockPublicPolicy ||
    !publicAccessBlock.restrictPublicBuckets;

  if (anyBlockDisabled && !acknowledged) {
    return res.status(400).json({
      error:
        "You must acknowledge that these settings might make the bucket and its objects public.",
    });
  }

  const steps: StepResult[] = [];

  try {
    await createBucket(bucketName, region);
    steps.push({ step: "create-bucket", ok: true });

    await setPublicAccessBlock(bucketName, region, publicAccessBlock);
    steps.push({ step: "public-access-settings", ok: true });

    await setPublicReadPolicy(bucketName, region);
    steps.push({ step: "bucket-policy", ok: true });

    await enableStaticWebsiteHosting(bucketName, region);
    steps.push({ step: "static-website-hosting", ok: true });

    const response: CreateBucketResponse = {
      steps,
      websiteEndpoint: getWebsiteEndpoint(bucketName, region),
      success: true,
    };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message, steps });
    }
    if (err instanceof BucketNameTakenError) {
      steps.push({ step: "failed", ok: false, message: err.message });
      const response: CreateBucketResponse = {
        steps,
        websiteEndpoint: null,
        success: false,
        error: err.message,
        code: "BUCKET_NAME_TAKEN",
      };
      return res.status(409).json(response);
    }
    console.error(err);
    const message = err?.message ?? "Unknown error while configuring the bucket.";
    steps.push({ step: "failed", ok: false, message });
    const response: CreateBucketResponse = {
      steps,
      websiteEndpoint: null,
      success: false,
      error: message,
    };
    return res.status(502).json(response);
  }
});

router.post("/create-cloudfront", async (req, res) => {
  const body = req.body as Partial<CreateCloudFrontRequest>;
  const bucketName = (body.bucketName ?? "").trim().toLowerCase();
  const region = body.region ?? "";

  if (validateBucketNameFormat(bucketName).length > 0) {
    return res.status(400).json({ error: "A valid bucket name is required." });
  }
  if (!region || !isSupportedRegion(region)) {
    return res.status(400).json({ error: "A valid AWS region must be selected." });
  }

  try {
    const result = await createDistributionForBucket(bucketName, region);
    const response: CreateCloudFrontResponse = result;
    return res.json(response);
  } catch (err: any) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({
      error: err?.message ?? "Could not create the CloudFront distribution.",
    });
  }
});

router.get("/find-cloudfront", async (req, res) => {
  const bucketName = String(req.query.bucketName ?? "")
    .trim()
    .toLowerCase();
  const region = String(req.query.region ?? "");

  if (validateBucketNameFormat(bucketName).length > 0) {
    return res.status(400).json({ error: "A valid bucket name is required." });
  }
  if (!region || !isSupportedRegion(region)) {
    return res.status(400).json({ error: "A valid AWS region must be selected." });
  }

  try {
    const match = await findDistributionForBucket(bucketName, region);
    const response: FindCloudFrontResponse = match ?? {
      distributionId: null,
      domainName: null,
      status: null,
    };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({
      error: err?.message ?? "Could not look up CloudFront distributions.",
    });
  }
});

router.post("/upload-build", upload.single("file"), async (req, res) => {
  const bucketName = String(req.body.bucketName ?? "")
    .trim()
    .toLowerCase();
  const region = String(req.body.region ?? "");

  if (validateBucketNameFormat(bucketName).length > 0) {
    return res.status(400).json({ error: "A valid bucket name is required." });
  }
  if (!region || !isSupportedRegion(region)) {
    return res.status(400).json({ error: "A valid AWS region must be selected." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "A .zip file is required." });
  }

  try {
    const result = await uploadZipToBucket(bucketName, region, req.file.buffer);
    const response: UploadBuildResponse = result;
    return res.json(response);
  } catch (err: any) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({
      error: err?.message ?? "Could not upload the build to the bucket.",
    });
  }
});

router.post("/generate-yaml", (req, res) => {
  const body = req.body as Partial<GenerateYamlRequest>;
  const bucketName = (body.bucketName ?? "").trim();
  const region = body.region ?? "";
  const distributionId = (body.distributionId ?? "").trim();
  const buildDir = body.buildDir ?? "dist";
  const packageLockPath = body.packageLockPath ?? "package-lock.json";

  if (!bucketName || !region || !distributionId) {
    return res
      .status(400)
      .json({ error: "bucketName, region, and distributionId are required." });
  }

  const yaml = generateWorkflowYaml({
    bucketName,
    region,
    distributionId,
    buildDir,
    packageLockPath,
  });

  const response: GenerateYamlResponse = { yaml };
  return res.json(response);
});

export default router;
