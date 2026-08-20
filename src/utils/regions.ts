export interface RegionOption {
  code: string;
  label: string;
}

export const SUPPORTED_REGIONS: RegionOption[] = [
  { code: "ap-south-1", label: "Asia Pacific (Mumbai)" },
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
