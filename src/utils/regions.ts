export interface RegionOption {
  code: string;
  label: string;
}

export const SUPPORTED_REGIONS: RegionOption[] = [
  { code: "us-east-1", label: "US East (N. Virginia)" },
  { code: "us-east-2", label: "US East (Ohio)" },
  { code: "us-west-1", label: "US West (N. California)" },
  { code: "us-west-2", label: "US West (Oregon)" },
  { code: "ca-central-1", label: "Canada (Central)" },
  { code: "eu-west-1", label: "Europe (Ireland)" },
  { code: "eu-west-2", label: "Europe (London)" },
  { code: "eu-west-3", label: "Europe (Paris)" },
  { code: "eu-central-1", label: "Europe (Frankfurt)" },
  { code: "eu-north-1", label: "Europe (Stockholm)" },
  { code: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { code: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { code: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
  { code: "sa-east-1", label: "South America (Sao Paulo)" },
];

/**
 * Regions where S3 website endpoints use the "s3-website.<region>" (dot)
 * format instead of the legacy "s3-website-<region>" (hyphen) format.
 * AWS introduced the dot form for regions launched after ~2014; this list
 * covers the regions offered above and is safe to extend.
 */
const DOT_STYLE_WEBSITE_ENDPOINT_REGIONS = new Set([
  "eu-central-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ca-central-1",
]);

export function getS3WebsiteEndpoint(bucketName: string, region: string): string {
  const separator = DOT_STYLE_WEBSITE_ENDPOINT_REGIONS.has(region) ? "." : "-";
  return `${bucketName}.s3-website${separator}${region}.amazonaws.com`;
}

export function isSupportedRegion(region: string): boolean {
  return SUPPORTED_REGIONS.some((r) => r.code === region);
}
