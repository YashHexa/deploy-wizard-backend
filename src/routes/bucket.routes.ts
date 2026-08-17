import { Router } from "express";
import { validateBucketNameFormat } from "../utils/validateBucketName";
import { isSupportedRegion } from "../utils/regions";
import {
  checkBucketAvailability,
  listBuckets,
  getBucketRegion,
  getWebsiteEndpoint,
} from "../services/s3.service";
import { MissingCredentialsError } from "../config/env";
import {
  ValidateBucketNameRequest,
  ValidateBucketNameResponse,
  ListBucketsResponse,
  GetBucketRegionResponse,
  WebsiteEndpointResponse,
} from "../types";

const router = Router();

router.post("/validate-name", async (req, res) => {
  const body = req.body as Partial<ValidateBucketNameRequest>;
  const bucketName = (body.bucketName ?? "").trim().toLowerCase();
  const region = body.region ?? "";

  const errors = validateBucketNameFormat(bucketName);

  if (!region || !isSupportedRegion(region)) {
    errors.push("A valid AWS region must be selected.");
  }

  if (errors.length > 0) {
    const response: ValidateBucketNameResponse = {
      valid: false,
      available: null,
      errors,
      reason: null,
    };
    return res.json(response);
  }

  try {
    const availability = await checkBucketAvailability(bucketName, region);
    const response: ValidateBucketNameResponse = {
      valid: true,
      available: availability === "available",
      errors: [],
      reason:
        availability === "taken"
          ? "This bucket name is already taken by another AWS account."
          : availability === "owned-by-you"
            ? "You already own a bucket with this name."
            : null,
    };
    return res.json(response);
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ valid: true, available: null, errors: [], reason: err.message });
    }
    console.error(err);
    return res.status(500).json({
      valid: true,
      available: null,
      errors: [],
      reason: "Could not check bucket availability against AWS.",
    });
  }
});

router.get("/list", async (_req, res) => {
  try {
    const buckets = await listBuckets();
    const response: ListBucketsResponse = { buckets };
    return res.json(response);
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({ error: "Could not list buckets from AWS." });
  }
});

router.get("/:name/region", async (req, res) => {
  const bucketName = req.params.name;
  try {
    const region = await getBucketRegion(bucketName);
    const response: GetBucketRegionResponse = { region };
    return res.json(response);
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return res.status(500).json({ error: err.message });
    }
    console.error(err);
    return res.status(502).json({ error: `Could not determine the region for "${bucketName}".` });
  }
});

router.get("/website-endpoint", (req, res) => {
  const bucketName = String(req.query.bucketName ?? "");
  const region = String(req.query.region ?? "");

  if (!bucketName || !region || !isSupportedRegion(region)) {
    return res.status(400).json({ error: "bucketName and a valid region are required." });
  }

  const response: WebsiteEndpointResponse = {
    websiteEndpoint: getWebsiteEndpoint(bucketName, region),
  };
  return res.json(response);
});

export default router;
