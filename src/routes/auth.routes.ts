import { Router } from "express";
import {
  signUp,
  confirmSignUp,
  resendConfirmationCode,
  login,
  refreshTokens,
  forgotPassword,
  confirmForgotPassword,
  UsernameExistsException,
  CodeMismatchException,
  ExpiredCodeException,
  NotAuthorizedException,
  UserNotConfirmedException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
} from "../services/cognito.service";
import {
  SignUpRequest,
  SignUpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  ResendOtpRequest,
  ResendOtpResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ConfirmForgotPasswordRequest,
  ConfirmForgotPasswordResponse,
} from "../types";

const router = Router();

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignUpRequest'
 *     responses:
 *       201:
 *         description: Account created. A verification code was emailed to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignUpResponse'
 *       400:
 *         description: Missing email or password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: An account with this email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/signup", async (req, res) => {
  const body = req.body as Partial<SignUpRequest>;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim();

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  try {
    const result = await signUp(email, password, name);
    const response: SignUpResponse = {
      userSub: result.userSub,
      userConfirmed: result.userConfirmed,
      message: result.userConfirmed
        ? "Account created and confirmed."
        : "Account created. Check your email for a verification code.",
    };
    return res.status(201).json(response);
  } catch (err: any) {
    if (err instanceof UsernameExistsException) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not sign up." });
  }
});

/**
 * @openapi
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify the OTP sent to a user's email after signup
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOtpRequest'
 *     responses:
 *       200:
 *         description: Account verified successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Invalid or expired code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No account found for this email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/verify-otp", async (req, res) => {
  const body = req.body as Partial<VerifyOtpRequest>;
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();

  if (!email || !code) {
    return res.status(400).json({ error: "email and code are required." });
  }

  try {
    await confirmSignUp(email, code);
    const response: VerifyOtpResponse = { message: "Account verified successfully." };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof CodeMismatchException) {
      return res.status(400).json({ error: "Invalid verification code." });
    }
    if (err instanceof ExpiredCodeException) {
      return res.status(400).json({ error: "Verification code has expired. Request a new one." });
    }
    if (err instanceof UserNotFoundException) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not verify the code." });
  }
});

/**
 * @openapi
 * /api/auth/resend-otp:
 *   post:
 *     summary: Resend the signup verification code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResendOtpRequest'
 *     responses:
 *       200:
 *         description: Verification code resent.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: No account found for this email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/resend-otp", async (req, res) => {
  const body = req.body as Partial<ResendOtpRequest>;
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "email is required." });
  }

  try {
    await resendConfirmationCode(email);
    const response: ResendOtpResponse = { message: "Verification code resent." };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof UserNotFoundException) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not resend the code." });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login succeeded. Returns Cognito tokens.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenResponse'
 *       401:
 *         description: Incorrect email or password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account is not verified yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", async (req, res) => {
  const body = req.body as Partial<LoginRequest>;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  try {
    const result = await login(email, password);
    const response: LoginResponse = result;
    return res.json(response);
  } catch (err: any) {
    if (err instanceof UserNotConfirmedException) {
      return res.status(403).json({ error: "Account is not verified. Check your email for the code." });
    }
    if (err instanceof NotAuthorizedException) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    if (err instanceof UserNotFoundException) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not log in." });
  }
});

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     summary: Exchange a refresh token for a new access/ID token pair
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: New tokens issued.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenResponse'
 *       401:
 *         description: Refresh token is invalid or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/refresh-token", async (req, res) => {
  const body = req.body as Partial<RefreshTokenRequest>;
  const email = (body.email ?? "").trim().toLowerCase();
  const refreshToken = body.refreshToken ?? "";

  if (!email || !refreshToken) {
    return res.status(400).json({ error: "email and refreshToken are required." });
  }

  try {
    const result = await refreshTokens(refreshToken, email);
    const response: RefreshTokenResponse = result;
    return res.json(response);
  } catch (err: any) {
    if (err instanceof NotAuthorizedException) {
      return res.status(401).json({ error: "Refresh token is invalid or expired." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not refresh the session." });
  }
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Start a password reset (sends a code to the user's email)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Generic success message (does not reveal whether the account exists).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       429:
 *         description: Too many attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/forgot-password", async (req, res) => {
  const body = req.body as Partial<ForgotPasswordRequest>;
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "email is required." });
  }

  try {
    await forgotPassword(email);
    const response: ForgotPasswordResponse = {
      message: "If an account exists for this email, a password reset code has been sent.",
    };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof LimitExceededException) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }
    if (err instanceof UserNotFoundException) {
      const response: ForgotPasswordResponse = {
        message: "If an account exists for this email, a password reset code has been sent.",
      };
      return res.json(response);
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not start password reset." });
  }
});

/**
 * @openapi
 * /api/auth/confirm-forgot-password:
 *   post:
 *     summary: Complete a password reset using the emailed code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Invalid/expired code or password fails policy.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No account found for this email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/confirm-forgot-password", async (req, res) => {
  const body = req.body as Partial<ConfirmForgotPasswordRequest>;
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  const newPassword = body.newPassword ?? "";

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "email, code, and newPassword are required." });
  }

  try {
    await confirmForgotPassword(email, code, newPassword);
    const response: ConfirmForgotPasswordResponse = { message: "Password reset successfully." };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof CodeMismatchException) {
      return res.status(400).json({ error: "Invalid reset code." });
    }
    if (err instanceof ExpiredCodeException) {
      return res.status(400).json({ error: "Reset code has expired. Request a new one." });
    }
    if (err instanceof InvalidPasswordException) {
      return res.status(400).json({ error: "New password does not meet the password policy." });
    }
    if (err instanceof UserNotFoundException) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    console.error(err);
    return res.status(502).json({ error: err?.message ?? "Could not reset the password." });
  }
});

export default router;
