import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  ListDistributionsCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { getAwsCredentials } from "../config/env";
import { getS3WebsiteEndpoint } from "../utils/regions";

// AWS managed "CachingOptimized" cache policy id (same across all accounts/regions).
const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

function buildCloudFrontClient(): CloudFrontClient {
  const credentials = getAwsCredentials();
  // CloudFront is a global service; the API itself is only reachable via us-east-1.
  return new CloudFrontClient({ region: "us-east-1", credentials });
}

export interface CreateDistributionResult {
  distributionId: string;
  domainName: string;
  status: string;
}

export async function createDistributionForBucket(
  bucketName: string,
  region: string
): Promise<CreateDistributionResult> {
  const client = buildCloudFrontClient();
  const websiteEndpoint = getS3WebsiteEndpoint(bucketName, region);
  const originId = `S3Website-${bucketName}`;
  const callerReference = `${bucketName}-${Date.now()}`;

  const result = await client.send(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: callerReference,
        Comment: bucketName,
        Enabled: true,
        PriceClass: "PriceClass_100",
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: originId,
              DomainName: websiteEndpoint,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "http-only",
                OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: originId,
          ViewerProtocolPolicy: "redirect-to-https",
          AllowedMethods: {
            Quantity: 2,
            Items: ["GET", "HEAD"],
            CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
          },
          Compress: true,
          CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
        },
      },
    })
  );

  const distribution = result.Distribution;
  if (!distribution || !distribution.Id || !distribution.DomainName) {
    throw new Error("CloudFront did not return a distribution.");
  }

  return {
    distributionId: distribution.Id,
    domainName: distribution.DomainName,
    status: distribution.Status ?? "InProgress",
  };
}

/**
 * Looks for a CloudFront distribution whose origin already points at this
 * bucket's website endpoint, so an existing bucket that's already fronted by
 * CloudFront doesn't get a duplicate distribution. Only scans the first page
 * of distributions (up to 100) - sufficient for the accounts this tool
 * targets.
 */
export async function findDistributionForBucket(
  bucketName: string,
  region: string
): Promise<CreateDistributionResult | null> {
  const client = buildCloudFrontClient();
  const websiteEndpoint = getS3WebsiteEndpoint(bucketName, region);

  const result = await client.send(new ListDistributionsCommand({ MaxItems: 100 }));
  const items = result.DistributionList?.Items ?? [];

  const match = items.find((item) =>
    (item.Origins?.Items ?? []).some((origin) => origin.DomainName === websiteEndpoint)
  );

  if (!match || !match.Id || !match.DomainName) return null;

  return {
    distributionId: match.Id,
    domainName: match.DomainName,
    status: match.Status ?? "Unknown",
  };
}

/**
 * Fetches the current status of a distribution so callers can poll for
 * "Deployed" before telling the user the CloudFront link is ready.
 */
export async function getDistributionStatus(
  distributionId: string
): Promise<CreateDistributionResult> {
  const client = buildCloudFrontClient();
  const result = await client.send(
    new GetDistributionCommand({ Id: distributionId })
  );

  const distribution = result.Distribution;
  if (!distribution || !distribution.Id || !distribution.DomainName) {
    throw new Error("CloudFront did not return a distribution.");
  }

  return {
    distributionId: distribution.Id,
    domainName: distribution.DomainName,
    status: distribution.Status ?? "Unknown",
  };
}

/**
 * Attaches a custom domain (CNAME) and its matching ACM certificate to an
 * existing distribution. Idempotent - re-running for a domain that's already
 * attached just leaves the alias list unchanged.
 */
export async function addDomainToDistribution(
  distributionId: string,
  domain: string,
  certificateArn: string
): Promise<CreateDistributionResult> {
  const client = buildCloudFrontClient();

  const current = await client.send(
    new GetDistributionConfigCommand({ Id: distributionId })
  );
  const config = current.DistributionConfig;
  const etag = current.ETag;
  if (!config || !etag) {
    throw new Error("Could not read the current CloudFront distribution configuration.");
  }

  const existingAliases = config.Aliases?.Items ?? [];
  const aliases = existingAliases.includes(domain)
    ? existingAliases
    : [...existingAliases, domain];

  config.Aliases = { Quantity: aliases.length, Items: aliases };
  config.ViewerCertificate = {
    ACMCertificateArn: certificateArn,
    SSLSupportMethod: "sni-only",
    MinimumProtocolVersion: "TLSv1.2_2021",
  };

  const result = await client.send(
    new UpdateDistributionCommand({
      Id: distributionId,
      IfMatch: etag,
      DistributionConfig: config,
    })
  );

  const distribution = result.Distribution;
  if (!distribution || !distribution.Id || !distribution.DomainName) {
    throw new Error("CloudFront did not return an updated distribution.");
  }

  return {
    distributionId: distribution.Id,
    domainName: distribution.DomainName,
    status: distribution.Status ?? "InProgress",
  };
}
