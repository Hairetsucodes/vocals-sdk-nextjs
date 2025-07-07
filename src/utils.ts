import { Result, Ok, Err, VocalsError } from "./types";

// Functional composition utilities
export const pipe =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduce((acc, fn) => fn(acc), value);

export const compose =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduceRight((acc, fn) => fn(acc), value);

// Result utility functions
export const map =
  <T, U, E>(fn: (value: T) => U) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? Ok(fn(result.data)) : result;

export const flatMap =
  <T, U, E>(fn: (value: T) => Result<U, E>) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? fn(result.data) : result;

export const mapError =
  <T, E1, E2>(fn: (error: E1) => E2) =>
  (result: Result<T, E1>): Result<T, E2> =>
    result.success ? result : Err(fn(result.error));

// Async versions
export const asyncMap =
  <T, U, E>(fn: (value: T) => Promise<U>) =>
  async (result: Result<T, E>): Promise<Result<U, E>> =>
    result.success ? Ok(await fn(result.data)) : result;

export const asyncFlatMap =
  <T, U, E>(fn: (value: T) => Promise<Result<U, E>>) =>
  async (result: Result<T, E>): Promise<Result<U, E>> =>
    result.success ? await fn(result.data) : result;

// Validation utilities
export const validate =
  <T>(predicate: (value: T) => boolean, errorMessage: string) =>
  (value: T): Result<T, VocalsError> =>
    predicate(value)
      ? Ok(value)
      : Err({
          message: errorMessage,
          code: "VALIDATION_ERROR",
          timestamp: Date.now(),
        });

// Environment variable utilities
export const getEnvVar = (name: string): Result<string, VocalsError> => {
  const value = process.env[name];
  return value
    ? Ok(value)
    : Err({
        message: `Environment variable ${name} is not set`,
        code: "ENV_VAR_MISSING",
        timestamp: Date.now(),
      });
};

// Safe JSON parsing
export const safeJsonParse = <T>(
  jsonString: string
): Result<T, VocalsError> => {
  try {
    const parsed = JSON.parse(jsonString);
    return Ok(parsed);
  } catch (error) {
    return Err({
      message: `Invalid JSON: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      code: "JSON_PARSE_ERROR",
      timestamp: Date.now(),
    });
  }
};

// Utility to create error responses
export const createErrorResponse = (
  message: string,
  code: string = "UNKNOWN_ERROR",
  status: number = 500
) => ({
  error: message,
  code,
  timestamp: Date.now(),
  status,
});

// Utility to create success responses
export const createSuccessResponse = <T>(data: T) => data;
