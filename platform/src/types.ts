export type PipelineStageId = "vad" | "stt" | "llm" | "tts";

export type StageSettingValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>;

export type StageOption = {
  label: string;
  value: string | number;
  description?: string;
};

export type StageSetting = {
  key: string;
  label: string;
  value: StageSettingValue;
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  maxItems?: number;
  step?: number;
  control:
    | "select"
    | "multi-select"
    | "multi-text"
    | "switch"
    | "textarea"
    | "text"
    | "number"
    | "key-value-list";
  options?: StageOption[];
};

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  provider: string;
  model: string;
  modelOptions: StageOption[];
  allowCustomModel?: boolean;
  purpose: string;
  latencyTargetMs: number;
  settings: StageSetting[];
  emits: string[];
};

export type VoiceArchitecture = "sandwich" | "speech_to_speech";

export type RealtimeProvider = "openai";

export type RealtimeReasoningEffort = "low" | "medium" | "high";

export type RealtimeTurnDetectionType = "semantic_vad" | "server_vad";

export type RealtimeTurnEagerness = "auto" | "low" | "medium" | "high";

export type RealtimeTurnDetectionConfig = {
  type: RealtimeTurnDetectionType;
  eagerness: RealtimeTurnEagerness;
  threshold: number;
  prefixPaddingMs: number;
  silenceDurationMs: number;
  createResponse: boolean;
  interruptResponse: boolean;
};

export type RealtimeVoiceAgentConfig = {
  provider: RealtimeProvider;
  model: string;
  voice: string;
  instructions: string;
  reasoningEffort: RealtimeReasoningEffort;
  turnDetection: RealtimeTurnDetectionConfig;
};

export type VoiceAgent = {
  id: string;
  name: string;
  description: string;
  architecture: VoiceArchitecture;
  realtime: RealtimeVoiceAgentConfig;
  status: "draft";
  createdAt: string;
  updatedAt: string;
  pipeline: PipelineStage[];
};

export type CreateAgentInput = {
  name: string;
  description: string;
};

export type DotDeviceAvailability = "available" | "offline" | "unknown";

export type DotDeviceUpdateMode = "idle" | "checking" | "binding";

export type DotDevice = {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  availability: DotDeviceAvailability;
  ipAddress: string;
  deviceEndpoint: string;
  lastSeenAt: string | null;
  boundAgentId: string | null;
  boundAgentName: string | null;
  boundConfigVersion: string | null;
  boundAt: string | null;
  updateMode: DotDeviceUpdateMode;
  updatedAt: string;
};

export type CreateDotDeviceInput = {
  name: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  deviceEndpoint: string;
};

export type DeviceActivationClaimInput = {
  code: string;
};

export type RuntimeVoiceSession = {
  url: string;
  expiresAt: string;
};

export type RealtimeBrowserSession = {
  token: string;
  clientSecretUrl: string;
  expiresAt: string;
};

export type UserSettings = {
  displayName: string;
  email: string;
  workspaceName: string;
  timezone: string;
  compactMode: boolean;
};

export type UserApiKey = {
  id: string;
  name: string;
  token: string | null;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: "active" | "revoked";
};

export type AuthProvider = "local" | "supabase";

export type AuthSessionUser = {
  id: string;
  authProvider: AuthProvider;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type AuthSession = {
  accessToken: string;
  user: AuthSessionUser;
};

export type AuthCredentials = {
  email: string;
  password: string;
  displayName?: string;
};
