import AdmZip from "adm-zip";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  ListBucketsCommand,
  GetBucketLocationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getAwsCredentials } from "../config/env";
import { BucketSummary, PublicAccessBlockSettings } from "../types";
import { getS3WebsiteEndpoint } from "../utils/regions";
import { getContentType } from "../utils/contentType";

function buildS3Client(region: string): S3Client {
  const credentials = getAwsCredentials();
  return new S3Client({ region, credentials });
}

export type BucketAvailability = "available" | "owned-by-you" | "taken";

export async function checkBucketAvailability(
  bucketName: string,
  region: string
): Promise<BucketAvailability> {
  const client = buildS3Client(region);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return "owned-by-you";
  } catch (err: any) {
    const statusCode = err?.$metadata?.httpStatusCode;
    if (statusCode === 404) {
      return "available";
    }
    if (statusCode === 403) {
      return "taken";
    }
    throw err;
  }
}

export async function createBucket(bucketName: string, region: string): Promise<void> {
  const client = buildS3Client(region);
  await client.send(
    new CreateBucketCommand({
      Bucket: bucketName,
      // us-east-1 rejects an explicit LocationConstraint matching itself.
      CreateBucketConfiguration:
        region === "us-east-1" ? undefined : { LocationConstraint: region as any },
    })
  );
}

export async function setPublicAccessBlock(
  bucketName: string,
  region: string,
  settings: PublicAccessBlockSettings
): Promise<void> {
  const client = buildS3Client(region);
  await client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: settings.blockPublicAcls,
        IgnorePublicAcls: settings.ignorePublicAcls,
        BlockPublicPolicy: settings.blockPublicPolicy,
        RestrictPublicBuckets: settings.restrictPublicBuckets,
      },
    })
  );
}

export async function setPublicReadPolicy(bucketName: string, region: string): Promise<void> {
  const client = buildS3Client(region);
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${bucketName}/*`,
      },
    ],
  };
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(policy),
    })
  );
}

export async function enableStaticWebsiteHosting(
  bucketName: string,
  region: string
): Promise<void> {
  const client = buildS3Client(region);
  await client.send(
    new PutBucketWebsiteCommand({
      Bucket: bucketName,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "index.html" },
      },
    })
  );
}

export function getWebsiteEndpoint(bucketName: string, region: string): string {
  return getS3WebsiteEndpoint(bucketName, region);
}

export async function listBuckets(): Promise<BucketSummary[]> {
  const client = buildS3Client("us-east-1");
  const result = await client.send(new ListBucketsCommand({}));
  return (result.Buckets ?? [])
    .filter((b): b is { Name: string; CreationDate?: Date } => Boolean(b.Name))
    .map((b) => ({
      name: b.Name!,
      creationDate: b.CreationDate ? b.CreationDate.toISOString() : null,
    }));
}

export async function getBucketRegion(bucketName: string): Promise<string> {
  const client = buildS3Client("us-east-1");
  const result = await client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
  const location = result.LocationConstraint;
  if (!location) return "us-east-1";
  // Legacy API quirk: the EU region is reported as "EU" instead of "eu-west-1".
  if ((location as string) === "EU") return "eu-west-1";
  return location as string;
}

/**
 * Strips a single shared top-level directory from zip entry paths when every
 * entry lives under it (e.g. a zip of a "dist/" folder), so uploaded keys
 * mirror the build output root rather than nesting under "dist/".
 */
function stripCommonRootDir(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const firstSlashIndex = paths[0].indexOf("/");
  if (firstSlashIndex === -1) return paths;
  const candidateRoot = paths[0].slice(0, firstSlashIndex + 1);
  const allShareRoot = paths.every((p) => p.startsWith(candidateRoot));
  if (!allShareRoot) return paths;
  return paths.map((p) => p.slice(candidateRoot.length));
}

export interface UploadOutcome {
  uploadedCount: number;
  failedFiles: string[];
}

export async function uploadZipToBucket(
  bucketName: string,
  region: string,
  zipBuffer: Buffer
): Promise<UploadOutcome> {
  const client = buildS3Client(region);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  const keys = stripCommonRootDir(entries.map((e) => e.entryName));

  const failedFiles: string[] = [];
  let uploadedCount = 0;

  await Promise.all(
    entries.map(async (entry, index) => {
      const key = keys[index];
      if (!key) return;
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: entry.getData(),
            ContentType: getContentType(key),
          })
        );
        uploadedCount += 1;
      } catch {
        failedFiles.push(key);
      }
    })
  );

  return { uploadedCount, failedFiles };
}
