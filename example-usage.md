# Vocals SDK for Next.js - Usage Examples

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [AEC (Acoustic Echo Cancellation) Features](#aec-acoustic-echo-cancellation-features)
3. [Advanced Configuration](#advanced-configuration)
4. [Conversation Hook](#conversation-hook)
5. [Transcription Hook](#transcription-hook)
6. [Visualization Hook](#visualization-hook)

## Basic Usage

### Simple Voice Chat Component

```tsx
// components/VoiceChat.tsx
import { useVocals } from "@/lib/vocals-sdk";

export default function VoiceChat() {
  const {
    isConnected,
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    playAudio,
    pauseAudio,
    clearQueue,
    error,
  } = useVocals();

  return (
    <div className="voice-chat">
      <div className="status">
        <span>Connected: {isConnected ? "✅" : "❌"}</span>
        <span>Recording: {isRecording ? "🎤" : "⏹️"}</span>
        <span>Playing: {isPlaying ? "🔊" : "🔇"}</span>
      </div>

      <div className="controls">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Start Recording
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Stop Recording
        </button>
        <button
          onClick={playAudio}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Play Audio
        </button>
        <button
          onClick={pauseAudio}
          className="bg-yellow-500 text-white px-4 py-2 rounded"
        >
          Pause Audio
        </button>
        <button
          onClick={clearQueue}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Clear Queue
        </button>
      </div>

      {error && (
        <div className="error text-red-500 mt-2">Error: {error.message}</div>
      )}
    </div>
  );
}
```

## AEC (Acoustic Echo Cancellation) Features

### 1. Basic AEC Usage

```tsx
// components/BasicAECChat.tsx
import { useVocals, AECPresets } from "@/lib/vocals-sdk";

export default function BasicAECChat() {
  const vocals = useVocals({
    audioConfig: AECPresets.basic(),
  });

  return (
    <div className="aec-chat">
      <h3>Basic AEC Voice Chat</h3>
      <p>AEC Enabled: {vocals.isAECEnabled ? "✅" : "❌"}</p>
      {/* ... rest of your UI */}
    </div>
  );
}
```

### 2. Enhanced AEC with WebRTC

```tsx
// components/EnhancedAECChat.tsx
import { useVocals, AECPresets } from "@/lib/vocals-sdk";

export default function EnhancedAECChat() {
  const vocals = useVocals({
    audioConfig: AECPresets.enhanced(),
  });

  return (
    <div className="enhanced-aec-chat">
      <h3>Enhanced AEC with WebRTC</h3>
      <p>
        Using WebRTC Processing:{" "}
        {vocals.audioConfig.useWebRTCProcessing ? "✅" : "❌"}
      </p>
      <p>Sample Rate: {vocals.audioConfig.sampleRate}Hz</p>
      <p>
        Echo Cancellation: {vocals.audioConfig.echoCancellation ? "✅" : "❌"}
      </p>
      <p>
        Noise Suppression: {vocals.audioConfig.noiseSuppression ? "✅" : "❌"}
      </p>
      {/* ... rest of your UI */}
    </div>
  );
}
```

### 3. Using Pre-configured AEC Hooks

```tsx
// components/PreConfiguredAECChat.tsx
import { useVocalsEnhancedAEC } from "@/lib/vocals-sdk";

export default function PreConfiguredAECChat() {
  // This automatically uses enhanced AEC settings
  const vocals = useVocalsEnhancedAEC();

  return (
    <div className="pre-configured-aec">
      <h3>Pre-configured Enhanced AEC</h3>
      {/* ... your UI components */}
    </div>
  );
}
```

### 4. Custom AEC Configuration

```tsx
// components/CustomAECChat.tsx
import { useVocals, AECUtils } from "@/lib/vocals-sdk";

export default function CustomAECChat() {
  const customAECConfig = AECUtils.createConfig({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    useWebRTCProcessing: true,
    advancedConstraints: {
      echoCancellationType: "aec3",
      latency: 0.01,
    },
  });

  const vocals = useVocals({
    audioConfig: customAECConfig,
  });

  return (
    <div className="custom-aec-chat">
      <h3>Custom AEC Configuration</h3>
      {/* ... your UI */}
    </div>
  );
}
```

### 5. AEC Testing and Device Management

```tsx
// components/AECTestingPanel.tsx
import { useState, useEffect } from "react";
import { useVocals, AECUtils } from "@/lib/vocals-sdk";

export default function AECTestingPanel() {
  const [aecSupport, setAecSupport] = useState<any>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  const vocals = useVocals();

  useEffect(() => {
    // Test AEC support on component mount
    AECUtils.testAECSupport().then(setAecSupport);

    // Get available audio devices
    vocals.getAudioDevices().then(setAudioDevices);
  }, []);

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    await vocals.setAudioDevice(deviceId);
  };

  const testConstraints = async () => {
    const constraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    const supported = await vocals.testAudioConstraints(constraints);
    alert(`Constraints supported: ${supported ? "Yes" : "No"}`);
  };

  return (
    <div className="aec-testing-panel">
      <h3>AEC Testing Panel</h3>

      {aecSupport && (
        <div className="aec-support">
          <h4>AEC Support Status</h4>
          <p>Overall Support: {aecSupport.supported ? "✅" : "❌"}</p>
          <p>
            Echo Cancellation:{" "}
            {aecSupport.features.echoCancellation ? "✅" : "❌"}
          </p>
          <p>
            Noise Suppression:{" "}
            {aecSupport.features.noiseSuppression ? "✅" : "❌"}
          </p>
          <p>
            Auto Gain Control:{" "}
            {aecSupport.features.autoGainControl ? "✅" : "❌"}
          </p>
          <p>WebRTC Support: {aecSupport.features.webRTC ? "✅" : "❌"}</p>
        </div>
      )}

      <div className="device-selection">
        <h4>Audio Device Selection</h4>
        <select
          value={selectedDevice}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="border rounded p-2"
        >
          <option value="">Select Device</option>
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Device ${device.deviceId.slice(0, 8)}...`}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={testConstraints}
        className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
      >
        Test Audio Constraints
      </button>
    </div>
  );
}
```

## Advanced Configuration

### Low-Latency Real-time Chat

```tsx
// components/LowLatencyChat.tsx
import { useVocals, AECPresets } from "@/lib/vocals-sdk";

export default function LowLatencyChat() {
  const vocals = useVocals({
    audioConfig: AECPresets.lowLatency(),
    maxReconnectAttempts: 5,
    reconnectDelay: 500,
  });

  return (
    <div className="low-latency-chat">
      <h3>Low-Latency Voice Chat</h3>
      <p>Optimized for real-time interactions</p>
      <p>Latency: ~5ms</p>
      {/* ... your UI */}
    </div>
  );
}
```

### High-Fidelity Audio Chat

```tsx
// components/HighFidelityChat.tsx
import { useVocals, AECPresets } from "@/lib/vocals-sdk";

export default function HighFidelityChat() {
  const vocals = useVocals({
    audioConfig: AECPresets.highFidelity(),
  });

  return (
    <div className="high-fidelity-chat">
      <h3>High-Fidelity Audio Chat</h3>
      <p>Sample Rate: {vocals.audioConfig.sampleRate}Hz</p>
      <p>Channels: {vocals.audioConfig.channelCount}</p>
      <p>Optimized for music and high-quality audio</p>
      {/* ... your UI */}
    </div>
  );
}
```

## Conversation Hook

```tsx
// components/ConversationChat.tsx
import { useVocalsConversation } from "@/lib/vocals-sdk";

export default function ConversationChat() {
  const {
    messages,
    currentTranscript,
    isProcessing,
    isRecording,
    startRecording,
    stopRecording,
    clearConversation,
    onTranscription,
    onLLMResponse,
  } = useVocalsConversation({
    audioConfig: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  return (
    <div className="conversation-chat">
      <div className="messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.isUser ? "user" : "assistant"}`}
          >
            <span className="text">{message.text}</span>
            <span className="timestamp">
              {message.timestamp.toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>

      {currentTranscript && (
        <div className="current-transcript">
          <span>Current: {currentTranscript}</span>
        </div>
      )}

      <div className="controls">
        <button onClick={startRecording} disabled={isRecording}>
          {isRecording ? "Recording..." : "Start Recording"}
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop Recording
        </button>
        <button onClick={clearConversation}>Clear Conversation</button>
      </div>
    </div>
  );
}
```

## Transcription Hook

```tsx
// components/TranscriptionPanel.tsx
import { useVocalsTranscription } from "@/lib/vocals-sdk";

export default function TranscriptionPanel() {
  const {
    currentTranscript,
    transcriptHistory,
    isTranscribing,
    averageConfidence,
    isRecording,
    startRecording,
    stopRecording,
    clearTranscript,
    clearHistory,
    getHistoryText,
  } = useVocalsTranscription({
    audioConfig: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  return (
    <div className="transcription-panel">
      <div className="status">
        <span>Recording: {isRecording ? "🎤" : "⏹️"}</span>
        <span>Transcribing: {isTranscribing ? "✍️" : "💤"}</span>
        <span>Confidence: {(averageConfidence * 100).toFixed(1)}%</span>
      </div>

      <div className="current-transcript">
        <h4>Current Transcript:</h4>
        <p>{currentTranscript || "No current transcript"}</p>
      </div>

      <div className="transcript-history">
        <h4>Transcript History:</h4>
        <div className="history-text">
          {getHistoryText() || "No history yet"}
        </div>
      </div>

      <div className="controls">
        <button onClick={startRecording} disabled={isRecording}>
          Start Recording
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop Recording
        </button>
        <button onClick={clearTranscript}>Clear Current</button>
        <button onClick={clearHistory}>Clear History</button>
      </div>
    </div>
  );
}
```

## Visualization Hook

```tsx
// components/AudioVisualizer.tsx
import { useVocalsVisualization } from "@/lib/vocals-sdk";
import { useEffect, useRef } from "react";

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    visualizationData,
    isVisualizing,
    isRecording,
    startRecording,
    stopRecording,
    startVisualization,
    stopVisualization,
  } = useVocalsVisualization({
    audioConfig: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    bufferSize: 2048,
    smoothing: 0.8,
    enableFrequencyAnalysis: true,
  });

  useEffect(() => {
    if (!visualizationData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const { waveform } = visualizationData;
    const sliceWidth = canvas.width / waveform.length;
    let x = 0;

    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] * 0.5;
      const y = (v * canvas.height) / 2 + canvas.height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();

    // Draw frequency bars if available
    if (visualizationData.frequencyData) {
      const barWidth = canvas.width / visualizationData.frequencyData.length;
      ctx.fillStyle = "#ff0000";

      for (let i = 0; i < visualizationData.frequencyData.length; i++) {
        const barHeight =
          (visualizationData.frequencyData[i] / 255) * canvas.height;
        ctx.fillRect(
          i * barWidth,
          canvas.height - barHeight,
          barWidth,
          barHeight
        );
      }
    }
  }, [visualizationData]);

  return (
    <div className="audio-visualizer">
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        className="border border-gray-300 rounded"
      />

      <div className="controls mt-4">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Start Recording
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className="bg-red-500 text-white px-4 py-2 rounded mr-2"
        >
          Stop Recording
        </button>
        <button
          onClick={startVisualization}
          disabled={isVisualizing}
          className="bg-green-500 text-white px-4 py-2 rounded mr-2"
        >
          Start Visualization
        </button>
        <button
          onClick={stopVisualization}
          disabled={!isVisualizing}
          className="bg-yellow-500 text-white px-4 py-2 rounded"
        >
          Stop Visualization
        </button>
      </div>

      {visualizationData && (
        <div className="audio-info mt-4">
          <p>Amplitude: {visualizationData.amplitude.toFixed(4)}</p>
          <p>
            Smoothed Amplitude: {visualizationData.smoothedAmplitude.toFixed(4)}
          </p>
          <p>Sample Rate: {visualizationData.sampleRate}Hz</p>
          <p>Buffer Size: {visualizationData.bufferSize}</p>
        </div>
      )}
    </div>
  );
}
```

## API Routes

### WebSocket Token Endpoint

```typescript
// pages/api/wstoken.ts or app/api/wstoken/route.ts
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Your token generation logic here
    const token = await generateVocalsToken();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    res.status(200).json({
      token,
      expiresAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate token" });
  }
}

async function generateVocalsToken(): Promise<string> {
  // Implement your token generation logic
  // This should call your backend to get a valid WebSocket token
  return "your-generated-token";
}
```

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_VOCALS_WS_ENDPOINT=wss://api.vocals.dev/v1/stream/conversation
VOCALS_API_KEY=your-api-key-here
```

## Complete Example with All Features

```tsx
// components/CompleteVoiceChat.tsx
import { useState, useEffect } from "react";
import {
  useVocals,
  AECPresets,
  AECUtils,
  type AudioProcessingConfig,
} from "@/lib/vocals-sdk";

export default function CompleteVoiceChat() {
  const [aecConfig, setAecConfig] = useState<AudioProcessingConfig>(
    AECPresets.basic()
  );
  const [aecSupport, setAecSupport] = useState<any>(null);

  const vocals = useVocals({
    audioConfig: aecConfig,
    autoConnect: true,
  });

  useEffect(() => {
    // Test AEC support and get recommended config
    AECUtils.testAECSupport().then(async (support) => {
      setAecSupport(support);

      if (support.supported) {
        const recommendedConfig = await AECUtils.getRecommendedConfig();
        setAecConfig(recommendedConfig);
      }
    });
  }, []);

  const switchAECPreset = (preset: keyof typeof AECPresets) => {
    setAecConfig(AECPresets[preset]());
  };

  return (
    <div className="complete-voice-chat p-6">
      <h1 className="text-3xl font-bold mb-6">Complete Voice Chat with AEC</h1>

      {/* AEC Configuration Panel */}
      <div className="aec-config mb-6 p-4 border rounded">
        <h3 className="text-xl font-semibold mb-4">AEC Configuration</h3>

        <div className="preset-buttons mb-4">
          <button
            onClick={() => switchAECPreset("basic")}
            className="mr-2 px-3 py-1 bg-blue-500 text-white rounded"
          >
            Basic
          </button>
          <button
            onClick={() => switchAECPreset("enhanced")}
            className="mr-2 px-3 py-1 bg-green-500 text-white rounded"
          >
            Enhanced
          </button>
          <button
            onClick={() => switchAECPreset("lowLatency")}
            className="mr-2 px-3 py-1 bg-yellow-500 text-white rounded"
          >
            Low Latency
          </button>
          <button
            onClick={() => switchAECPreset("highFidelity")}
            className="mr-2 px-3 py-1 bg-purple-500 text-white rounded"
          >
            High Fidelity
          </button>
        </div>

        <div className="aec-status">
          <p>AEC Enabled: {vocals.isAECEnabled ? "✅" : "❌"}</p>
          <p>
            WebRTC Processing:{" "}
            {vocals.audioConfig.useWebRTCProcessing ? "✅" : "❌"}
          </p>
          <p>Sample Rate: {vocals.audioConfig.sampleRate}Hz</p>
          <p>Channels: {vocals.audioConfig.channelCount}</p>
        </div>
      </div>

      {/* Status Panel */}
      <div className="status-panel mb-6 p-4 border rounded">
        <h3 className="text-xl font-semibold mb-4">Status</h3>
        <div className="flex space-x-4">
          <span>Connected: {vocals.isConnected ? "✅" : "❌"}</span>
          <span>Recording: {vocals.isRecording ? "🎤" : "⏹️"}</span>
          <span>Playing: {vocals.isPlaying ? "🔊" : "🔇"}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="controls mb-6">
        <button
          onClick={vocals.startRecording}
          disabled={vocals.isRecording}
          className="mr-2 px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Start Recording
        </button>
        <button
          onClick={vocals.stopRecording}
          disabled={!vocals.isRecording}
          className="mr-2 px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
        >
          Stop Recording
        </button>
        <button
          onClick={vocals.playAudio}
          className="mr-2 px-4 py-2 bg-green-500 text-white rounded"
        >
          Play Audio
        </button>
        <button
          onClick={vocals.pauseAudio}
          className="mr-2 px-4 py-2 bg-yellow-500 text-white rounded"
        >
          Pause Audio
        </button>
        <button
          onClick={vocals.clearQueue}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          Clear Queue
        </button>
      </div>

      {/* Audio Queue */}
      <div className="audio-queue mb-6 p-4 border rounded">
        <h3 className="text-xl font-semibold mb-4">
          Audio Queue ({vocals.audioQueue.length})
        </h3>
        {vocals.audioQueue.length > 0 ? (
          <ul className="space-y-2">
            {vocals.audioQueue.map((segment, index) => (
              <li key={segment.segment_id} className="p-2 bg-gray-100 rounded">
                <span className="font-medium">#{index + 1}</span>
                <span className="ml-2">{segment.text}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ({segment.duration_seconds.toFixed(2)}s)
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No audio in queue</p>
        )}
      </div>

      {/* Error Display */}
      {vocals.error && (
        <div className="error mb-6 p-4 border border-red-500 rounded bg-red-50">
          <h3 className="text-xl font-semibold mb-2 text-red-700">Error</h3>
          <p className="text-red-600">{vocals.error.message}</p>
          <p className="text-sm text-red-500">Code: {vocals.error.code}</p>
        </div>
      )}

      {/* AEC Support Information */}
      {aecSupport && (
        <div className="aec-support p-4 border rounded">
          <h3 className="text-xl font-semibold mb-4">
            AEC Support Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p>Overall Support: {aecSupport.supported ? "✅" : "❌"}</p>
              <p>
                Echo Cancellation:{" "}
                {aecSupport.features.echoCancellation ? "✅" : "❌"}
              </p>
            </div>
            <div>
              <p>
                Noise Suppression:{" "}
                {aecSupport.features.noiseSuppression ? "✅" : "❌"}
              </p>
              <p>WebRTC Support: {aecSupport.features.webRTC ? "✅" : "❌"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

This comprehensive example demonstrates how to use all the AEC features in your Next.js application. The SDK now provides:

1. **Built-in AEC Support**: Automatically enabled WebRTC-based echo cancellation
2. **Multiple Configuration Presets**: Basic, Enhanced, Low-Latency, and High-Fidelity
3. **WebRTC Processing**: Advanced audio processing with RTCPeerConnection
4. **Device Management**: Easy audio device switching and testing
5. **Utility Functions**: Testing AEC support and creating custom configurations
6. **Pre-configured Hooks**: Ready-to-use hooks with AEC settings

The AEC implementation is fully backward compatible and doesn't break any existing functionality while adding powerful new audio processing capabilities.
