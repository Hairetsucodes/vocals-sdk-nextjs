"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  VocalsError,
  WebSocketMessage,
  WebSocketResponse,
  AudioProcessorMessage,
  VocalsWebSocketMessage,
  TranscriptionMessage,
  LLMResponseStreamingMessage,
  LLMResponseMessage,
  DetectionMessage,
  TranscriptionStatusMessage,
  AudioSavedMessage,
  ChatMessage,
  ConversationState,
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
  /** Audio processing configuration */
  audioConfig?: AudioProcessingConfig;
}

// Audio processing configuration interface
export interface AudioProcessingConfig {
  /** Enable acoustic echo cancellation (defaults to true) */
  echoCancellation?: boolean;
  /** Enable noise suppression (defaults to true) */
  noiseSuppression?: boolean;
  /** Enable auto gain control (defaults to true) */
  autoGainControl?: boolean;
  /** Specific audio device ID to use */
  deviceId?: string;
  /** Sample rate for audio processing (defaults to 44100) */
  sampleRate?: number;
  /** Audio channel count (defaults to 1 for mono) */
  channelCount?: number;
  /** Enable advanced WebRTC audio processing (defaults to false) */
  useWebRTCProcessing?: boolean;
  /** Advanced WebRTC constraints */
  advancedConstraints?: {
    echoCancellationType?: "browser" | "system" | "aec3";
    latency?: number;
    volume?: number;
    sampleSize?: number;
  };
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

// TTS Audio segment interface (keeping local for backward compatibility)
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

  // Audio configuration and AEC utilities
  audioConfig: AudioProcessingConfig;
  isAECEnabled: boolean;
  getAudioDevices: () => Promise<MediaDeviceInfo[]>;
  setAudioDevice: (deviceId: string) => Promise<void>;
  testAudioConstraints: (
    constraints: MediaTrackConstraints
  ) => Promise<boolean>;
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
  audioConfig: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    deviceId: undefined,
    sampleRate: 44100,
    channelCount: 1,
    useWebRTCProcessing: false,
    advancedConstraints: {},
  },
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

// Audio processing functions with AEC support
async function initializeAudioProcessing(
  onAudioData: (audioData: AudioProcessorMessage) => void,
  audioConfig: AudioProcessingConfig = {}
): Promise<{
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
}> {
  // Build WebRTC-compatible audio constraints with AEC
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: audioConfig.echoCancellation ?? true,
    noiseSuppression: audioConfig.noiseSuppression ?? true,
    autoGainControl: audioConfig.autoGainControl ?? true,
    channelCount: audioConfig.channelCount ?? 1,
    sampleRate: audioConfig.sampleRate ?? 44100,
  };

  // Add device ID if specified
  if (audioConfig.deviceId) {
    audioConstraints.deviceId = { exact: audioConfig.deviceId };
  }

  // Add advanced WebRTC constraints if enabled
  if (audioConfig.useWebRTCProcessing && audioConfig.advancedConstraints) {
    const advanced = audioConfig.advancedConstraints;
    if (advanced.echoCancellationType) {
      (audioConstraints as any).echoCancellationType =
        advanced.echoCancellationType;
    }
    if (advanced.latency) {
      (audioConstraints as any).latency = advanced.latency;
    }
    if (advanced.volume) {
      (audioConstraints as any).volume = advanced.volume;
    }
    if (advanced.sampleSize) {
      (audioConstraints as any).sampleSize = advanced.sampleSize;
    }
  }

  // Get user media with AEC-enabled constraints
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
  });

  // Log audio track settings for debugging
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length > 0) {
    const settings = audioTracks[0].getSettings();
    console.log("Audio track settings:", {
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
    });
  }

  // Create audio context with preferred sample rate
  const audioContext = new AudioContext({
    sampleRate: audioConfig.sampleRate ?? 44100,
  });
  console.log("AudioContext sample rate:", audioContext.sampleRate);
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

// WebRTC-based audio processing with enhanced AEC
async function initializeWebRTCAudioProcessing(
  onAudioData: (audioData: AudioProcessorMessage) => void,
  audioConfig: AudioProcessingConfig = {}
): Promise<{
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  peerConnection?: RTCPeerConnection;
}> {
  // Create RTCPeerConnection for advanced audio processing
  const peerConnection = new RTCPeerConnection({
    iceServers: [], // No ICE servers needed for local processing
  });

  // Get media with enhanced WebRTC constraints
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: audioConfig.echoCancellation ?? true,
    noiseSuppression: audioConfig.noiseSuppression ?? true,
    autoGainControl: audioConfig.autoGainControl ?? true,
    channelCount: audioConfig.channelCount ?? 1,
    sampleRate: audioConfig.sampleRate ?? 44100,
  };

  // Add device ID if specified
  if (audioConfig.deviceId) {
    audioConstraints.deviceId = { exact: audioConfig.deviceId };
  }

  // Add advanced WebRTC constraints
  if (audioConfig.advancedConstraints) {
    const advanced = audioConfig.advancedConstraints;
    Object.assign(audioConstraints, advanced);
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
  });

  // Add stream to peer connection for processing
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  // Create audio context with enhanced settings
  const audioContext = new AudioContext({
    sampleRate: audioConfig.sampleRate ?? 44100,
    latencyHint: "interactive",
  });

  // Add the audio worklet module with enhanced processing
  await audioContext.audioWorklet.addModule(
    URL.createObjectURL(
      new Blob(
        [
          `
        class EnhancedAudioProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.bufferSize = 4096;
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;
          }

          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input[0]) {
              const audioData = input[0];
              
              // Enhanced buffering for better AEC performance
              for (let i = 0; i < audioData.length; i++) {
                this.buffer[this.bufferIndex] = audioData[i];
                this.bufferIndex++;
                
                if (this.bufferIndex >= this.bufferSize) {
                  // Send processed audio data to main thread
                  this.port.postMessage({
                    data: Array.from(this.buffer),
                    format: 'pcm_f32le',
                    sampleRate: sampleRate,
                    bufferSize: this.bufferSize,
                    timestamp: currentTime
                  });
                  this.bufferIndex = 0;
                }
              }
            }
            return true;
          }
        }
        registerProcessor('enhanced-audio-processor', EnhancedAudioProcessor);
      `,
        ],
        { type: "application/javascript" }
      )
    )
  );

  // Create source and processor nodes
  const source = audioContext.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(
    audioContext,
    "enhanced-audio-processor"
  );

  // Handle processed audio data
  processor.port.onmessage = (event) => {
    onAudioData({
      data: event.data.data,
      format: event.data.format,
      sampleRate: audioContext.sampleRate,
    });
  };

  // Connect nodes
  source.connect(processor);

  // Log WebRTC processing status
  console.log("WebRTC audio processing initialized with enhanced AEC");

  return { stream, audioContext, source, processor, peerConnection };
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
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

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
            const interruptionMessage = message as any as {
              type: "speech_interruption";
              data: {
                segment_id: string;
                start_time: number;
                reason: "new_speech_segment" | "speech_segment_merged" | string;
                connection_id?: number;
                timestamp: number;
              };
            };
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
            const ttsMessage = message as any as {
              type: "tts_audio";
              data: TTSAudioSegment;
            };
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

    // Clean up WebRTC peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
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

      // Initialize audio processing with AEC configuration
      const processingResult = fullConfig.audioConfig.useWebRTCProcessing
        ? await initializeWebRTCAudioProcessing(
            (audioData: AudioProcessorMessage) => {
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
            },
            fullConfig.audioConfig
          )
        : await initializeAudioProcessing(
            (audioData: AudioProcessorMessage) => {
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
            },
            fullConfig.audioConfig
          );

      const { stream, audioContext, source, processor } = processingResult;

      // Store references
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;

      // Store peer connection if using WebRTC processing
      if (fullConfig.audioConfig.useWebRTCProcessing) {
        const webrtcResult = processingResult as any;
        if (webrtcResult.peerConnection) {
          peerConnectionRef.current = webrtcResult.peerConnection;
        }
      }

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

    // Clean up WebRTC peer connection if exists
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
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

  // Audio utility functions
  const getAudioDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error getting audio devices:", error);
      return [];
    }
  }, []);

  const setAudioDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      // Update the audio config with the new device ID
      fullConfig.audioConfig.deviceId = deviceId;

      // If currently recording, restart with the new device
      if (recordingState === "recording") {
        await stopRecording();
        await startRecording();
      }
    },
    [recordingState, stopRecording, startRecording, fullConfig.audioConfig]
  );

  const testAudioConstraints = useCallback(
    async (constraints: MediaTrackConstraints): Promise<boolean> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: constraints,
        });
        const tracks = stream.getAudioTracks();
        if (tracks.length > 0) {
          tracks.forEach((track) => track.stop());
          return true;
        }
        return false;
      } catch (error) {
        console.error("Audio constraints test failed:", error);
        return false;
      }
    },
    []
  );

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

    // Audio configuration and AEC utilities
    audioConfig: fullConfig.audioConfig,
    isAECEnabled: fullConfig.audioConfig.echoCancellation ?? true,
    getAudioDevices,
    setAudioDevice,
    testAudioConstraints,
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

// Configuration for conversation hook
export interface UseVocalsConversationConfig extends UseVocalsConfig {
  /** Auto-play TTS audio when received (defaults to true) */
  autoPlayAudio?: boolean;
  /** Auto-clear conversation on disconnect (defaults to false) */
  autoClearOnDisconnect?: boolean;
  /** Maximum number of messages to keep in conversation (defaults to 100) */
  maxMessages?: number;
  /** Debounce time for partial transcript updates in ms (defaults to 100) */
  transcriptDebounceMs?: number;
}

// Return interface for conversation hook
export interface UseVocalsConversationReturn
  extends Omit<UseVocalsReturn, "onMessage"> {
  // Conversation state
  messages: ChatMessage[];
  currentTranscript: string;
  isProcessing: boolean;
  lastActivity: Date | null;

  // Conversation methods
  clearConversation: () => void;
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  removeMessage: (id: string) => void;

  // Enhanced event handlers
  onTranscription: (
    handler: (message: TranscriptionMessage) => void
  ) => () => void;
  onLLMResponse: (handler: (message: LLMResponseMessage) => void) => () => void;
  onLLMStreaming: (
    handler: (message: LLMResponseStreamingMessage) => void
  ) => () => void;
  onDetection: (handler: (message: DetectionMessage) => void) => () => void;
  onAudioSaved: (handler: (message: AudioSavedMessage) => void) => () => void;
  onRawMessage: (handler: (message: WebSocketResponse) => void) => () => void;
}

// High-level conversation hook that handles all message parsing and state management
export function useVocalsConversation(
  config: UseVocalsConversationConfig = {}
): UseVocalsConversationReturn {
  const {
    autoPlayAudio = true,
    autoClearOnDisconnect = false,
    maxMessages = 100,
    transcriptDebounceMs = 100,
    ...vocalsConfig
  } = config;

  // Use the base vocals hook
  const vocals = useVocals(vocalsConfig);

  // Conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  // Event handlers
  const transcriptionHandlersRef = useRef<
    Set<(message: TranscriptionMessage) => void>
  >(new Set());
  const llmResponseHandlersRef = useRef<
    Set<(message: LLMResponseMessage) => void>
  >(new Set());
  const llmStreamingHandlersRef = useRef<
    Set<(message: LLMResponseStreamingMessage) => void>
  >(new Set());
  const detectionHandlersRef = useRef<Set<(message: DetectionMessage) => void>>(
    new Set()
  );
  const audioSavedHandlersRef = useRef<
    Set<(message: AudioSavedMessage) => void>
  >(new Set());
  const rawMessageHandlersRef = useRef<
    Set<(message: WebSocketResponse) => void>
  >(new Set());

  // Debounced transcript update
  const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to update last activity
  const updateLastActivity = useCallback(() => {
    setLastActivity(new Date());
  }, []);

  // Helper function to add/update messages with deduplication
  const addOrUpdateMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((msg) => msg.id === message.id);

        if (existingIndex !== -1) {
          // Update existing message
          const updated = [...prev];
          updated[existingIndex] = message;
          return updated;
        } else {
          // Add new message and trim if needed
          const newMessages = [...prev, message];
          return newMessages.length > maxMessages
            ? newMessages.slice(-maxMessages)
            : newMessages;
        }
      });
    },
    [maxMessages]
  );

  // Conversation methods
  const clearConversation = useCallback(() => {
    setMessages([]);
    setCurrentTranscript("");
    setIsProcessing(false);
    setLastActivity(null);
  }, []);

  const addMessage = useCallback(
    (message: Omit<ChatMessage, "id" | "timestamp">) => {
      const newMessage: ChatMessage = {
        ...message,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      };
      addOrUpdateMessage(newMessage);
    },
    [addOrUpdateMessage]
  );

  const updateMessage = useCallback(
    (id: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  // Message handler with type parsing
  const handleMessage = useCallback(
    (message: WebSocketResponse) => {
      updateLastActivity();

      // Notify raw message handlers
      rawMessageHandlersRef.current.forEach((handler) => handler(message));

      // Handle different message types
      if ((message as any).type === "transcription" && (message as any).data) {
        const transcriptionMessage = message as any as TranscriptionMessage;

        // Notify transcription handlers
        transcriptionHandlersRef.current.forEach((handler) =>
          handler(transcriptionMessage)
        );

        // Update conversation state
        const { text, is_partial, segment_id, confidence } =
          transcriptionMessage.data;

        const chatMessage: ChatMessage = {
          id: segment_id,
          text,
          timestamp: new Date(),
          isUser: true,
          isPartial: is_partial,
          segmentId: segment_id,
          confidence,
        };

        addOrUpdateMessage(chatMessage);
        setCurrentTranscript(is_partial ? text : "");
        setIsProcessing(is_partial);
      } else if (
        (message as any).type === "llm_response_streaming" &&
        (message as any).data
      ) {
        const streamingMessage = message as any as LLMResponseStreamingMessage;

        // Notify streaming handlers
        llmStreamingHandlersRef.current.forEach((handler) =>
          handler(streamingMessage)
        );

        // Update conversation state
        const { token, accumulated_response, is_complete, segment_id } =
          streamingMessage.data;

        const chatMessage: ChatMessage = {
          id: `${segment_id}-streaming`,
          text: accumulated_response || token,
          timestamp: new Date(),
          isUser: false,
          isPartial: !is_complete,
          segmentId: segment_id,
        };

        addOrUpdateMessage(chatMessage);
        setIsProcessing(!is_complete);
      } else if (
        (message as any).type === "llm_response" &&
        (message as any).data
      ) {
        const responseMessage = message as any as LLMResponseMessage;

        // Notify response handlers
        llmResponseHandlersRef.current.forEach((handler) =>
          handler(responseMessage)
        );

        // Update conversation state
        const { response, segment_id } = responseMessage.data;

        const chatMessage: ChatMessage = {
          id: segment_id || `llm_${Date.now()}`,
          text: response,
          timestamp: new Date(),
          isUser: false,
          isPartial: false,
          segmentId: segment_id,
        };

        addOrUpdateMessage(chatMessage);
        setIsProcessing(false);
      } else if (
        (message as any).type === "detection" &&
        (message as any).text
      ) {
        const detectionMessage = message as any as DetectionMessage;

        // Notify detection handlers
        detectionHandlersRef.current.forEach((handler) =>
          handler(detectionMessage)
        );

        // Update current transcript if recording
        if (vocals.isRecording) {
          const { text } = detectionMessage;

          // Debounce transcript updates
          if (transcriptTimeoutRef.current) {
            clearTimeout(transcriptTimeoutRef.current);
          }

          transcriptTimeoutRef.current = setTimeout(() => {
            setCurrentTranscript(text);
          }, transcriptDebounceMs);
        }
      } else if (
        (message as any).type === "tts_audio" &&
        (message as any).data
      ) {
        // Handle TTS audio with auto-play
        const ttsData = (message as any).data;
        vocals.addToQueue(ttsData);

        if (autoPlayAudio && vocals.playbackState === "idle") {
          setTimeout(() => {
            if (vocals.playbackState === "idle") {
              vocals.playAudio();
            }
          }, 10);
        }
      } else if (
        (message as any).type === "audio_saved" &&
        (message as any).filename
      ) {
        const audioSavedMessage = message as any as AudioSavedMessage;

        // Notify audio saved handlers
        audioSavedHandlersRef.current.forEach((handler) =>
          handler(audioSavedMessage)
        );
      } else if (
        (message as any).type === "transcription_status" &&
        (message as any).data
      ) {
        // Update processing state based on transcription status
        setIsProcessing(true);
      }
    },
    [
      vocals,
      autoPlayAudio,
      addOrUpdateMessage,
      updateLastActivity,
      transcriptDebounceMs,
    ]
  );

  // Set up message handling
  useEffect(() => {
    const unsubscribe = vocals.onMessage(handleMessage);
    return unsubscribe;
  }, [vocals.onMessage, handleMessage]);

  // Clear conversation on disconnect if enabled
  useEffect(() => {
    if (autoClearOnDisconnect && vocals.connectionState === "disconnected") {
      clearConversation();
    }
  }, [vocals.connectionState, autoClearOnDisconnect, clearConversation]);

  // Event handler registration
  const onTranscription = useCallback(
    (handler: (message: TranscriptionMessage) => void) => {
      transcriptionHandlersRef.current.add(handler);
      return () => transcriptionHandlersRef.current.delete(handler);
    },
    []
  );

  const onLLMResponse = useCallback(
    (handler: (message: LLMResponseMessage) => void) => {
      llmResponseHandlersRef.current.add(handler);
      return () => llmResponseHandlersRef.current.delete(handler);
    },
    []
  );

  const onLLMStreaming = useCallback(
    (handler: (message: LLMResponseStreamingMessage) => void) => {
      llmStreamingHandlersRef.current.add(handler);
      return () => llmStreamingHandlersRef.current.delete(handler);
    },
    []
  );

  const onDetection = useCallback(
    (handler: (message: DetectionMessage) => void) => {
      detectionHandlersRef.current.add(handler);
      return () => detectionHandlersRef.current.delete(handler);
    },
    []
  );

  const onAudioSaved = useCallback(
    (handler: (message: AudioSavedMessage) => void) => {
      audioSavedHandlersRef.current.add(handler);
      return () => audioSavedHandlersRef.current.delete(handler);
    },
    []
  );

  const onRawMessage = useCallback(
    (handler: (message: WebSocketResponse) => void) => {
      rawMessageHandlersRef.current.add(handler);
      return () => rawMessageHandlersRef.current.delete(handler);
    },
    []
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (transcriptTimeoutRef.current) {
        clearTimeout(transcriptTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Include all vocals functionality
    ...vocals,

    // Conversation state
    messages,
    currentTranscript,
    isProcessing,
    lastActivity,

    // Conversation methods
    clearConversation,
    addMessage,
    updateMessage,
    removeMessage,

    // Enhanced event handlers
    onTranscription,
    onLLMResponse,
    onLLMStreaming,
    onDetection,
    onAudioSaved,
    onRawMessage,
  };
}

// Configuration for transcription hook
export interface UseVocalsTranscriptionConfig extends UseVocalsConfig {
  /** Auto-clear transcript on disconnect (defaults to false) */
  autoClearOnDisconnect?: boolean;
  /** Debounce time for partial transcript updates in ms (defaults to 100) */
  transcriptDebounceMs?: number;
  /** Keep transcript history (defaults to true) */
  keepHistory?: boolean;
  /** Maximum number of transcript entries to keep (defaults to 50) */
  maxHistory?: number;
}

// Transcript entry interface
export interface TranscriptEntry {
  id: string;
  text: string;
  confidence: number;
  timestamp: Date;
  isPartial: boolean;
  segmentId: string;
}

// Return interface for transcription hook
export interface UseVocalsTranscriptionReturn
  extends Omit<UseVocalsReturn, "onMessage"> {
  // Transcription state
  currentTranscript: string;
  transcriptHistory: TranscriptEntry[];
  isTranscribing: boolean;
  averageConfidence: number;

  // Transcription methods
  clearTranscript: () => void;
  clearHistory: () => void;
  getTranscriptText: () => string;
  getHistoryText: () => string;

  // Enhanced event handlers
  onTranscription: (
    handler: (message: TranscriptionMessage) => void
  ) => () => void;
  onDetection: (handler: (message: DetectionMessage) => void) => () => void;
  onFinalTranscript: (handler: (entry: TranscriptEntry) => void) => () => void;
  onRawMessage: (handler: (message: WebSocketResponse) => void) => () => void;
}

// Specialized hook for transcription functionality
export function useVocalsTranscription(
  config: UseVocalsTranscriptionConfig = {}
): UseVocalsTranscriptionReturn {
  const {
    autoClearOnDisconnect = false,
    transcriptDebounceMs = 100,
    keepHistory = true,
    maxHistory = 50,
    ...vocalsConfig
  } = config;

  // Use the base vocals hook
  const vocals = useVocals(vocalsConfig);

  // Transcription state
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>(
    []
  );
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [averageConfidence, setAverageConfidence] = useState<number>(0);

  // Event handlers
  const transcriptionHandlersRef = useRef<
    Set<(message: TranscriptionMessage) => void>
  >(new Set());
  const detectionHandlersRef = useRef<Set<(message: DetectionMessage) => void>>(
    new Set()
  );
  const finalTranscriptHandlersRef = useRef<
    Set<(entry: TranscriptEntry) => void>
  >(new Set());
  const rawMessageHandlersRef = useRef<
    Set<(message: WebSocketResponse) => void>
  >(new Set());

  // Debounced transcript update
  const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to calculate average confidence
  const calculateAverageConfidence = useCallback(
    (history: TranscriptEntry[]) => {
      if (history.length === 0) return 0;
      const total = history.reduce((sum, entry) => sum + entry.confidence, 0);
      return total / history.length;
    },
    []
  );

  // Helper to add transcript entry
  const addTranscriptEntry = useCallback(
    (entry: TranscriptEntry) => {
      if (keepHistory) {
        setTranscriptHistory((prev) => {
          const newHistory = [...prev, entry];
          const trimmedHistory =
            newHistory.length > maxHistory
              ? newHistory.slice(-maxHistory)
              : newHistory;

          // Update average confidence
          setAverageConfidence(calculateAverageConfidence(trimmedHistory));

          return trimmedHistory;
        });
      }
    },
    [keepHistory, maxHistory, calculateAverageConfidence]
  );

  // Transcription methods
  const clearTranscript = useCallback(() => {
    setCurrentTranscript("");
    setIsTranscribing(false);
  }, []);

  const clearHistory = useCallback(() => {
    setTranscriptHistory([]);
    setAverageConfidence(0);
  }, []);

  const getTranscriptText = useCallback(() => {
    return currentTranscript;
  }, [currentTranscript]);

  const getHistoryText = useCallback(() => {
    return transcriptHistory
      .filter((entry) => !entry.isPartial)
      .map((entry) => entry.text)
      .join(" ");
  }, [transcriptHistory]);

  // Message handler with transcription focus
  const handleMessage = useCallback(
    (message: WebSocketResponse) => {
      // Notify raw message handlers
      rawMessageHandlersRef.current.forEach((handler) => handler(message));

      // Handle transcription messages
      if ((message as any).type === "transcription" && (message as any).data) {
        const transcriptionMessage = message as any as TranscriptionMessage;

        // Notify transcription handlers
        transcriptionHandlersRef.current.forEach((handler) =>
          handler(transcriptionMessage)
        );

        // Update transcription state
        const {
          text,
          is_partial,
          segment_id,
          confidence = 0,
        } = transcriptionMessage.data;

        setCurrentTranscript(text);
        setIsTranscribing(is_partial);

        // Create transcript entry
        const entry: TranscriptEntry = {
          id: segment_id,
          text,
          confidence,
          timestamp: new Date(),
          isPartial: is_partial,
          segmentId: segment_id,
        };

        // Add to history if it's a final transcript
        if (!is_partial) {
          addTranscriptEntry(entry);

          // Notify final transcript handlers
          finalTranscriptHandlersRef.current.forEach((handler) =>
            handler(entry)
          );

          // Clear current transcript after final
          setCurrentTranscript("");
          setIsTranscribing(false);
        }
      } else if (
        (message as any).type === "detection" &&
        (message as any).text
      ) {
        const detectionMessage = message as any as DetectionMessage;

        // Notify detection handlers
        detectionHandlersRef.current.forEach((handler) =>
          handler(detectionMessage)
        );

        // Update current transcript if recording
        if (vocals.isRecording) {
          const { text } = detectionMessage;

          // Debounce transcript updates
          if (transcriptTimeoutRef.current) {
            clearTimeout(transcriptTimeoutRef.current);
          }

          transcriptTimeoutRef.current = setTimeout(() => {
            setCurrentTranscript(text);
            setIsTranscribing(true);
          }, transcriptDebounceMs);
        }
      }
    },
    [vocals.isRecording, addTranscriptEntry, transcriptDebounceMs]
  );

  // Set up message handling
  useEffect(() => {
    const unsubscribe = vocals.onMessage(handleMessage);
    return unsubscribe;
  }, [vocals.onMessage, handleMessage]);

  // Clear transcript on disconnect if enabled
  useEffect(() => {
    if (autoClearOnDisconnect && vocals.connectionState === "disconnected") {
      clearTranscript();
      clearHistory();
    }
  }, [
    vocals.connectionState,
    autoClearOnDisconnect,
    clearTranscript,
    clearHistory,
  ]);

  // Event handler registration
  const onTranscription = useCallback(
    (handler: (message: TranscriptionMessage) => void) => {
      transcriptionHandlersRef.current.add(handler);
      return () => transcriptionHandlersRef.current.delete(handler);
    },
    []
  );

  const onDetection = useCallback(
    (handler: (message: DetectionMessage) => void) => {
      detectionHandlersRef.current.add(handler);
      return () => detectionHandlersRef.current.delete(handler);
    },
    []
  );

  const onFinalTranscript = useCallback(
    (handler: (entry: TranscriptEntry) => void) => {
      finalTranscriptHandlersRef.current.add(handler);
      return () => finalTranscriptHandlersRef.current.delete(handler);
    },
    []
  );

  const onRawMessage = useCallback(
    (handler: (message: WebSocketResponse) => void) => {
      rawMessageHandlersRef.current.add(handler);
      return () => rawMessageHandlersRef.current.delete(handler);
    },
    []
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (transcriptTimeoutRef.current) {
        clearTimeout(transcriptTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Include all vocals functionality
    ...vocals,

    // Transcription state
    currentTranscript,
    transcriptHistory,
    isTranscribing,
    averageConfidence,

    // Transcription methods
    clearTranscript,
    clearHistory,
    getTranscriptText,
    getHistoryText,

    // Enhanced event handlers
    onTranscription,
    onDetection,
    onFinalTranscript,
    onRawMessage,
  };
}

// Configuration for visualization hook
export interface UseVocalsVisualizationConfig extends UseVocalsConfig {
  /** Buffer size for audio data (defaults to 1024) */
  bufferSize?: number;
  /** Smoothing factor for amplitude (0-1, defaults to 0.8) */
  smoothing?: number;
  /** FFT size for frequency analysis (defaults to 2048) */
  fftSize?: number;
  /** Enable frequency analysis (defaults to true) */
  enableFrequencyAnalysis?: boolean;
  /** Sample rate for visualization (defaults to 44100) */
  visualizationSampleRate?: number;
}

// Audio visualization data
export interface AudioVisualizationData {
  // Time domain data
  waveform: number[];
  amplitude: number;
  smoothedAmplitude: number;

  // Frequency domain data (if enabled)
  frequencyData?: Uint8Array;
  frequencyBins?: number[];

  // Metadata
  timestamp: number;
  sampleRate: number;
  bufferSize: number;
}

// Return interface for visualization hook
export interface UseVocalsVisualizationReturn extends UseVocalsReturn {
  // Visualization state
  visualizationData: AudioVisualizationData | null;
  isVisualizing: boolean;

  // Visualization methods
  startVisualization: () => void;
  stopVisualization: () => void;
  resetVisualization: () => void;

  // Enhanced event handlers
  onVisualizationData: (
    handler: (data: AudioVisualizationData) => void
  ) => () => void;
  onAmplitudeChange: (handler: (amplitude: number) => void) => () => void;
}

// Specialized hook for audio visualization
export function useVocalsVisualization(
  config: UseVocalsVisualizationConfig = {}
): UseVocalsVisualizationReturn {
  const {
    bufferSize = 1024,
    smoothing = 0.8,
    fftSize = 2048,
    enableFrequencyAnalysis = true,
    visualizationSampleRate = 44100,
    ...vocalsConfig
  } = config;

  // Use the base vocals hook
  const vocals = useVocals(vocalsConfig);

  // Visualization state
  const [visualizationData, setVisualizationData] =
    useState<AudioVisualizationData | null>(null);
  const [isVisualizing, setIsVisualizing] = useState<boolean>(false);

  // Visualization refs
  const smoothedAmplitudeRef = useRef<number>(0);
  const visualizationFrameRef = useRef<number | null>(null);

  // Event handlers
  const visualizationDataHandlersRef = useRef<
    Set<(data: AudioVisualizationData) => void>
  >(new Set());
  const amplitudeChangeHandlersRef = useRef<Set<(amplitude: number) => void>>(
    new Set()
  );

  // Audio analysis functions
  const analyzeAudioData = useCallback(
    (audioData: number[]) => {
      if (!isVisualizing) return;

      // Calculate amplitude
      const rawAmplitude =
        audioData.reduce((sum, sample) => sum + Math.abs(sample), 0) /
        audioData.length;

      // Apply smoothing
      smoothedAmplitudeRef.current =
        smoothedAmplitudeRef.current * smoothing +
        rawAmplitude * (1 - smoothing);

      // Prepare waveform data (downsample if needed)
      const waveform =
        audioData.length > bufferSize
          ? audioData
              .filter(
                (_, i) => i % Math.floor(audioData.length / bufferSize) === 0
              )
              .slice(0, bufferSize)
          : audioData;

      // Frequency analysis (if enabled)
      let frequencyData: Uint8Array | undefined;
      let frequencyBins: number[] | undefined;

      if (enableFrequencyAnalysis && audioData.length >= fftSize) {
        // Simple FFT approximation for frequency analysis
        // In a real implementation, you'd use a proper FFT library
        const nyquist = visualizationSampleRate / 2;
        const binSize = nyquist / (fftSize / 2);

        frequencyBins = [];
        for (let i = 0; i < fftSize / 2; i++) {
          frequencyBins.push(i * binSize);
        }

        // Simplified frequency analysis - you'd want a proper FFT here
        frequencyData = new Uint8Array(fftSize / 2);
        for (let i = 0; i < frequencyData.length; i++) {
          // This is a simplified approximation
          const startIndex = Math.floor(
            (i * audioData.length) / frequencyData.length
          );
          const endIndex = Math.floor(
            ((i + 1) * audioData.length) / frequencyData.length
          );
          const segment = audioData.slice(startIndex, endIndex);
          const amplitude =
            segment.reduce((sum, sample) => sum + Math.abs(sample), 0) /
            segment.length;
          frequencyData[i] = Math.min(255, Math.floor(amplitude * 255));
        }
      }

      // Create visualization data
      const data: AudioVisualizationData = {
        waveform,
        amplitude: rawAmplitude,
        smoothedAmplitude: smoothedAmplitudeRef.current,
        frequencyData,
        frequencyBins,
        timestamp: Date.now(),
        sampleRate: visualizationSampleRate,
        bufferSize: waveform.length,
      };

      setVisualizationData(data);

      // Notify handlers
      visualizationDataHandlersRef.current.forEach((handler) => handler(data));
      amplitudeChangeHandlersRef.current.forEach((handler) =>
        handler(smoothedAmplitudeRef.current)
      );
    },
    [
      isVisualizing,
      bufferSize,
      smoothing,
      fftSize,
      enableFrequencyAnalysis,
      visualizationSampleRate,
    ]
  );

  // Visualization methods
  const startVisualization = useCallback(() => {
    setIsVisualizing(true);
  }, []);

  const stopVisualization = useCallback(() => {
    setIsVisualizing(false);
    if (visualizationFrameRef.current) {
      cancelAnimationFrame(visualizationFrameRef.current);
      visualizationFrameRef.current = null;
    }
  }, []);

  const resetVisualization = useCallback(() => {
    setVisualizationData(null);
    smoothedAmplitudeRef.current = 0;
    if (visualizationFrameRef.current) {
      cancelAnimationFrame(visualizationFrameRef.current);
      visualizationFrameRef.current = null;
    }
  }, []);

  // Set up audio data handling
  useEffect(() => {
    const unsubscribe = vocals.onAudioData(analyzeAudioData);
    return unsubscribe;
  }, [vocals.onAudioData, analyzeAudioData]);

  // Auto-start visualization when recording starts
  useEffect(() => {
    if (vocals.isRecording && !isVisualizing) {
      startVisualization();
    } else if (!vocals.isRecording && isVisualizing) {
      stopVisualization();
    }
  }, [
    vocals.isRecording,
    isVisualizing,
    startVisualization,
    stopVisualization,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (visualizationFrameRef.current) {
        cancelAnimationFrame(visualizationFrameRef.current);
      }
    };
  }, []);

  // Event handler registration
  const onVisualizationData = useCallback(
    (handler: (data: AudioVisualizationData) => void) => {
      visualizationDataHandlersRef.current.add(handler);
      return () => visualizationDataHandlersRef.current.delete(handler);
    },
    []
  );

  const onAmplitudeChange = useCallback(
    (handler: (amplitude: number) => void) => {
      amplitudeChangeHandlersRef.current.add(handler);
      return () => amplitudeChangeHandlersRef.current.delete(handler);
    },
    []
  );

  return {
    // Include all vocals functionality
    ...vocals,

    // Visualization state
    visualizationData,
    isVisualizing,

    // Visualization methods
    startVisualization,
    stopVisualization,
    resetVisualization,

    // Enhanced event handlers
    onVisualizationData,
    onAmplitudeChange,
  };
}

// AEC Configuration Presets and Utilities
export const AECPresets = {
  // Basic AEC with standard settings
  basic: (): AudioProcessingConfig => ({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100,
    channelCount: 1,
    useWebRTCProcessing: false,
  }),

  // High-quality AEC with enhanced WebRTC processing
  enhanced: (): AudioProcessingConfig => ({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    useWebRTCProcessing: true,
    advancedConstraints: {
      echoCancellationType: "aec3",
      latency: 0.01, // 10ms latency
    },
  }),

  // Low-latency AEC optimized for real-time interactions
  lowLatency: (): AudioProcessingConfig => ({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100,
    channelCount: 1,
    useWebRTCProcessing: true,
    advancedConstraints: {
      echoCancellationType: "system",
      latency: 0.005, // 5ms latency
    },
  }),

  // High-quality AEC for music or high-fidelity audio
  highFidelity: (): AudioProcessingConfig => ({
    echoCancellation: true,
    noiseSuppression: false, // Preserve audio quality
    autoGainControl: false,
    sampleRate: 48000,
    channelCount: 2, // Stereo
    useWebRTCProcessing: true,
    advancedConstraints: {
      echoCancellationType: "aec3",
      latency: 0.02, // 20ms latency for better quality
    },
  }),

  // Minimal processing for testing or debugging
  minimal: (): AudioProcessingConfig => ({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 44100,
    channelCount: 1,
    useWebRTCProcessing: false,
  }),
};

// Utility functions for AEC management
export const AECUtils = {
  /**
   * Test if the browser supports the required AEC features
   */
  async testAECSupport(): Promise<{
    supported: boolean;
    features: {
      echoCancellation: boolean;
      noiseSuppression: boolean;
      autoGainControl: boolean;
      webRTC: boolean;
    };
  }> {
    const features = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      webRTC: false,
    };

    try {
      // Test basic audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        const settings = tracks[0].getSettings();
        features.echoCancellation = settings.echoCancellation === true;
        features.noiseSuppression = settings.noiseSuppression === true;
        features.autoGainControl = settings.autoGainControl === true;

        // Clean up
        tracks.forEach((track) => track.stop());
      }

      // Test WebRTC support
      features.webRTC = typeof RTCPeerConnection !== "undefined";
    } catch (error) {
      console.warn("AEC support test failed:", error);
    }

    return {
      supported: features.echoCancellation && features.noiseSuppression,
      features,
    };
  },

  /**
   * Get recommended AEC configuration based on browser and device capabilities
   */
  async getRecommendedConfig(): Promise<AudioProcessingConfig> {
    const support = await this.testAECSupport();

    if (!support.supported) {
      console.warn("Limited AEC support detected, using minimal configuration");
      return AECPresets.minimal();
    }

    if (support.features.webRTC) {
      return AECPresets.enhanced();
    }

    return AECPresets.basic();
  },

  /**
   * Create a custom AEC configuration with validation
   */
  createConfig(config: Partial<AudioProcessingConfig>): AudioProcessingConfig {
    const defaultConfig = AECPresets.basic();
    const mergedConfig = { ...defaultConfig, ...config };

    // Validate sample rate
    if (
      mergedConfig.sampleRate &&
      ![8000, 16000, 22050, 44100, 48000].includes(mergedConfig.sampleRate)
    ) {
      console.warn(
        `Unsupported sample rate: ${mergedConfig.sampleRate}, using 44100`
      );
      mergedConfig.sampleRate = 44100;
    }

    // Validate channel count
    if (
      mergedConfig.channelCount &&
      ![1, 2].includes(mergedConfig.channelCount)
    ) {
      console.warn(
        `Unsupported channel count: ${mergedConfig.channelCount}, using 1`
      );
      mergedConfig.channelCount = 1;
    }

    return mergedConfig;
  },

  /**
   * Test if specific audio constraints work on the current device
   */
  async testConstraints(constraints: MediaTrackConstraints): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints,
      });
      const tracks = stream.getAudioTracks();
      tracks.forEach((track) => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get available audio input devices
   */
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Failed to get audio devices:", error);
      return [];
    }
  },

  /**
   * Log detailed audio track information for debugging
   */
  async debugAudioTrack(stream: MediaStream): Promise<void> {
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      console.warn("No audio tracks found in stream");
      return;
    }

    const track = tracks[0];
    const settings = track.getSettings();
    const capabilities = track.getCapabilities();
    const constraints = track.getConstraints();

    console.group("Audio Track Debug Info");
    console.log("Settings:", settings);
    console.log("Capabilities:", capabilities);
    console.log("Constraints:", constraints);
    console.log("Label:", track.label);
    console.log("Kind:", track.kind);
    console.log("Ready State:", track.readyState);
    console.log("Muted:", track.muted);
    console.log("Enabled:", track.enabled);
    console.groupEnd();
  },
};

// Export helper function for creating AEC-enabled hooks
export function createAECEnabledHook(
  preset: keyof typeof AECPresets = "basic"
) {
  return function useVocalsWithAEC(
    config: Omit<UseVocalsConfig, "audioConfig"> = {}
  ) {
    const aecConfig = AECPresets[preset]();
    return useVocals({
      ...config,
      audioConfig: aecConfig,
    });
  };
}

// Convenience hooks with pre-configured AEC settings
export const useVocalsBasicAEC = createAECEnabledHook("basic");
export const useVocalsEnhancedAEC = createAECEnabledHook("enhanced");
export const useVocalsLowLatencyAEC = createAECEnabledHook("lowLatency");
export const useVocalsHighFidelityAEC = createAECEnabledHook("highFidelity");
