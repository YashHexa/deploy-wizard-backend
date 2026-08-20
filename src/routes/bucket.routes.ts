import { Router } from "express";
import { validateBucketNameFormat } from "../utils/validateBucketName";
import { isSupportedRegion, SUPPORTED_REGIONS } from "../utils/regions";
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
  ListRegionsResponse,
} from "../types";

const router = Router();

/**
 * @openapi
 * /api/bucket/regions:
 *   get:
 *     summary: List the AWS regions available for bucket creation
 *     tags: [Bucket]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supported regions.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListRegionsResponse'
 */
router.get("/regions", (_req, res) => {
  const response: ListRegionsResponse = { regions: SUPPORTED_REGIONS };
  return res.json(response);
});

/**
 * @openapi
 * /api/bucket/validate-name:
 *   post:
 *     summary: Validate an S3 bucket name and check availability
 *     tags: [Bucket]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ValidateBucketNameRequest'
 *     responses:
 *       200:
 *         description: Validation result.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidateBucketNameResponse'
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/bucket/list:
 *   get:
 *     summary: List S3 buckets in the AWS account
 *     tags: [Bucket]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of buckets.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListBucketsResponse'
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/bucket/{name}/region:
 *   get:
 *     summary: Get the AWS region a bucket lives in
 *     tags: [Bucket]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bucket region.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetBucketRegionResponse'
 *       401:
 *         description: Missing or invalid access token.
 */
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

/**
 * @openapi
 * /api/bucket/website-endpoint:
 *   get:
 *     summary: Compute the static website endpoint URL for a bucket/region
 *     tags: [Bucket]
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
 *         description: Website endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebsiteEndpointResponse'
 *       400:
 *         description: bucketName and a valid region are required.
 *       401:
 *         description: Missing or invalid access token.
 */
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
