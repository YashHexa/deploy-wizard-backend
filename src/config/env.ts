import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

export class MissingCredentialsError extends Error {
  constructor() {
    super(
      "AWS credentials are not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend/.env."
    );
    this.name = "MissingCredentialsError";
  }
}

export function getAwsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new MissingCredentialsError();
  }

  return { accessKeyId, secretAccessKey };
}

export const BASE_DOMAIN = process.env.BASE_DOMAIN || "hexacoder.co";
export const ROUTE53_HOSTED_ZONE_ID =
  process.env.ROUTE53_HOSTED_ZONE_ID || "Z01855462MMA24J2T5IDY";

export const COGNITO_REGION = process.env.COGNITO_REGION || "ap-south-1";
export const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
export const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? "";
export const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? "";

export function getCognitoConfig() {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
    throw new Error(
      "Cognito is not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID in backend/.env."
    );
  }

  return {
    region: COGNITO_REGION,
    userPoolId: COGNITO_USER_POOL_ID,
    clientId: COGNITO_CLIENT_ID,
    clientSecret: COGNITO_CLIENT_SECRET,
  };
}
