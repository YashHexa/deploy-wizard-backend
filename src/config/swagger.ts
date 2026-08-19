import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import { PORT } from "./env";

function globPath(...segments: string[]) {
  return path.join(...segments).split(path.sep).join("/");
}

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Deploy Wizard Backend API",
      version: "1.0.0",
      description:
        "API for authenticating users (AWS Cognito) and provisioning S3 + CloudFront static site deployments.",
    },
    servers: [{ url: `http://localhost:${PORT}`, description: "Local server" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Cognito access token, e.g. `Authorization: Bearer <accessToken>`",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        SignUpRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
            name: { type: "string" },
          },
        },
        SignUpResponse: {
          type: "object",
          properties: {
            userSub: { type: "string" },
            userConfirmed: { type: "boolean" },
            message: { type: "string" },
          },
        },
        VerifyOtpRequest: {
          type: "object",
          required: ["email", "code"],
          properties: {
            email: { type: "string", format: "email" },
            code: { type: "string" },
          },
        },
        MessageResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
        ResendOtpRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
          },
        },
        TokenResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            idToken: { type: "string" },
            refreshToken: { type: "string" },
            expiresIn: { type: "integer" },
          },
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["email", "refreshToken"],
          properties: {
            email: { type: "string", format: "email" },
            refreshToken: { type: "string" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
        ConfirmForgotPasswordRequest: {
          type: "object",
          required: ["email", "code", "newPassword"],
          properties: {
            email: { type: "string", format: "email" },
            code: { type: "string" },
            newPassword: { type: "string", format: "password" },
          },
        },
        PublicAccessBlockSettings: {
          type: "object",
          required: [
            "blockPublicAcls",
            "ignorePublicAcls",
            "blockPublicPolicy",
            "restrictPublicBuckets",
          ],
          properties: {
            blockPublicAcls: { type: "boolean" },
            ignorePublicAcls: { type: "boolean" },
            blockPublicPolicy: { type: "boolean" },
            restrictPublicBuckets: { type: "boolean" },
          },
        },
        ValidateBucketNameRequest: {
          type: "object",
          required: ["bucketName", "region"],
          properties: {
            bucketName: { type: "string" },
            region: { type: "string" },
          },
        },
        ValidateBucketNameResponse: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            available: { type: "boolean", nullable: true },
            errors: { type: "array", items: { type: "string" } },
            reason: { type: "string", nullable: true },
          },
        },
        BucketSummary: {
          type: "object",
          properties: {
            name: { type: "string" },
            creationDate: { type: "string", format: "date-time", nullable: true },
          },
        },
        ListBucketsResponse: {
          type: "object",
          properties: {
            buckets: { type: "array", items: { $ref: "#/components/schemas/BucketSummary" } },
          },
        },
        GetBucketRegionResponse: {
          type: "object",
          properties: {
            region: { type: "string" },
          },
        },
        WebsiteEndpointResponse: {
          type: "object",
          properties: {
            websiteEndpoint: { type: "string" },
          },
        },
        StepResult: {
          type: "object",
          properties: {
            step: { type: "string" },
            ok: { type: "boolean" },
            message: { type: "string" },
          },
        },
        CreateBucketRequest: {
          type: "object",
          required: ["bucketName", "region", "publicAccessBlock", "acknowledged"],
          properties: {
            bucketName: { type: "string" },
            region: { type: "string" },
            publicAccessBlock: { $ref: "#/components/schemas/PublicAccessBlockSettings" },
            acknowledged: { type: "boolean" },
          },
        },
        CreateBucketResponse: {
          type: "object",
          properties: {
            steps: { type: "array", items: { $ref: "#/components/schemas/StepResult" } },
            websiteEndpoint: { type: "string", nullable: true },
            success: { type: "boolean" },
            error: { type: "string" },
            code: { type: "string" },
          },
        },
        CreateCloudFrontRequest: {
          type: "object",
          required: ["bucketName", "region"],
          properties: {
            bucketName: { type: "string" },
            region: { type: "string" },
          },
        },
        CreateCloudFrontResponse: {
          type: "object",
          properties: {
            distributionId: { type: "string" },
            domainName: { type: "string" },
            status: { type: "string" },
          },
        },
        FindCloudFrontResponse: {
          type: "object",
          properties: {
            distributionId: { type: "string", nullable: true },
            domainName: { type: "string", nullable: true },
            status: { type: "string", nullable: true },
          },
        },
        UploadBuildResponse: {
          type: "object",
          properties: {
            uploadedCount: { type: "integer" },
            failedFiles: { type: "array", items: { type: "string" } },
          },
        },
        GenerateYamlRequest: {
          type: "object",
          required: ["bucketName", "region", "distributionId"],
          properties: {
            bucketName: { type: "string" },
            region: { type: "string" },
            distributionId: { type: "string" },
            buildDir: { type: "string", default: "dist" },
            packageLockPath: { type: "string", default: "package-lock.json" },
          },
        },
        GenerateYamlResponse: {
          type: "object",
          properties: {
            yaml: { type: "string" },
          },
        },
      },
    },
  },
  apis: [
    globPath(__dirname, "../routes/*.ts"),
    globPath(__dirname, "../routes/*.js"),
    globPath(__dirname, "../index.ts"),
    globPath(__dirname, "../index.js"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
