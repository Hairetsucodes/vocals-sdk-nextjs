// Main exports for @vocals/nextjs package

// Types
export type {
  WSToken,
  VocalsError,
  Result,
  ValidatedApiKey,
  VocalsConfig,
  WSTokenRequest,
  WSTokenResponse,
  ErrorResponse,
  // New message types
  VocalsWebSocketMessage,
  TranscriptionMessage,
  LLMResponseStreamingMessage,
  LLMResponseMessage,
  DetectionMessage,
  TranscriptionStatusMessage,
  AudioSavedMessage,
  TTSAudioMessage,
  SpeechInterruptionMessage,
  ChatMessage,
  ConversationState,
} from "./types";

// Type constructors
export { Ok, Err } from "./types";

// Functional utilities
export {
  pipe,
  compose,
  map,
  flatMap,
  mapError,
  asyncMap,
  asyncFlatMap,
  validate,
  getEnvVar,
  safeJsonParse,
  createErrorResponse,
  createSuccessResponse,
} from "./utils";

// Token utilities
export {
  validateApiKeyFormat,
  getVocalsApiKey,
  generateWSTokenFromApiKey,
  generateWSToken,
  generateWSTokenWithUserId,
  decodeWSToken,
  isTokenExpired,
  getTokenTTL,
  getWSEndpoint,
  getTokenExpiryMs,
} from "./token";

// App Router exports
export {
  createWSTokenHandler as createAppRouterHandler,
  createCustomWSTokenHandler as createCustomAppRouterHandler,
  POST as appRouterPOST,
} from "./app-router";

// Pages Router exports
export {
  createWSTokenHandler as createPagesRouterHandler,
  createCustomWSTokenHandler as createCustomPagesRouterHandler,
  default as pagesRouterHandler,
} from "./pages-router";

// React hooks
export {
  // Base hook
  useVocals,
  useVocalsToken,

  // High-level hooks
  useVocalsConversation,
  useVocalsTranscription,
  useVocalsVisualization,

  // Base hook types
  type UseVocalsConfig,
  type UseVocalsReturn,
  type ConnectionState,
  type RecordingState,
  type PlaybackState,
  type VocalsMessage,
  type TTSAudioSegment,

  // Conversation hook types
  type UseVocalsConversationConfig,
  type UseVocalsConversationReturn,

  // Transcription hook types
  type UseVocalsTranscriptionConfig,
  type UseVocalsTranscriptionReturn,
  type TranscriptEntry,

  // Visualization hook types
  type UseVocalsVisualizationConfig,
  type UseVocalsVisualizationReturn,
  type AudioVisualizationData,
} from "./use-vocals";

// Convenience re-exports with clearer names
export {
  createWSTokenHandler as createAppRouterWSTokenHandler,
  POST as POST_AppRouter,
} from "./app-router";

export {
  createWSTokenHandler as createPagesRouterWSTokenHandler,
  default as wsTokenHandler,
} from "./pages-router";
