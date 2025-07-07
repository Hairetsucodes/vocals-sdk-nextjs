# @vocals/nextjs

Next.js utilities and route handlers for the Vocals Dev SDK, featuring complete voice-to-voice conversations with real-time speech recognition, streaming LLM responses, and TTS audio playback.

## Installation

```bash
npm install @vocals/nextjs
# or
pnpm add @vocals/nextjs
# or
yarn add @vocals/nextjs
```

## Key Features

- 🎙️ **Voice-to-Voice Conversations**: Complete conversational AI with speech-to-text, LLM processing, and text-to-speech
- 🔄 **Real-time Streaming**: Live transcription and streaming LLM responses with WebSocket integration
- 🎵 **TTS Audio Playback**: Automatic audio queue management and playback controls
- 📊 **Audio Visualization**: Real-time amplitude monitoring and audio level indicators
- 🔧 **Easy Integration**: Simple React hooks for seamless Next.js integration
- 🔐 **Secure Authentication**: JWT token-based authentication with automatic refresh
- 🌐 **WebSocket Support**: Efficient real-time communication with auto-reconnection
- 📱 **TypeScript First**: Complete TypeScript support with comprehensive type definitions

## Setup

Add your Vocals Dev API key to your environment variables:

```bash
# .env.local (for Next.js)
VOCALS_DEV_API_KEY=vdev_your_api_key_here
```

## Usage

### Voice-to-Voice Conversations

The `useVocals` hook now supports full voice-to-voice conversations with streaming LLM responses and real-time TTS playback. Perfect for building conversational AI applications:

```tsx
"use client";

import { useVocals } from "@vocals/nextjs";

function ConversationDemo() {
  const {
    isConnected,
    isRecording,
    isPlaying,
    chatMessages,
    currentTranscript,
    audioQueue,
    currentSegment,
    startRecording,
    stopRecording,
    playAudio,
    pauseAudio,
    onMessage,
  } = useVocals({
    wsEndpoint: "ws://your-server.com/v1/stream/conversation",
    useTokenAuth: true,
    autoConnect: false,
  });

  // The hook automatically handles:
  // - Real-time speech transcription
  // - Streaming LLM responses
  // - TTS audio queue management
  // - Audio playback controls

  return (
    <div>
      {/* Voice Controls */}
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? "Stop Talking" : "Start Talking"}
      </button>

      {/* TTS Playback */}
      <button onClick={isPlaying ? pauseAudio : playAudio}>
        {isPlaying ? "Pause AI" : "Play AI Response"}
      </button>

      {/* Live transcript while speaking */}
      {currentTranscript && <p>You: {currentTranscript}</p>}

      {/* Current AI audio being played */}
      {currentSegment && <p>AI: {currentSegment.text}</p>}

      {/* Audio queue status */}
      <p>Queued responses: {audioQueue.length}</p>
    </div>
  );
}
```

### Client-Side React Hook (useVocals)

The `useVocals` hook provides a complete client-side solution for voice integration, including real-time transcription, streaming LLM responses, and TTS playback:

```tsx
"use client";

import { useVocals } from "@vocals/nextjs";
import { useState, useEffect } from "react";

function VoiceToVoiceComponent() {
  const [chatMessages, setChatMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState("");

  const {
    connectionState,
    isConnected,
    isRecording,
    recordingState,
    error,
    currentAmplitude,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    sendMessage,
    onMessage,
    onAudioData,
    // TTS Playback functionality
    playbackState,
    isPlaying,
    audioQueue,
    currentSegment,
    playAudio,
    pauseAudio,
    stopAudio,
    clearQueue,
    addToQueue,
  } = useVocals({
    useTokenAuth: true,
    wsEndpoint: "ws://your-server.com/v1/stream/conversation",
    autoConnect: false,
  });

  // Handle real-time conversation messages
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      if (message.type === "transcription" && message.data) {
        // Handle partial and final transcriptions
        setChatMessages((prev) => {
          const existingIndex = prev.findIndex(
            (msg) => msg.id === message.data.segment_id
          );

          const newMessage = {
            id: message.data.segment_id,
            text: message.data.text,
            isUser: true,
            isPartial: message.data.is_partial,
            timestamp: new Date(),
          };

          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = newMessage;
            return updated;
          } else {
            return [...prev, newMessage];
          }
        });
      } else if (message.type === "llm_response_streaming" && message.data) {
        // Handle streaming LLM responses
        setChatMessages((prev) => {
          const streamingId = `${message.data.segment_id}-streaming`;
          const existingIndex = prev.findIndex((msg) => msg.id === streamingId);

          const streamingMessage = {
            id: streamingId,
            text: message.data.accumulated_response || message.data.token,
            isUser: false,
            isPartial: !message.data.is_complete,
            timestamp: new Date(),
          };

          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = streamingMessage;
            return updated;
          } else {
            return [...prev, streamingMessage];
          }
        });
      } else if (message.type === "tts_audio" && message.data) {
        // Add TTS audio to playback queue
        addToQueue(message.data);

        // Auto-play if not currently playing
        if (playbackState === "idle") {
          setTimeout(() => playAudio(), 100);
        }
      } else if (message.type === "detection") {
        // Real-time transcription during recording
        if (message.text && isRecording) {
          setCurrentTranscript(message.text);
        }
      }
    });

    return unsubscribe;
  }, [onMessage, isRecording, playbackState, addToQueue, playAudio]);

  // Handle raw audio data for visualization
  useEffect(() => {
    const unsubscribe = onAudioData((audioData) => {
      // Raw PCM data for custom audio visualization
      console.log("Audio samples:", audioData.length);
    });
    return unsubscribe;
  }, [onAudioData]);

  return (
    <div>
      {/* Connection Status */}
      <div>
        <p>Status: {connectionState}</p>
        <p>Audio Level: {(currentAmplitude * 100).toFixed(1)}%</p>
      </div>

      {/* Recording Controls */}
      <div>
        {!isRecording ? (
          <button onClick={isConnected ? startRecording : connect}>
            {isConnected ? "Start Recording" : "Connect & Record"}
          </button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
      </div>

      {/* TTS Playback Controls */}
      <div>
        <p>
          Playback: {playbackState} | Queue: {audioQueue.length}
        </p>
        <button onClick={playAudio} disabled={audioQueue.length === 0}>
          ▶️ Play
        </button>
        <button onClick={pauseAudio} disabled={!isPlaying}>
          ⏸️ Pause
        </button>
        <button onClick={stopAudio}>⏹️ Stop</button>
        <button onClick={clearQueue}>🗑️ Clear Queue</button>
      </div>

      {/* Live Transcript */}
      {isRecording && currentTranscript && (
        <div>
          <p>Live: {currentTranscript}</p>
        </div>
      )}

      {/* Chat Messages */}
      <div>
        {chatMessages.map((message) => (
          <div key={message.id} className={message.isUser ? "user" : "ai"}>
            <p>{message.text}</p>
            {message.isPartial && <span>Processing...</span>}
            <small>{message.timestamp.toLocaleTimeString()}</small>
          </div>
        ))}
      </div>

      {/* Currently Playing TTS */}
      {currentSegment && (
        <div>
          <p>🔊 Playing: {currentSegment.text}</p>
          <p>Duration: {currentSegment.duration_seconds}s</p>
        </div>
      )}

      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

### Server-Side Routes

### App Router (Recommended)

Create `app/api/wstoken/route.ts`:

```typescript
// app/api/wstoken/route.ts
export { POST } from "@vocals/nextjs/app-router";
```

Or with custom logic:

```typescript
// app/api/wstoken/route.ts
import { createCustomAppRouterHandler } from "@vocals/nextjs";

const customValidation = async (request: Request) => {
  // Add your custom validation logic here
  // Example: Check user authentication, rate limiting, etc.
};

export const POST = createCustomAppRouterHandler(customValidation);
```

### Pages Router

Create `pages/api/wstoken.ts`:

```typescript
// pages/api/wstoken.ts
export { default } from "@vocals/nextjs/pages-router";
```

Or with custom logic:

```typescript
// pages/api/wstoken.ts
import { createCustomPagesRouterHandler } from "@vocals/nextjs";

const customValidation = async (req) => {
  // Add your custom validation logic here
  // Example: Check user authentication, rate limiting, etc.
};

export default createCustomPagesRouterHandler(customValidation);
```

## API Reference

### Types

```typescript
import type {
  WSToken,
  VocalsError,
  Result,
  WSTokenResponse,
  ErrorResponse,
  TTSSegment,
  PlaybackState,
  ConnectionState,
  RecordingState,
  ChatMessage,
} from "@vocals/nextjs";

// WebSocket token structure
type WSToken = {
  token: string;
  expiresAt: number;
};

// Error structure
type VocalsError = {
  message: string;
  code: string;
  timestamp: number;
};

// Result type for functional error handling
type Result<T, E = VocalsError> =
  | { success: true; data: T }
  | { success: false; error: E };

// TTS Audio segment
type TTSSegment = {
  audio_data: string; // Base64 encoded audio data
  text: string; // Text that was converted to speech
  segment_id: string; // Unique identifier for this segment
  format: string; // Audio format (mp3, wav, etc.)
  sample_rate: number; // Audio sample rate
  duration_seconds: number; // Duration of the audio segment
};

// Playback state
type PlaybackState = "idle" | "playing" | "paused" | "loading" | "error";

// Connection state
type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

// Recording state
type RecordingState =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "error";

// Chat message for conversation UI
type ChatMessage = {
  id: string;
  text: string;
  timestamp: Date;
  isUser: boolean;
  isPartial?: boolean;
};
```

### useVocals Hook Configuration

```tsx
const vocals = useVocals({
  // Custom token endpoint (default: "/api/wstoken")
  tokenEndpoint: "/api/wstoken",

  // Custom headers for token requests
  headers: {
    Authorization: "Bearer your-auth-token",
  },

  // Auto-connect on component mount (default: true)
  autoConnect: false,

  // Maximum reconnection attempts (default: 3)
  maxReconnectAttempts: 5,

  // Reconnection delay in milliseconds (default: 1000)
  reconnectDelay: 2000,

  // Token refresh buffer in milliseconds (default: 60000)
  tokenRefreshBuffer: 120000, // Refresh 2 minutes before expiry

  // WebSocket endpoint URL (optional)
  wsEndpoint: "ws://localhost:8000/ws",

  // Whether to use token authentication (default: true)
  useTokenAuth: true,
});
```

#### Key Compatibility Features:

- **Direct WebSocket Connection**: Set `useTokenAuth: false` to bypass token authentication
- **Raw PCM Audio Data**: Audio is sent as raw PCM data arrays (not base64 encoded)
- **Event-based Messages**: Messages use `event` field format: `event: "start"`, `"stop"`, `"media"`
- **Same Message Types**: Supports `transcription`, `detection`, `transcription_status`, `audio_saved`
- **Audio Data Access**: `onAudioData` provides raw PCM data for custom visualization
- **Settings Support**: Send settings using `event: "settings"` format
- **Auto-Connect**: `startRecording()` automatically connects if not already connected

### useVocalsToken Hook (Token Management Only)

For apps that only need token management without WebSocket connections:

```tsx
import { useVocalsToken } from "@vocals/nextjs";

function TokenComponent() {
  const { token, expiresAt, isLoading, error, fetchToken, clearToken } =
    useVocalsToken({
      tokenEndpoint: "/api/wstoken",
      headers: { Authorization: "Bearer auth-token" },
    });

  return (
    <div>
      <p>Token: {token?.substring(0, 20)}...</p>
      <button onClick={fetchToken} disabled={isLoading}>
        {isLoading ? "Loading..." : "Fetch Token"}
      </button>
      <button onClick={clearToken}>Clear Token</button>
    </div>
  );
}
```

### Hook Return Values

| Property                    | Type                       | Description                                     |
| --------------------------- | -------------------------- | ----------------------------------------------- |
| `connectionState`           | `ConnectionState`          | Current WebSocket connection state              |
| `isConnected`               | `boolean`                  | Whether WebSocket is connected                  |
| `isConnecting`              | `boolean`                  | Whether WebSocket is connecting/reconnecting    |
| `token`                     | `string \| null`           | Current WebSocket token                         |
| `tokenExpiresAt`            | `number \| null`           | Token expiration timestamp                      |
| `recordingState`            | `RecordingState`           | Current recording state                         |
| `isRecording`               | `boolean`                  | Whether actively recording                      |
| `error`                     | `VocalsError \| null`      | Last error that occurred                        |
| `connect()`                 | `() => Promise<void>`      | Manually connect to WebSocket                   |
| `disconnect()`              | `() => void`               | Disconnect from WebSocket                       |
| `reconnect()`               | `() => Promise<void>`      | Force reconnection                              |
| `startRecording()`          | `() => Promise<void>`      | Start audio recording (auto-connects if needed) |
| `stopRecording()`           | `() => Promise<void>`      | Stop audio recording                            |
| `sendMessage()`             | `(message) => void`        | Send message via WebSocket                      |
| `onMessage()`               | `(handler) => unsubscribe` | Listen for WebSocket messages                   |
| `onConnectionChange()`      | `(handler) => unsubscribe` | Listen for connection state changes             |
| `onError()`                 | `(handler) => unsubscribe` | Listen for errors                               |
| `onAudioData()`             | `(handler) => unsubscribe` | Listen for raw PCM audio data                   |
| `currentAmplitude`          | `number`                   | Current audio amplitude (0-1)                   |
| **TTS Playback Properties** |                            | **Audio playback and queue management**         |
| `playbackState`             | `PlaybackState`            | Current TTS playback state                      |
| `isPlaying`                 | `boolean`                  | Whether TTS audio is currently playing          |
| `audioQueue`                | `TTSSegment[]`             | Queue of TTS audio segments                     |
| `currentSegment`            | `TTSSegment \| null`       | Currently playing TTS segment                   |
| `playAudio()`               | `() => Promise<void>`      | Start/resume TTS playback                       |
| `pauseAudio()`              | `() => void`               | Pause TTS playback                              |
| `stopAudio()`               | `() => void`               | Stop TTS playback and clear current segment     |
| `clearQueue()`              | `() => void`               | Clear TTS audio queue                           |
| `addToQueue()`              | `(segment) => void`        | Add TTS segment to playback queue               |

### Connection States

- `"disconnected"` - Not connected
- `"connecting"` - Initial connection attempt
- `"connected"` - Successfully connected
- `"reconnecting"` - Attempting to reconnect after disconnect
- `"error"` - Connection failed

### Recording States

- `"idle"` - Not recording
- `"recording"` - Actively recording audio
- `"processing"` - Processing recorded audio
- `"completed"` - Recording completed successfully
- `"error"` - Recording failed

### TTS Playback States

- `"idle"` - No audio playing or queued
- `"playing"` - Audio is currently playing
- `"paused"` - Audio is paused
- `"loading"` - Loading audio data
- `"error"` - Playback error occurred

### Message Types

The `onMessage` handler receives different types of messages from the WebSocket connection:

#### Voice-to-Voice Conversation Messages

```typescript
// Transcription (partial and final)
{
  type: "transcription",
  data: {
    text: "Hello, how are you?",
    segment_id: "segment_123",
    is_partial: false,
    confidence: 0.95
  }
}

// Streaming LLM Response
{
  type: "llm_response_streaming",
  data: {
    token: "Hello",
    accumulated_response: "Hello, I'm doing well",
    segment_id: "segment_123",
    is_complete: false
  }
}

// Complete LLM Response
{
  type: "llm_response",
  data: {
    response: "Hello, I'm doing well, thank you for asking!",
    original_text: "Hello, how are you?",
    segment_id: "segment_123"
  }
}

// TTS Audio Data
{
  type: "tts_audio",
  data: {
    audio_data: "base64_encoded_audio_data",
    text: "Hello, I'm doing well, thank you for asking!",
    segment_id: "segment_123",
    format: "mp3",
    sample_rate: 22050,
    duration_seconds: 2.5
  }
}
```

#### Real-time Detection Messages

```typescript
// Real-time speech detection (during recording)
{
  type: "detection",
  text: "Hello, how are",
  confidence: 0.8
}

// Transcription status updates
{
  type: "transcription_status",
  data: {
    status: "processing",
    message: "Processing audio..."
  }
}

// Audio file saved (if enabled)
{
  type: "audio_saved",
  filename: "recording_20240101_120000.wav"
}
```

### TTSSegment Type

```typescript
type TTSSegment = {
  audio_data: string; // Base64 encoded audio data
  text: string; // Text that was converted to speech
  segment_id: string; // Unique identifier for this segment
  format: string; // Audio format (mp3, wav, etc.)
  sample_rate: number; // Audio sample rate
  duration_seconds: number; // Duration of the audio segment
};
```

### Environment Variables

| Variable                         | Description                                            |
| -------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_VOCALS_WS_ENDPOINT` | WebSocket endpoint (default: `ws://localhost:8000/ws`) |

### Utilities

```typescript
import {
  generateWSToken,
  validateApiKeyFormat,
  isTokenExpired,
  getTokenTTL,
  getWSEndpoint,
} from "@vocals/nextjs";

// Generate a WebSocket token
const tokenResult = await generateWSToken();
if (tokenResult.success) {
  console.log("Token:", tokenResult.data.token);
  console.log("Expires at:", tokenResult.data.expiresAt);
}

// Check if token is expired
const expired = isTokenExpired(token);

// Get token time-to-live in seconds
const ttl = getTokenTTL(token);

// Get WebSocket endpoint
const endpoint = getWSEndpoint(); // "wss://api.vocalsdev.com/ws"
```

### Functional Programming Utilities

```typescript
import { pipe, map, flatMap, Ok, Err } from "@vocals/nextjs";

// Function composition
const processData = pipe(validateInput, transformData, saveToDatabase);

// Result handling
const result = Ok("success");
const transformed = map((value: string) => value.toUpperCase())(result);
```

## Error Handling

The package uses functional error handling with `Result<T, E>` types:

```typescript
import { generateWSToken } from "@vocals/nextjs";

const tokenResult = await generateWSToken();

if (tokenResult.success) {
  // Handle success
  const { token, expiresAt } = tokenResult.data;
  console.log("Token generated successfully");
} else {
  // Handle error
  const { message, code, timestamp } = tokenResult.error;
  console.error("Failed to generate token:", message);
}
```

## Environment Variables

| Variable             | Required | Description                                       |
| -------------------- | -------- | ------------------------------------------------- |
| `VOCALS_DEV_API_KEY` | Yes      | Your Vocals Dev API key (must start with `vdev_`) |

## API Endpoints

### POST /api/wstoken

Generates a WebSocket token for the authenticated user.

**Request:**

- Method: `POST`
- Body: None required

**Response (Success):**

```json
{
  "token": "wstoken_1234567890_abcdef",
  "expiresAt": 1234567890000
}
```

**Response (Error):**

```json
{
  "error": "VOCALS_DEV_API_KEY not configured",
  "code": "ENV_VAR_MISSING",
  "timestamp": 1234567890000
}
```

## Custom Validation

You can add custom validation logic to the route handlers:

```typescript
import { createCustomAppRouterHandler } from "@vocals/nextjs";

const customValidation = async (request: Request) => {
  // Example: Check authentication
  const auth = request.headers.get("authorization");
  if (!auth) {
    throw new Error("Authentication required");
  }

  // Example: Rate limiting
  const userId = getUserIdFromAuth(auth);
  await checkRateLimit(userId);
};

export const POST = createCustomAppRouterHandler(customValidation);
```

## License

MIT
