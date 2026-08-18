export interface PublicAccessBlockSettings {
  blockPublicAcls: boolean;
  ignorePublicAcls: boolean;
  blockPublicPolicy: boolean;
  restrictPublicBuckets: boolean;
}

export interface ValidateBucketNameRequest {
  bucketName: string;
  region: string;
}

export interface ValidateBucketNameResponse {
  valid: boolean;
  available: boolean | null;
  errors: string[];
  reason: string | null;
}

export interface CreateBucketRequest {
  bucketName: string;
  region: string;
  publicAccessBlock: PublicAccessBlockSettings;
  acknowledged: boolean;
}

export interface StepResult {
  step: string;
  ok: boolean;
  message?: string;
}

export interface CreateBucketResponse {
  steps: StepResult[];
  websiteEndpoint: string | null;
  success: boolean;
  error?: string;
  code?: string;
}

export interface CreateCloudFrontRequest {
  bucketName: string;
  region: string;
}

export interface CreateCloudFrontResponse {
  distributionId: string;
  domainName: string;
  status: string;
}

export interface GenerateYamlRequest {
  bucketName: string;
  region: string;
  distributionId: string;
  buildDir: string;
  packageLockPath: string;
}

export interface GenerateYamlResponse {
  yaml: string;
}

export interface BucketSummary {
  name: string;
  creationDate: string | null;
}

export interface ListBucketsResponse {
  buckets: BucketSummary[];
}

export interface GetBucketRegionResponse {
  region: string;
}

export interface WebsiteEndpointResponse {
  websiteEndpoint: string;
}

export interface FindCloudFrontResponse {
  distributionId: string | null;
  domainName: string | null;
  status: string | null;
}

export interface UploadBuildResponse {
  uploadedCount: number;
  failedFiles: string[];
}
