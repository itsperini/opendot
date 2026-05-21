export type PipelineStageId = "vad" | "stt" | "llm" | "tts";

export type StageSettingValue = string | number | boolean | string[];

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
  control: "select" | "multi-select" | "switch" | "textarea";
  options?: StageOption[];
};

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  provider: string;
  model: string;
  modelOptions: StageOption[];
  purpose: string;
  latencyTargetMs: number;
  settings: StageSetting[];
  emits: string[];
};

export type VoiceAgent = {
  id: string;
  name: string;
  description: string;
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
  token: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: "active" | "revoked";
};
