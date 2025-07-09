# Vocals SDK - Simplified Usage Examples

The Vocals SDK now includes high-level hooks that abstract away complex message handling and state management. Here's how to use them:

## 1. useVocalsConversation - Complete Conversation Management

This hook handles all the complex message parsing and state management you were doing manually.

**Before (Your Complex Code):**

```typescript
// Your original complex implementation with ~100 lines of useEffect and message handling
const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
const [currentTranscript, setCurrentTranscript] = useState("");

useEffect(() => {
  const unsubscribe = onMessage((message) => {
    if (message.type === "transcription" && message.data) {
      setChatMessages((prev) => {
        const existingIndex = prev.findIndex(
          (msg) => msg.id === message.data.segment_id
        );
        // ... complex deduplication logic
      });
    } else if (message.type === "llm_response_streaming" && message.data) {
      // ... complex streaming logic
    }
    // ... many more message types
  });
  return unsubscribe;
}, [onMessage, isRecording]);
```

**After (Simplified with useVocalsConversation):**

```typescript
import { useVocalsConversation } from "@vocals/nextjs";

export function ConversationComponent() {
  const {
    // Connection state
    isConnected,
    isRecording,

    // Conversation state (automatically managed!)
    messages, // Array of ChatMessage with automatic deduplication
    currentTranscript, // Current partial transcript
    isProcessing, // Whether AI is processing

    // Methods
    startRecording,
    stopRecording,
    clearConversation,

    // Optional: specific event handlers if needed
    onTranscription,
    onLLMResponse,
  } = useVocalsConversation({
    autoPlayAudio: true, // Auto-play TTS audio
    maxMessages: 100, // Limit conversation length
    autoClearOnDisconnect: false,
  });

  return (
    <div>
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.isUser ? "user" : "ai"}>
            {msg.text}
            {msg.isPartial && <span className="partial">...</span>}
          </div>
        ))}
      </div>

      {currentTranscript && (
        <div className="current-transcript">{currentTranscript}</div>
      )}

      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? "Stop" : "Start"}
      </button>
    </div>
  );
}
```

## 2. useVocalsTranscription - Just Transcription

For cases where you only need transcription functionality:

```typescript
import { useVocalsTranscription } from "@vocals/nextjs";

export function TranscriptionComponent() {
  const {
    // Transcription state
    currentTranscript, // Current partial transcript
    transcriptHistory, // Array of final transcripts
    isTranscribing, // Whether actively transcribing
    averageConfidence, // Average confidence score

    // Methods
    startRecording,
    stopRecording,
    clearTranscript,
    getHistoryText, // Get all transcripts as single text

    // Event handlers
    onFinalTranscript, // Called when transcript is finalized
  } = useVocalsTranscription({
    keepHistory: true,
    maxHistory: 50,
    transcriptDebounceMs: 100,
  });

  // Handle final transcripts
  useEffect(() => {
    const unsubscribe = onFinalTranscript((transcript) => {
      console.log("Final transcript:", transcript.text);
      console.log("Confidence:", transcript.confidence);
    });
    return unsubscribe;
  }, [onFinalTranscript]);

  return (
    <div>
      {currentTranscript && (
        <div className="live-transcript">
          {currentTranscript}
          {isTranscribing && <span className="blinking">...</span>}
        </div>
      )}

      <div className="transcript-history">
        {transcriptHistory.map((entry) => (
          <div key={entry.id} className="transcript-entry">
            {entry.text}
            <span className="confidence">
              {Math.round(entry.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>

      <div className="controls">
        <button onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? "Stop" : "Start"}
        </button>
        <button onClick={clearTranscript}>Clear</button>
        <div>Avg Confidence: {Math.round(averageConfidence * 100)}%</div>
      </div>
    </div>
  );
}
```

## 3. useVocalsVisualization - Audio Visualization

For audio visualization without the complex audio data handling:

```typescript
import { useVocalsVisualization } from "@vocals/nextjs";

export function AudioVisualizerComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    // Visualization state
    visualizationData, // Current audio visualization data
    isVisualizing, // Whether visualization is active

    // Methods
    startVisualization,
    stopVisualization,

    // Inherited from base hook
    startRecording,
    stopRecording,
    isRecording,
  } = useVocalsVisualization({
    bufferSize: 1024,
    smoothing: 0.8,
    enableFrequencyAnalysis: true,
  });

  // Draw visualization
  useEffect(() => {
    if (!visualizationData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    const { waveform, amplitude } = visualizationData;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 255, 0, ${amplitude * 2})`;
    ctx.lineWidth = 2;

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * canvas.width;
      const y = ((waveform[i] + 1) * canvas.height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw frequency bars if available
    if (visualizationData.frequencyData) {
      const barWidth = canvas.width / visualizationData.frequencyData.length;
      for (let i = 0; i < visualizationData.frequencyData.length; i++) {
        const barHeight =
          (visualizationData.frequencyData[i] / 255) * canvas.height;
        ctx.fillStyle = `rgba(255, 0, 0, 0.7)`;
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
    <div>
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        style={{ border: "1px solid #ccc" }}
      />

      <div className="controls">
        <button onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>

        <button
          onClick={isVisualizing ? stopVisualization : startVisualization}
        >
          {isVisualizing ? "Stop Visualization" : "Start Visualization"}
        </button>

        {visualizationData && (
          <div className="audio-info">
            <div>
              Amplitude: {Math.round(visualizationData.amplitude * 100)}%
            </div>
            <div>
              Smoothed: {Math.round(visualizationData.smoothedAmplitude * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## 4. Combining Multiple Hooks

You can use multiple hooks together for more complex functionality:

```typescript
import { useVocalsConversation, useVocalsVisualization } from "@vocals/nextjs";

export function AdvancedVoiceChat() {
  // Main conversation logic
  const conversation = useVocalsConversation({
    autoPlayAudio: true,
    maxMessages: 100,
  });

  // Audio visualization
  const visualization = useVocalsVisualization({
    bufferSize: 512,
    smoothing: 0.9,
  });

  return (
    <div>
      {/* Audio visualizer */}
      <AudioVisualizer data={visualization.visualizationData} />

      {/* Conversation */}
      <ConversationDisplay messages={conversation.messages} />

      {/* Current transcript */}
      {conversation.currentTranscript && (
        <div className="live-transcript">{conversation.currentTranscript}</div>
      )}

      {/* Controls */}
      <div className="controls">
        <button
          onClick={
            conversation.isRecording
              ? conversation.stopRecording
              : conversation.startRecording
          }
          disabled={!conversation.isConnected}
        >
          {conversation.isRecording ? "Stop" : "Start"}
        </button>

        <button onClick={conversation.clearConversation}>
          Clear Conversation
        </button>

        <div className="status">
          Connection: {conversation.connectionState}
          {conversation.isProcessing && <span> | Processing...</span>}
        </div>
      </div>
    </div>
  );
}
```

## Key Benefits

1. **Simplified Code**: Your complex message handling is now just a few lines
2. **Type Safety**: All message types are properly typed
3. **Automatic State Management**: No manual state updates needed
4. **Built-in Features**: Auto-play, deduplication, history management
5. **Composable**: Mix and match hooks for your specific needs
6. **Backward Compatible**: Original `useVocals` hook still works

## Migration Guide

1. Replace `useVocals` with `useVocalsConversation` for full conversation apps
2. Use `useVocalsTranscription` for transcription-only features
3. Use `useVocalsVisualization` for audio visualization
4. Remove manual message parsing and state management code
5. Update your event handlers to use the new typed handlers

The new hooks handle all the complexity you were managing manually, making your code much cleaner and more maintainable!
