import { NextRequest, NextResponse } from "next/server";
import { generateWSToken } from "./token";
import { createErrorResponse } from "./utils";
import { WSTokenResponse, ErrorResponse } from "./types";

// Pure function to validate HTTP method
const validateMethod = (method: string) => {
  if (method !== "POST") {
    throw new Error("Method not allowed");
  }
};

// Pure function to create success response
const createTokenResponse = (tokenData: WSTokenResponse): NextResponse => {
  return NextResponse.json(tokenData, { status: 200 });
};

// Pure function to create error response
const createErrorResponseHandler = (
  message: string,
  status: number = 500
): NextResponse => {
  const errorResponse: ErrorResponse = createErrorResponse(
    message,
    "API_ERROR",
    status
  );
  return NextResponse.json(
    {
      error: errorResponse.error,
      code: errorResponse.code,
      timestamp: errorResponse.timestamp,
    },
    { status }
  );
};

// Main handler function using functional composition
export const createWSTokenHandler = () => {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Validate HTTP method
      validateMethod(request.method);

      // Generate WebSocket token
      const tokenResult = await generateWSToken();

      if (!tokenResult.success) {
        const { error } = tokenResult;
        return createErrorResponseHandler(error.message, 401);
      }

      // Return success response
      return createTokenResponse(tokenResult.data);
    } catch (error) {
      // Handle validation errors (like method not allowed)
      if (error instanceof Error && error.message === "Method not allowed") {
        return createErrorResponseHandler("Method not allowed", 405);
      }

      // Handle unexpected errors
      return createErrorResponseHandler("Internal server error", 500);
    }
  };
};

// Export the handler instance
export const POST = createWSTokenHandler();

// Helper function for users who want to customize the handler
export const createCustomWSTokenHandler = (
  customValidation?: (request: NextRequest) => Promise<void>
) => {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Validate HTTP method
      validateMethod(request.method);

      // Run custom validation if provided
      if (customValidation) {
        await customValidation(request);
      }

      // Generate WebSocket token
      const tokenResult = await generateWSToken();

      if (!tokenResult.success) {
        const { error } = tokenResult;
        return createErrorResponseHandler(error.message, 401);
      }

      // Return success response
      return createTokenResponse(tokenResult.data);
    } catch (error) {
      // Handle validation errors
      if (error instanceof Error && error.message === "Method not allowed") {
        return createErrorResponseHandler("Method not allowed", 405);
      }

      // Handle unexpected errors
      return createErrorResponseHandler(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  };
};

// Export types for user convenience
export type { WSTokenResponse, ErrorResponse };
