import { RequestHandler } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getCognitoConfig } from "../config/env";

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier) {
    const { userPoolId, clientId } = getCognitoConfig();
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });
  }
  return verifier;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        username: string;
        claims: Record<string, unknown>;
      };
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  try {
    const payload = await getVerifier().verify(token);
    req.user = {
      sub: payload.sub,
      username: (payload.username as string) ?? payload.sub,
      claims: payload,
    };
    return next();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Cognito is not configured")) {
      console.error(err.message);
      return res.status(500).json({ error: err.message });
    }
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
