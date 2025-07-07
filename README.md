# @vocals/nextjs

Next.js utilities and route handlers for the Vocals Dev SDK.

## Installation

```bash
npm install @vocals/nextjs
# or
pnpm add @vocals/nextjs
# or
yarn add @vocals/nextjs
```

## Setup

Add your Vocals Dev API key to your environment variables:

```bash
# .env.local (for Next.js)
VOCALS_DEV_API_KEY=vdev_your_api_key_here
```

## Usage

### Client-Side React Hook (useVocals)

The `useVocals` hook provides a complete client-side solution for voice integration:

```tsx
"use client";

import { useVocals } from "@vocals/nextjs";

function VoiceComponent() {
  const {
    connectionState,
    isConnected,
    isRecording,
    recordingState,
    error,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    sendMessage,
    onMessage,
  } = useVocals();

  // Listen for messages
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      console.log("Received:", message);
    });
    return unsubscribe;
  }, [onMessage]);

  return (
    <div>
      <p>Status: {connectionState}</p>

      {!isConnected ? (
        <button onClick={connect}>Connect</button>
      ) : (
        <button onClick={disconnect}>Disconnect</button>
      )}

      <div>
        {!isRecording ? (
          <button onClick={startRecording}>
            Start Recording {/* Automatically connects if needed */}
          </button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
      </div>

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

### Old Code Compatibility Mode

For users migrating from previous voice SDK implementations, you can use the SDK in compatibility mode:

```tsx
"use client";

import { useVocals } from "@vocals/nextjs";
import { useEffect } from "react";

function CompatibilityExample() {
  const {
    isConnected,
    isRecording,
    currentAmplitude,
    startRecording,
    stopRecording,
    sendMessage,
    onMessage,
    onAudioData,
  } = useVocals({
    // Disable token authentication for direct connection
    useTokenAuth: false,
    // Direct WebSocket endpoint
    wsEndpoint: "ws://localhost:8000/ws",
    // Auto-connect on mount
    autoConnect: true,
  });

  // Handle WebSocket messages (matching old SDK message format)
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      if (message.type === "transcription" && message.data) {
        console.log("Transcription:", message.data.text);
      } else if (message.type === "detection") {
        console.log("Detection:", message.text);
      } else if (message.type === "audio_saved" && message.filename) {
        console.log("Audio saved:", message.filename);
      }
    });
    return unsubscribe;
  }, [onMessage]);

  // Handle raw audio data for visualization
  useEffect(() => {
    const unsubscribe = onAudioData((audioData) => {
      // Raw PCM data as number array (same format as old SDK)
      console.log("Audio samples:", audioData.length);
    });
    return unsubscribe;
  }, [onAudioData]);

  // Send settings (matching old SDK message format)
  const sendSettings = (settings: any) => {
    sendMessage({
      event: "settings",
      settings: settings,
    });
  };

  return (
    <div>
      <p>Connected: {isConnected ? "Yes" : "No"}</p>
      <p>Recording: {isRecording ? "Yes" : "No"}</p>
      <p>Audio Amplitude: {currentAmplitude.toFixed(4)}</p>

      <button onClick={startRecording} disabled={isRecording}>
        Start Recording {/* Automatically connects if needed */}
      </button>
      <button onClick={stopRecording} disabled={!isRecording}>
        Stop Recording
      </button>
      <button onClick={() => sendSettings({ example: "value" })}>
        Send Settings
      </button>
    </div>
  );
}
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

| Property               | Type                       | Description                                     |
| ---------------------- | -------------------------- | ----------------------------------------------- |
| `connectionState`      | `ConnectionState`          | Current WebSocket connection state              |
| `isConnected`          | `boolean`                  | Whether WebSocket is connected                  |
| `isConnecting`         | `boolean`                  | Whether WebSocket is connecting/reconnecting    |
| `token`                | `string \| null`           | Current WebSocket token                         |
| `tokenExpiresAt`       | `number \| null`           | Token expiration timestamp                      |
| `recordingState`       | `RecordingState`           | Current recording state                         |
| `isRecording`          | `boolean`                  | Whether actively recording                      |
| `error`                | `VocalsError \| null`      | Last error that occurred                        |
| `connect()`            | `() => Promise<void>`      | Manually connect to WebSocket                   |
| `disconnect()`         | `() => void`               | Disconnect from WebSocket                       |
| `reconnect()`          | `() => Promise<void>`      | Force reconnection                              |
| `startRecording()`     | `() => Promise<void>`      | Start audio recording (auto-connects if needed) |
| `stopRecording()`      | `() => Promise<void>`      | Stop audio recording                            |
| `sendMessage()`        | `(message) => void`        | Send message via WebSocket                      |
| `onMessage()`          | `(handler) => unsubscribe` | Listen for WebSocket messages                   |
| `onConnectionChange()` | `(handler) => unsubscribe` | Listen for connection state changes             |
| `onError()`            | `(handler) => unsubscribe` | Listen for errors                               |
| `onAudioData()`        | `(handler) => unsubscribe` | Listen for raw PCM audio data                   |
| `currentAmplitude`     | `number`                   | Current audio amplitude (0-1)                   |

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

## Architecture

This package follows functional programming principles:

- **Pure Functions**: Predictable, testable functions without side effects
- **Immutable Data**: Data structures that don't mutate
- **Function Composition**: Combine small functions into larger ones
- **Explicit Error Handling**: Using `Result<T, E>` instead of throwing exceptions

## License

MIT
