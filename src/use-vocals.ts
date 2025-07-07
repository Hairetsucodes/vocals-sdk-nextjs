"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  VocalsError,
  WebSocketMessage,
  WebSocketResponse,
  AudioProcessorMessage,
} from "./types";

// Hook configuration options
export interface UseVocalsConfig {
  /** Custom endpoint for token fetching (defaults to /api/wstoken) */
  tokenEndpoint?: string;
  /** Custom headers for token requests */
  headers?: Record<string, string>;
  /** Auto-connect on mount (defaults to true) */
  autoConnect?: boolean;
  /** Reconnection attempts (defaults to 3) */
  maxReconnectAttempts?: number;
  /** Reconnection delay in ms (defaults to 1000) */
  reconnectDelay?: number;
  /** Token refresh buffer in ms - refresh token this many ms before expiry (defaults to 60000 = 1 minute) */
  tokenRefreshBuffer?: number;
  /** WebSocket endpoint URL (if not provided, will try to get from token or use default) */
  wsEndpoint?: string;
  /** Whether to use token authentication (defaults to true) */
  useTokenAuth?: boolean;
}

// Connection states
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

// Voice recording states
export type RecordingState =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "error";

// Audio playback states
export type PlaybackState = "idle" | "playing" | "paused" | "error";

// TTS Audio segment interface
export interface TTSAudioSegment {
  text: string;
  audio_data: string; // Base64 encoded WAV
  sample_rate: number;
  segment_id: string;
  sentence_number: number;
  generation_time_ms: number;
  format: string;
  duration_seconds: number;
}

// TTS Audio message interface
export interface TTSAudioMessage {
  type: "tts_audio";
  data: TTSAudioSegment;
}

// Speech interruption data interface
export interface SpeechInterruptionData {
  segment_id: string;
  start_time: number;
  reason: "new_speech_segment" | "speech_segment_merged" | string;
  connection_id?: number;
  timestamp: number;
}

// Speech interruption message interface
export interface SpeechInterruptionMessage {
  type: "speech_interruption";
  data: SpeechInterruptionData;
}

// Use WebSocketMessage from types.ts
export type VocalsMessage = WebSocketMessage;

// Hook return interface
export interface UseVocalsReturn {
  // Connection state
  connectionState: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;

  // Token management
  token: string | null;
  tokenExpiresAt: number | null;

  // Recording state
  recordingState: RecordingState;
  isRecording: boolean;

  // Playback state
  playbackState: PlaybackState;
  isPlaying: boolean;
  audioQueue: TTSAudioSegment[];
  currentSegment: TTSAudioSegment | null;

  // Error handling
  error: VocalsError | null;

  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;

  // Voice methods
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;

  // Playback methods
  playAudio: () => Promise<void>;
  pauseAudio: () => void;
  stopAudio: () => void;
  fadeOutAudio: (duration?: number) => Promise<void>;
  clearQueue: () => void;
  addToQueue: (segment: TTSAudioSegment) => void;

  // Messaging
  sendMessage: (message: VocalsMessage) => void;

  // Event handlers
  onMessage: (handler: (message: WebSocketResponse) => void) => () => void;
  onConnectionChange: (handler: (state: ConnectionState) => void) => () => void;
  onError: (handler: (error: VocalsError) => void) => () => void;
  onAudioData: (handler: (audioData: number[]) => void) => () => void;

  // Audio amplitude for visualization
  currentAmplitude: number;
}

// Default configuration
const DEFAULT_CONFIG: Required<UseVocalsConfig> = {
  tokenEndpoint: "/api/wstoken",
  headers: {},
  autoConnect: true,
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  tokenRefreshBuffer: 60000, // 1 minute
  wsEndpoint: "",
  useTokenAuth: true,
};

// Token manager class for handling token lifecycle
class TokenManager {
  private token: string | null = null;
  private expiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    private endpoint: string,
    private headers: Record<string, string>,
    private refreshBuffer: number
  ) {}

  async getToken(): Promise<string> {
    // Return existing token if still valid
    if (this.token && Date.now() < this.expiresAt - this.refreshBuffer) {
      return this.token;
    }

    // Avoid multiple concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Refresh the token
    this.refreshPromise = this.refreshToken();
    const token = await this.refreshPromise;
    this.refreshPromise = null;

    return token;
  }

  private async refreshToken(): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to refresh WebSocket token: ${error.error}`);
    }

    const data = await response.json();
    this.token = data.token;
    this.expiresAt = data.expiresAt;

    return this.token!;
  }

  clear() {
    this.token = null;
    this.expiresAt = 0;
    this.refreshPromise = null;
  }

  getTokenInfo(): { token: string | null; expiresAt: number | null } {
    return {
      token: this.token,
      expiresAt: this.expiresAt || null,
    };
  }
}

// Audio playback utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function createAudioBufferFromBase64(
  audioContext: AudioContext,
  base64Audio: string
): Promise<AudioBuffer> {
  const arrayBuffer = base64ToArrayBuffer(base64Audio);
  return await audioContext.decodeAudioData(arrayBuffer);
}

// Audio processing functions (matching old code approach)
async function initializeAudioProcessing(
  onAudioData: (audioData: AudioProcessorMessage) => void,
  deviceId?: string
): Promise<{
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
}> {
  // Get user media
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });

  // Create audio context
  const audioContext = new AudioContext();
  console.log("Sample rate:", audioContext.sampleRate); // Should show 24000
  // Add the audio worklet module
  await audioContext.audioWorklet.addModule(
    URL.createObjectURL(
      new Blob(
        [
          `
        class AudioProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input[0]) {
              const audioData = input[0];
              // Send PCM data to main thread
              this.port.postMessage({
                data: Array.from(audioData),
                format: 'pcm_f32le',
                sampleRate: sampleRate
              });
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `,
        ],
        { type: "application/javascript" }
      )
    )
  );

  // Create source and processor nodes
  const source = audioContext.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(audioContext, "audio-processor");
  // Handle audio data from worklet
  processor.port.onmessage = (event) => {
    onAudioData({
      data: event.data.data,
      format: event.data.format,
      sampleRate: audioContext.sampleRate,
    });
  };

  // Connect nodes
  source.connect(processor);

  return { stream, audioContext, source, processor };
}

function cleanupAudioResources(
  stream: MediaStream | null,
  processor: AudioWorkletNode | null,
  source: MediaStreamAudioSourceNode | null,
  audioContext: AudioContext | null,
  websocket: WebSocket | null
) {
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  // Disconnect nodes
  if (processor) {
    processor.disconnect();
  }
  if (source) {
    source.disconnect();
  }

  // Close audio context
  if (audioContext) {
    audioContext.close();
  }

  // Close websocket
  if (websocket) {
    websocket.close();
  }
}

// Main useVocals hook
export function useVocals(config: UseVocalsConfig = {}): UseVocalsReturn {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // State management
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<VocalsError | null>(null);
  const [currentAmplitude, setCurrentAmplitude] = useState<number>(0);
  const [audioQueue, setAudioQueue] = useState<TTSAudioSegment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<TTSAudioSegment | null>(
    null
  );

  // Refs for managing instances
  const wsRef = useRef<WebSocket | null>(null);
  const tokenManagerRef = useRef<TokenManager | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Audio processing refs (matching old code)
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const isListeningRef = useRef<boolean>(false);

  // Audio playback refs
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const currentAudioBufferSourceRef = useRef<AudioBufferSourceNode | null>(
    null
  );
  const currentGainNodeRef = useRef<GainNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const isFadingOutRef = useRef<boolean>(false);

  // Event handlers
  const messageHandlersRef = useRef<Set<(message: WebSocketResponse) => void>>(
    new Set()
  );
  const connectionHandlersRef = useRef<Set<(state: ConnectionState) => void>>(
    new Set()
  );
  const errorHandlersRef = useRef<Set<(error: VocalsError) => void>>(new Set());
  const audioDataHandlersRef = useRef<Set<(audioData: number[]) => void>>(
    new Set()
  );

  // Initialize token manager
  useEffect(() => {
    if (fullConfig.useTokenAuth) {
      tokenManagerRef.current = new TokenManager(
        fullConfig.tokenEndpoint,
        fullConfig.headers,
        fullConfig.tokenRefreshBuffer
      );
    }

    return () => {
      tokenManagerRef.current?.clear();
    };
  }, [
    fullConfig.tokenEndpoint,
    fullConfig.headers,
    fullConfig.tokenRefreshBuffer,
    fullConfig.useTokenAuth,
  ]);

  // Helper to create error objects
  const createError = useCallback(
    (message: string, code: string = "VOCALS_ERROR"): VocalsError => ({
      message,
      code,
      timestamp: Date.now(),
    }),
    []
  );

  // Helper to update connection state and notify handlers
  const updateConnectionState = useCallback((newState: ConnectionState) => {
    setConnectionState(newState);
    connectionHandlersRef.current.forEach(
      (handler: (state: ConnectionState) => void) => handler(newState)
    );
  }, []);

  // Helper to handle errors
  const handleError = useCallback((error: VocalsError) => {
    setError(error);
    errorHandlersRef.current.forEach((handler: (error: VocalsError) => void) =>
      handler(error)
    );
  }, []);

  // WebSocket connection logic (matching old code approach)
  const connect = useCallback(async () => {
    try {
      updateConnectionState("connecting");
      setError(null);

      let wsUrl = "";

      if (fullConfig.useTokenAuth && tokenManagerRef.current) {
        // Get fresh token
        const token = await tokenManagerRef.current.getToken();

        // Use provided endpoint or default
        const wsEndpoint =
          fullConfig.wsEndpoint ||
          process.env.NEXT_PUBLIC_VOCALS_WS_ENDPOINT ||
          "wss://api.vocals.dev/v1/stream/conversation";

        wsUrl = `${wsEndpoint}?token=${encodeURIComponent(token)}`;
      } else {
        // Direct connection without token (matching old code)
        wsUrl =
          fullConfig.wsEndpoint ||
          process.env.NEXT_PUBLIC_VOCALS_WS_ENDPOINT ||
          "wss://api.vocals.dev/v1/stream/conversation";
      }

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        updateConnectionState("connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketResponse = JSON.parse(event.data);

          // Handle speech interruption events
          if ((message as any).type === "speech_interruption") {
            const interruptionMessage =
              message as any as SpeechInterruptionMessage;
            console.log(
              "Speech interruption received:",
              interruptionMessage.data
            );

            // Handle different interruption reasons
            if (
              interruptionMessage.data.reason === "new_speech_segment" ||
              interruptionMessage.data.reason === "speech_segment_merged"
            ) {
              // Fade out current audio and clear queue for new speech
              fadeOutAudio(300).then(() => {
                clearQueue();
              });
            }
          }

          // Handle TTS audio messages
          if ((message as any).type === "tts_audio" && (message as any).data) {
            const ttsMessage = message as any as TTSAudioMessage;
            // Add to audio playback queue
            addToQueue(ttsMessage.data);

            // Auto-start playback if not already playing
            if (!isPlayingRef.current) {
              // Use setTimeout to avoid race conditions and ensure queue is updated
              setTimeout(() => {
                if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
                  playAudio();
                }
              }, 10);
            }
          }

          // Handle audio data for visualization (matching old code)
          if (
            message.event === "media" &&
            message.data &&
            Array.isArray(message.data)
          ) {
            const audioData = message.data as number[];
            // Calculate amplitude for visualization
            const amplitude =
              audioData.reduce((sum, sample) => sum + Math.abs(sample), 0) /
              audioData.length;
            setCurrentAmplitude(amplitude);

            // Notify audio data handlers
            audioDataHandlersRef.current.forEach((handler) =>
              handler(audioData)
            );
          }

          // Notify message handlers
          messageHandlersRef.current.forEach(
            (handler: (message: WebSocketResponse) => void) => handler(message)
          );
        } catch (err) {
          console.warn("Failed to parse WebSocket message:", event.data);
        }
      };

      ws.onclose = (event) => {
        if (
          !event.wasClean &&
          reconnectAttemptsRef.current < fullConfig.maxReconnectAttempts
        ) {
          updateConnectionState("reconnecting");
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, fullConfig.reconnectDelay);
        } else {
          updateConnectionState("disconnected");
        }
      };

      ws.onerror = () => {
        const error = createError(
          "WebSocket connection error",
          "WS_CONNECTION_ERROR"
        );
        handleError(error);
        updateConnectionState("error");
      };
    } catch (err) {
      const error = createError(
        err instanceof Error ? err.message : "Failed to connect",
        "CONNECTION_FAILED"
      );
      handleError(error);
      updateConnectionState("error");
    }
  }, [
    fullConfig.maxReconnectAttempts,
    fullConfig.reconnectDelay,
    fullConfig.wsEndpoint,
    fullConfig.useTokenAuth,
    updateConnectionState,
    handleError,
    createError,
  ]);

  // Disconnect logic
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up recording audio resources
    cleanupAudioResources(
      streamRef.current,
      processorRef.current,
      sourceRef.current,
      audioContextRef.current,
      wsRef.current
    );

    // Clean up playback audio resources
    if (currentAudioBufferSourceRef.current) {
      currentAudioBufferSourceRef.current.stop();
      currentAudioBufferSourceRef.current.disconnect();
      currentAudioBufferSourceRef.current = null;
    }

    if (currentGainNodeRef.current) {
      currentGainNodeRef.current.disconnect();
      currentGainNodeRef.current = null;
    }

    if (playbackAudioContextRef.current) {
      playbackAudioContextRef.current.close();
      playbackAudioContextRef.current = null;
    }

    // Reset refs
    streamRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    wsRef.current = null;

    updateConnectionState("disconnected");
    reconnectAttemptsRef.current = 0;
    setRecordingState("idle");
    setPlaybackState("idle");
    setAudioQueue([]);
    setCurrentSegment(null);
    isListeningRef.current = false;
    isPlayingRef.current = false;
    isFadingOutRef.current = false;
  }, [updateConnectionState]);

  // Reconnect logic
  const reconnect = useCallback(async () => {
    disconnect();
    await connect();
  }, [disconnect, connect]);

  // Send message logic (matching old code format)
  const sendMessage = useCallback(
    (message: VocalsMessage) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        const error = createError(
          "WebSocket is not connected",
          "WS_NOT_CONNECTED"
        );
        handleError(error);
      }
    },
    [createError, handleError]
  );

  // Voice recording logic (matching old code approach with PCM data)
  const startRecording = useCallback(async () => {
    try {
      setRecordingState("recording");
      setError(null);

      // If not connected, connect first
      if (connectionState !== "connected") {
        await connect();
        // Wait for connection to be established
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Connection timeout")),
            5000
          );
          const checkConnection = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              clearTimeout(timeout);
              resolve(undefined);
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      }

      // Ensure we're connected before proceeding
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        throw new Error("Failed to establish WebSocket connection");
      }

      // Send start event (matching old code)
      sendMessage({ event: "start" });

      // Initialize audio processing (matching old code)
      const { stream, audioContext, source, processor } =
        await initializeAudioProcessing((audioData: AudioProcessorMessage) => {
          // Only send audio data if we're actively listening
          if (!isListeningRef.current) {
            return;
          }

          // Send audio data to server (matching old code format)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(
                JSON.stringify({
                  event: "media",
                  data: audioData.data,
                  format: audioData.format,
                  sampleRate: audioData.sampleRate,
                })
              );
            } catch (error) {
              console.error("Error sending audio data:", error);
            }
          }
        });

      // Store references
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;

      // Send settings event with sample rate
      sendMessage({
        event: "settings",
        sampleRate: audioContext.sampleRate,
      });

      // Now, allow media events to be sent
      isListeningRef.current = true;
    } catch (err) {
      const error = createError(
        err instanceof Error ? err.message : "Failed to start recording",
        "RECORDING_FAILED"
      );
      handleError(error);
      setRecordingState("error");
    }
  }, [connectionState, connect, sendMessage, createError, handleError]);

  // Stop recording logic (matching old code)
  const stopRecording = useCallback(async () => {
    isListeningRef.current = false;
    setRecordingState("idle");

    // Send stop event (matching old code)
    sendMessage({ event: "stop" });

    // Clean up audio resources
    cleanupAudioResources(
      streamRef.current,
      processorRef.current,
      sourceRef.current,
      audioContextRef.current,
      null // Don't close websocket, just audio resources
    );

    // Reset audio refs
    streamRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
  }, [sendMessage]);

  // Audio playback methods
  const addToQueue = useCallback((segment: TTSAudioSegment) => {
    setAudioQueue((prev) => {
      // Prevent duplicate segments based on segment_id and sentence_number
      const isDuplicate = prev.some(
        (existing) =>
          existing.segment_id === segment.segment_id &&
          existing.sentence_number === segment.sentence_number
      );

      if (isDuplicate) {
        console.warn(
          "Duplicate audio segment detected, skipping:",
          segment.segment_id
        );
        return prev;
      }

      return [...prev, segment];
    });
  }, []);

  const clearQueue = useCallback(() => {
    setAudioQueue([]);
    setCurrentSegment(null);

    // Also stop any currently playing audio
    if (currentAudioBufferSourceRef.current) {
      try {
        currentAudioBufferSourceRef.current.stop();
        currentAudioBufferSourceRef.current.disconnect();
      } catch (error) {
        console.warn("Error stopping audio during queue clear:", error);
      }
      currentAudioBufferSourceRef.current = null;
    }

    // Clean up gain node
    if (currentGainNodeRef.current) {
      try {
        currentGainNodeRef.current.disconnect();
      } catch (error) {
        console.warn(
          "Error disconnecting gain node during queue clear:",
          error
        );
      }
      currentGainNodeRef.current = null;
    }

    setPlaybackState("idle");
    isPlayingRef.current = false;
    isFadingOutRef.current = false;
  }, []);

  // Add a ref to track the current queue to avoid stale closures
  const audioQueueRef = useRef<TTSAudioSegment[]>([]);

  // Update the ref whenever the queue changes
  useEffect(() => {
    audioQueueRef.current = audioQueue;
  }, [audioQueue]);

  const playNextSegment = useCallback(async () => {
    // Prevent multiple simultaneous calls or during fade out
    if (isPlayingRef.current || isFadingOutRef.current) {
      return;
    }

    // Use the ref to get the current queue state
    const currentQueue = audioQueueRef.current;
    if (currentQueue.length === 0) {
      setPlaybackState("idle");
      setCurrentSegment(null);
      isPlayingRef.current = false;
      return;
    }

    // Set playing state immediately to prevent race conditions
    isPlayingRef.current = true;
    setPlaybackState("playing");

    const nextSegment = currentQueue[0];
    // Remove the segment from queue immediately
    setAudioQueue((prev) => prev.slice(1));
    setCurrentSegment(nextSegment);

    try {
      // Initialize playback audio context if needed
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new AudioContext();
      }

      const audioContext = playbackAudioContextRef.current;

      // Ensure audio context is running
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Create audio buffer from Base64 data
      const audioBuffer = await createAudioBufferFromBase64(
        audioContext,
        nextSegment.audio_data
      );

      // Stop any currently playing audio
      if (currentAudioBufferSourceRef.current) {
        currentAudioBufferSourceRef.current.stop();
        currentAudioBufferSourceRef.current.disconnect();
      }

      // Create new audio buffer source and gain node for smooth fading
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      source.buffer = audioBuffer;

      // Connect: source -> gainNode -> destination
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set up playback completion handler - simplified without setState callback
      source.onended = () => {
        currentAudioBufferSourceRef.current = null;
        currentGainNodeRef.current = null;
        isPlayingRef.current = false;
        isFadingOutRef.current = false;
        setCurrentSegment(null);

        // Check if there are more segments to play using the ref
        setTimeout(() => {
          const remainingQueue = audioQueueRef.current;
          if (remainingQueue.length > 0 && !isPlayingRef.current) {
            playNextSegment();
          } else {
            setPlaybackState("idle");
          }
        }, 10);
      };

      // Store references and start playback
      currentAudioBufferSourceRef.current = source;
      currentGainNodeRef.current = gainNode;
      source.start();
      playbackStartTimeRef.current = audioContext.currentTime;
    } catch (err) {
      const error = createError(
        err instanceof Error ? err.message : "Failed to play audio",
        "PLAYBACK_FAILED"
      );
      handleError(error);
      setPlaybackState("error");
      isPlayingRef.current = false;

      // Try to play next segment on error after a delay
      setTimeout(() => {
        const remainingQueue = audioQueueRef.current;
        if (remainingQueue.length > 0 && !isPlayingRef.current) {
          playNextSegment();
        }
      }, 100);
    }
  }, [createError, handleError]); // Removed audioQueue dependency

  const playAudio = useCallback(async () => {
    // Prevent multiple simultaneous calls or during fade out
    if (isPlayingRef.current || isFadingOutRef.current) return;

    if (playbackState === "paused") {
      // Resume paused audio
      if (playbackAudioContextRef.current?.state === "suspended") {
        await playbackAudioContextRef.current.resume();
        setPlaybackState("playing");
        isPlayingRef.current = true;
      }
    } else if (audioQueueRef.current.length > 0) {
      // Only start playing if there's something in the queue
      await playNextSegment();
    }
  }, [playbackState, playNextSegment]);

  const pauseAudio = useCallback(() => {
    if (playbackAudioContextRef.current && isPlayingRef.current) {
      playbackAudioContextRef.current.suspend();
      setPlaybackState("paused");
      isPlayingRef.current = false;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudioBufferSourceRef.current) {
      try {
        currentAudioBufferSourceRef.current.stop();
        currentAudioBufferSourceRef.current.disconnect();
      } catch (error) {
        // Ignore errors if audio is already stopped
        console.warn("Error stopping audio:", error);
      }
      currentAudioBufferSourceRef.current = null;
    }

    if (currentGainNodeRef.current) {
      currentGainNodeRef.current.disconnect();
      currentGainNodeRef.current = null;
    }

    setPlaybackState("idle");
    setCurrentSegment(null);
    isPlayingRef.current = false;
    isFadingOutRef.current = false;
    playbackOffsetRef.current = 0;
  }, []);

  // Smooth fade out audio over specified duration
  const fadeOutAudio = useCallback(async (duration: number = 500) => {
    return new Promise<void>((resolve) => {
      if (
        !currentGainNodeRef.current ||
        !playbackAudioContextRef.current ||
        isFadingOutRef.current
      ) {
        resolve();
        return;
      }

      const gainNode = currentGainNodeRef.current;
      const audioContext = playbackAudioContextRef.current;
      const currentTime = audioContext.currentTime;

      // Set fade out flag
      isFadingOutRef.current = true;

      // Exponential fade out for more natural sound
      gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        currentTime + duration / 1000
      );

      // Stop audio after fade completes
      setTimeout(() => {
        try {
          if (currentAudioBufferSourceRef.current) {
            currentAudioBufferSourceRef.current.stop();
            currentAudioBufferSourceRef.current.disconnect();
            currentAudioBufferSourceRef.current = null;
          }

          if (currentGainNodeRef.current) {
            currentGainNodeRef.current.disconnect();
            currentGainNodeRef.current = null;
          }

          setPlaybackState("idle");
          setCurrentSegment(null);
          isPlayingRef.current = false;
          isFadingOutRef.current = false;
        } catch (error) {
          console.warn("Error during fade out cleanup:", error);
        }
        resolve();
      }, duration);
    });
  }, []);

  // Event handler registration
  const onMessage = useCallback(
    (handler: (message: WebSocketResponse) => void) => {
      messageHandlersRef.current.add(handler);
      return () => messageHandlersRef.current.delete(handler);
    },
    []
  );

  const onConnectionChange = useCallback(
    (handler: (state: ConnectionState) => void) => {
      connectionHandlersRef.current.add(handler);
      return () => connectionHandlersRef.current.delete(handler);
    },
    []
  );

  const onError = useCallback((handler: (error: VocalsError) => void) => {
    errorHandlersRef.current.add(handler);
    return () => errorHandlersRef.current.delete(handler);
  }, []);

  const onAudioData = useCallback((handler: (audioData: number[]) => void) => {
    audioDataHandlersRef.current.add(handler);
    return () => audioDataHandlersRef.current.delete(handler);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (fullConfig.autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [fullConfig.autoConnect, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Get token info from token manager
  const tokenInfo =
    fullConfig.useTokenAuth && tokenManagerRef.current
      ? tokenManagerRef.current.getTokenInfo()
      : { token: null, expiresAt: null };

  return {
    // Connection state
    connectionState,
    isConnected: connectionState === "connected",
    isConnecting:
      connectionState === "connecting" || connectionState === "reconnecting",

    // Token management
    token: tokenInfo.token,
    tokenExpiresAt: tokenInfo.expiresAt,

    // Recording state
    recordingState,
    isRecording: recordingState === "recording",

    // Playback state
    playbackState,
    isPlaying: playbackState === "playing",
    audioQueue,
    currentSegment,

    // Error handling
    error,

    // Connection methods
    connect,
    disconnect,
    reconnect,

    // Voice methods
    startRecording,
    stopRecording,

    // Playback methods
    playAudio,
    pauseAudio,
    stopAudio,
    fadeOutAudio,
    clearQueue,
    addToQueue,

    // Messaging
    sendMessage,

    // Event handlers
    onMessage,
    onConnectionChange,
    onError,
    onAudioData,

    // Audio amplitude
    currentAmplitude,
  };
}

// Additional utility hooks

// Hook for just token management (without WebSocket)
export function useVocalsToken(
  config: Pick<UseVocalsConfig, "tokenEndpoint" | "headers"> = {}
) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<VocalsError | null>(null);

  const tokenManagerRef = useRef<TokenManager | null>(null);

  useEffect(() => {
    tokenManagerRef.current = new TokenManager(
      config.tokenEndpoint || DEFAULT_CONFIG.tokenEndpoint,
      config.headers || {},
      DEFAULT_CONFIG.tokenRefreshBuffer
    );
  }, [config.tokenEndpoint, config.headers]);

  const fetchToken = useCallback(async () => {
    if (!tokenManagerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      const newToken = await tokenManagerRef.current.getToken();
      const tokenInfo = tokenManagerRef.current.getTokenInfo();

      setToken(newToken);
      setExpiresAt(tokenInfo.expiresAt);
    } catch (err) {
      const error: VocalsError = {
        message: err instanceof Error ? err.message : "Failed to fetch token",
        code: "TOKEN_FETCH_FAILED",
        timestamp: Date.now(),
      };
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    token,
    expiresAt,
    isLoading,
    error,
    fetchToken,
    clearToken: () => {
      tokenManagerRef.current?.clear();
      setToken(null);
      setExpiresAt(null);
    },
  };
}
