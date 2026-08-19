import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  NotAuthorizedException,
  UsernameExistsException,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotConfirmedException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
} from "@aws-sdk/client-cognito-identity-provider";
import { getCognitoConfig } from "../config/env";

export {
  NotAuthorizedException,
  UsernameExistsException,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotConfirmedException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
};

let client: CognitoIdentityProviderClient | null = null;

function getClient() {
  if (!client) {
    const { region } = getCognitoConfig();
    client = new CognitoIdentityProviderClient({ region });
  }
  return client;
}

function getSecretHash(username: string) {
  const { clientId, clientSecret } = getCognitoConfig();
  if (!clientSecret) {
    return undefined;
  }
  return crypto
    .createHmac("sha256", clientSecret)
    .update(username + clientId)
    .digest("base64");
}

export interface SignUpResult {
  userSub: string;
  userConfirmed: boolean;
}

export async function signUp(
  email: string,
  password: string,
  name?: string
): Promise<SignUpResult> {
  const { clientId } = getCognitoConfig();

  const userAttributes = [{ Name: "email", Value: email }];
  if (name) {
    userAttributes.push({ Name: "name", Value: name });
  }

  const result = await getClient().send(
    new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      SecretHash: getSecretHash(email),
      UserAttributes: userAttributes,
    })
  );

  return {
    userSub: result.UserSub ?? "",
    userConfirmed: result.UserConfirmed ?? false,
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const { clientId } = getCognitoConfig();

  await getClient().send(
    new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      SecretHash: getSecretHash(email),
    })
  );
}

export async function resendConfirmationCode(email: string): Promise<void> {
  const { clientId } = getCognitoConfig();

  await getClient().send(
    new ResendConfirmationCodeCommand({
      ClientId: clientId,
      Username: email,
      SecretHash: getSecretHash(email),
    })
  );
}

export interface LoginResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { clientId } = getCognitoConfig();

  const authParameters: Record<string, string> = {
    USERNAME: email,
    PASSWORD: password,
  };
  const secretHash = getSecretHash(email);
  if (secretHash) {
    authParameters.SECRET_HASH = secretHash;
  }

  const result = await getClient().send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: authParameters,
    })
  );

  const authResult = result.AuthenticationResult;
  if (!authResult?.AccessToken || !authResult.IdToken || !authResult.RefreshToken) {
    throw new Error("Cognito did not return authentication tokens.");
  }

  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken,
    expiresIn: authResult.ExpiresIn ?? 3600,
  };
}

export async function forgotPassword(email: string): Promise<void> {
  const { clientId } = getCognitoConfig();

  await getClient().send(
    new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      SecretHash: getSecretHash(email),
    })
  );
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const { clientId } = getCognitoConfig();

  await getClient().send(
    new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
      SecretHash: getSecretHash(email),
    })
  );
}

export async function refreshTokens(refreshToken: string, username: string): Promise<LoginResult> {
  const { clientId } = getCognitoConfig();

  const authParameters: Record<string, string> = {
    REFRESH_TOKEN: refreshToken,
  };
  const secretHash = getSecretHash(username);
  if (secretHash) {
    authParameters.SECRET_HASH = secretHash;
  }

  const result = await getClient().send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: authParameters,
    })
  );

  const authResult = result.AuthenticationResult;
  if (!authResult?.AccessToken || !authResult.IdToken) {
    throw new Error("Cognito did not return authentication tokens.");
  }

  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken ?? refreshToken,
    expiresIn: authResult.ExpiresIn ?? 3600,
  };
}
