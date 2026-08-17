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
