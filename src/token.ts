import {
  Result,
  Ok,
  Err,
  WSToken,
  ValidatedApiKey,
  VocalsError,
} from "./types";
import { getEnvVar, validate } from "./utils";
import jwt from "jsonwebtoken";

// Constants
const VOCALS_WS_ENDPOINT = "wss://api.vocals.dev/v1/stream/conversation";
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const API_KEY_MIN_LENGTH = 32;

// Pure functions for API key validation
export const validateApiKeyFormat = (
  apiKey: string
): Result<ValidatedApiKey, VocalsError> => {
  const result = validate(
    (key: string) =>
      key.length >= API_KEY_MIN_LENGTH && key.startsWith("vdev_"),
    'Invalid API key format. Must be at least 32 characters and start with "vdev_"'
  )(apiKey);
  console.log("result", result);
  return result;
};

export const getVocalsApiKey = (): Result<string, VocalsError> =>
  getEnvVar("VOCALS_DEV_API_KEY");

// JWT token generation with userId
export const generateWSTokenFromApiKey = async (
  apiKey: ValidatedApiKey,
  userId?: string
): Promise<Result<WSToken, VocalsError>> => {
  try {
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    const expiresIn = Math.floor(TOKEN_EXPIRY_MS / 1000); // Convert to seconds for JWT

    // Create JWT payload with userId if provided
    const payload: Record<string, any> = {
      apiKey: apiKey.substring(0, 8) + "...", // Only include partial key for security
    };

    if (userId) {
      payload.userId = userId;
    }

    // Use the API key as the JWT secret (in production, use a dedicated JWT secret)
    // Let JWT library handle the exp claim via expiresIn option
    const token = jwt.sign(payload, apiKey, {
      algorithm: "HS256",
      expiresIn: `${expiresIn}s`,
    });

    return Ok({
      token,
      expiresAt,
    });
  } catch (error) {
    return Err({
      message: `Failed to generate WebSocket token: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      code: "TOKEN_GENERATION_FAILED",
      timestamp: Date.now(),
    });
  }
};

// Composed token generation pipeline
export const generateWSToken = async (): Promise<
  Result<WSToken, VocalsError>
> => {
  const apiKeyResult = getVocalsApiKey();

  if (!apiKeyResult.success) {
    return apiKeyResult;
  }

  const validatedApiKeyResult = validateApiKeyFormat(apiKeyResult.data);

  if (!validatedApiKeyResult.success) {
    return validatedApiKeyResult;
  }

  return await generateWSTokenFromApiKey(validatedApiKeyResult.data);
};

// Composed token generation pipeline with userId
export const generateWSTokenWithUserId = async (
  userId: string
): Promise<Result<WSToken, VocalsError>> => {
  const apiKeyResult = getVocalsApiKey();

  if (!apiKeyResult.success) {
    return apiKeyResult;
  }

  const validatedApiKeyResult = validateApiKeyFormat(apiKeyResult.data);

  if (!validatedApiKeyResult.success) {
    return validatedApiKeyResult;
  }

  return await generateWSTokenFromApiKey(validatedApiKeyResult.data, userId);
};

// Utility to check if token is expired
export const isTokenExpired = (token: WSToken): boolean =>
  Date.now() > token.expiresAt;

// Utility to get token TTL in seconds
export const getTokenTTL = (token: WSToken): number =>
  Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000));

// Utility to decode JWT token and extract userId
export const decodeWSToken = (
  token: string,
  apiKey: string
): Result<{ userId?: string } & Record<string, any>, VocalsError> => {
  try {
    const decoded = jwt.verify(token, apiKey) as Record<string, any>;
    return Ok(decoded);
  } catch (error) {
    return Err({
      message: `Failed to decode WebSocket token: ${
        error instanceof Error ? error.message : "Invalid token"
      }`,
      code: "TOKEN_DECODE_FAILED",
      timestamp: Date.now(),
    });
  }
};

// Configuration getters
export const getWSEndpoint = (): string => VOCALS_WS_ENDPOINT;
export const getTokenExpiryMs = (): number => TOKEN_EXPIRY_MS;
