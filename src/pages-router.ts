import { NextApiRequest, NextApiResponse } from "next";
import { generateWSToken } from "./token";
import { createErrorResponse } from "./utils";
import { WSTokenResponse, ErrorResponse } from "./types";

// Pure function to validate HTTP method
const validateMethod = (method: string | undefined) => {
  if (method !== "POST") {
    throw new Error("Method not allowed");
  }
};

// Pure function to create success response
const sendTokenResponse = (
  res: NextApiResponse,
  tokenData: WSTokenResponse
): void => {
  res.status(200).json(tokenData);
};

// Pure function to create error response
const sendErrorResponse = (
  res: NextApiResponse,
  message: string,
  status: number = 500
): void => {
  const errorResponse: ErrorResponse = createErrorResponse(
    message,
    "API_ERROR",
    status
  );
  res.status(status).json({
    error: errorResponse.error,
    code: errorResponse.code,
    timestamp: errorResponse.timestamp,
  });
};

// Main handler function using functional composition
export const createWSTokenHandler = () => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    try {
      // Validate HTTP method
      validateMethod(req.method);

      // Generate WebSocket token
      const tokenResult = await generateWSToken();

      if (!tokenResult.success) {
        return sendErrorResponse(res, (tokenResult as any).error.message, 401);
      }

      // Return success response
      return sendTokenResponse(res, tokenResult.data);
    } catch (error) {
      // Handle validation errors (like method not allowed)
      if (error instanceof Error && error.message === "Method not allowed") {
        return sendErrorResponse(res, "Method not allowed", 405);
      }

      // Handle unexpected errors
      return sendErrorResponse(res, "Internal server error", 500);
    }
  };
};

// Export the default handler
const handler = createWSTokenHandler();
export default handler;

// Helper function for users who want to customize the handler
export const createCustomWSTokenHandler = (
  customValidation?: (req: NextApiRequest) => Promise<void>
) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    try {
      // Validate HTTP method
      validateMethod(req.method);

      // Run custom validation if provided
      if (customValidation) {
        await customValidation(req);
      }

      // Generate WebSocket token
      const tokenResult = await generateWSToken();

      if (!tokenResult.success) {
        return sendErrorResponse(res, (tokenResult as any).error.message, 401);
      }

      // Return success response
      return sendTokenResponse(res, tokenResult.data);
    } catch (error) {
      // Handle validation errors
      if (error instanceof Error && error.message === "Method not allowed") {
        return sendErrorResponse(res, "Method not allowed", 405);
      }

      // Handle unexpected errors
      return sendErrorResponse(
        res,
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  };
};

// Export types for user convenience
export type { WSTokenResponse, ErrorResponse };
