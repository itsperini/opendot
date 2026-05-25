export interface DeviceRuntimeCredentialStatus {
  ok: boolean;
  message: string;
}

export interface DeviceRealtimeBridge {
  preconnect(): void;
  startListening(): void;
  handleAudio(frame: Buffer): void;
  stopListening(): void;
  abort(reason?: string): void;
  close(reason?: string): void;
}

export function realtimeWebSocketUrl(model?: string): string;

export function resamplePcm16Mono(
  pcm: Buffer | Uint8Array,
  fromRate: number,
  toRate: number,
): Buffer;

export function encodePcmToOpusFrames(
  pcm: Buffer,
  sampleRate?: number,
  frameDurationMs?: number,
  OpusScriptImpl?: unknown,
): Buffer[];

export function createPcmToOpusFrameEncoder(
  sampleRate?: number,
  frameDurationMs?: number,
  OpusScriptImpl?: unknown,
): {
  push(pcm: Buffer): Buffer[];
  flush(): Buffer[];
  close(): void;
};

export function deviceRuntimeCredentialStatus(
  runtimeConfig: Record<string, unknown> | null,
  credentials: {
    openaiApiKey?: string;
    deepgramApiKey?: string;
    llmConfigured?: boolean;
  },
): DeviceRuntimeCredentialStatus;

export function realtimeSessionUpdatePayload(runtimeConfig: Record<string, unknown>): {
  type: "session.update";
  session: Record<string, unknown>;
};

export function createDeviceRealtimeBridge(
  options: Record<string, unknown>,
): DeviceRealtimeBridge;
