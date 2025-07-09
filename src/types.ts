// Core types for Vocals Dev SDK
export type WSToken = {
  token: string;
  expiresAt: number;
};

export type VocalsError = {
  message: string;
  code: string;
  timestamp: number;
};

// Result type for functional error handling
export type Result<T, E = VocalsError> =
  | { success: true; data: T }
  | { success: false; error: E };

// Utility type constructors
export const Ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

export const Err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

// API Key validation result
export type ValidatedApiKey = string;

// Environment configuration
export type VocalsConfig = {
  apiKey: string;
  wsEndpoint: string;
  tokenExpiry: number;
};

// Request/Response types for Next.js
export type WSTokenRequest = {
  // Currently no body needed, but keeping for future extension
};

export type WSTokenResponse = WSToken;

export type ErrorResponse = {
  error: string;
  code?: string;
  timestamp?: number;
};

// Audio processing types (matching old code)
export interface AudioDetection {
  timestamp: number;
  confidence: number;
  text: string;
}

export interface TranscriptionFragment {
  text: string;
  start: number;
  end: number;
  confidence: number;
  is_word_boundary?: boolean;
  segment_id?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  timestamp: number;
  trigger_reason?: string;
  is_sliding_window?: boolean;
  segment_start?: number;
  segment_end?: number;
  fragments: TranscriptionFragment[];
}

export interface TranscriptionStatus {
  speech_detected: boolean;
  buffer_duration_ms: number;
  adaptive_threshold?: number;
  speech_buffer_duration_ms?: number;
  time_since_last_word_boundary?: number;
  pending_word_boundary?: boolean;
}

export interface GroupedSentence {
  id: string;
  text: string;
  confidence: number;
  language?: string;
  startTimestamp: number;
  endTimestamp: number;
  transcriptionCount: number;
  isComplete: boolean;
  fragments: TranscriptionFragment[];
}

// WebSocket message types (matching old code format)
export interface WebSocketMessage {
  event: string;
  data?: any;
  timestamp?: number;
  settings?: any;
  type?: string; // For backward compatibility
  format?: string;
  sampleRate?: number;
}

export interface WebSocketResponse {
  type?: string;
  event?: string;
  data?: any;
  confidence?: number;
  text?: string;
  error?: string;
  message?: string;
  filename?: string;
}

// Audio processing types (matching old code)
export interface AudioProcessorMessage {
  data: number[];
  format: string;
  sampleRate: number;
}

// Settings interface (matching old code)
export interface Settings {
  [key: string]: any;
}

// Audio device interface
export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

// Specific message types for better type safety
export interface TranscriptionMessage {
  type: "transcription";
  data: {
    text: string;
    is_partial: boolean;
    segment_id: string;
    confidence?: number;
    timestamp?: number;
  };
}

export interface LLMResponseStreamingMessage {
  type: "llm_response_streaming";
  data: {
    token: string;
    accumulated_response: string;
    is_complete: boolean;
    segment_id: string;
    timestamp?: number;
  };
}

export interface LLMResponseMessage {
  type: "llm_response";
  data: {
    response: string;
    original_text: string;
    segment_id: string;
    timestamp?: number;
  };
}

export interface DetectionMessage {
  type: "detection";
  text: string;
  confidence: number;
  timestamp?: number;
}

export interface TranscriptionStatusMessage {
  type: "transcription_status";
  data: TranscriptionStatus;
}

export interface AudioSavedMessage {
  type: "audio_saved";
  filename: string;
  timestamp?: number;
}

export interface TTSAudioMessage {
  type: "tts_audio";
  data: {
    text: string;
    audio_data: string; // Base64 encoded WAV
    sample_rate: number;
    segment_id: string;
    sentence_number: number;
    generation_time_ms: number;
    format: string;
    duration_seconds: number;
  };
}

export interface SpeechInterruptionMessage {
  type: "speech_interruption";
  data: {
    segment_id: string;
    start_time: number;
    reason: "new_speech_segment" | "speech_segment_merged" | string;
    connection_id?: number;
    timestamp: number;
  };
}

// Union type for all specific message types
export type VocalsWebSocketMessage =
  | TranscriptionMessage
  | LLMResponseStreamingMessage
  | LLMResponseMessage
  | DetectionMessage
  | TranscriptionStatusMessage
  | AudioSavedMessage
  | TTSAudioMessage
  | SpeechInterruptionMessage
  | WebSocketResponse; // Fallback for other message types

// Chat message interface for conversation management
export interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  isUser: boolean;
  isPartial: boolean;
  segmentId?: string;
  confidence?: number;
}

// Conversation state interface
export interface ConversationState {
  messages: ChatMessage[];
  currentTranscript: string;
  isProcessing: boolean;
  lastActivity: Date | null;
}
