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
  getDistributionStatus,
} from "../services/cloudfront.service";
import {
  CreateBucketRequest,
  CreateBucketResponse,
  CloudFrontStatusResponse,
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

/**
 * @openapi
 * /api/deploy/create-bucket:
 *   post:
 *     summary: Create and configure an S3 bucket for static website hosting
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBucketRequest'
 *     responses:
 *       200:
 *         description: Bucket created and configured.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateBucketResponse'
 *       400:
 *         description: Invalid bucket name, region, or missing public access block settings.
 *       401:
 *         description: Missing or invalid access token.
 *       409:
 *         description: Bucket name is already taken.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateBucketResponse'
 */
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

/**
 * @openapi
 * /api/deploy/create-cloudfront:
 *   post:
 *     summary: Create a CloudFront distribution in front of a bucket
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCloudFrontRequest'
 *     responses:
 *       200:
 *         description: Distribution created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateCloudFrontResponse'
 *       400:
 *         description: Invalid bucket name or region.
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/deploy/find-cloudfront:
 *   get:
 *     summary: Find an existing CloudFront distribution for a bucket
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Matching distribution, or nulls if none found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FindCloudFrontResponse'
 *       400:
 *         description: Invalid bucket name or region.
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/deploy/cloudfront-status/{distributionId}:
 *   get:
 *     summary: Check whether a CloudFront distribution has finished deploying
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: distributionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current distribution status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CloudFrontStatusResponse'
 *       400:
 *         description: Missing distribution id.
 *       401:
 *         description: Missing or invalid access token.
 */
router.get("/cloudfront-status/:distributionId", async (req, res) => {
  const distributionId = String(req.params.distributionId ?? "").trim();

  if (!distributionId) {
    return res.status(400).json({ error: "A distribution id is required." });
  }

  try {
    const result = await getDistributionStatus(distributionId);
    const response: CloudFrontStatusResponse = {
      ...result,
      deployed: result.status === "Deployed",
    };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({
      error: err?.message ?? "Could not check the CloudFront distribution status.",
    });
  }
});

/**
 * @openapi
 * /api/deploy/upload-build:
 *   post:
 *     summary: Upload a zipped build to the target bucket
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [bucketName, region, file]
 *             properties:
 *               bucketName:
 *                 type: string
 *               region:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload result.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadBuildResponse'
 *       400:
 *         description: Invalid bucket name, region, or missing file.
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/deploy/generate-yaml:
 *   post:
 *     summary: Generate a GitHub Actions workflow YAML for CI/CD deployment
 *     tags: [Deploy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateYamlRequest'
 *     responses:
 *       200:
 *         description: Generated YAML.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateYamlResponse'
 *       400:
 *         description: bucketName, region, and distributionId are required.
 *       401:
 *         description: Missing or invalid access token.
 */
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
