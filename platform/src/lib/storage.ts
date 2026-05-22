import type {
  CreateDotDeviceInput,
  DotDevice,
  UserApiKey,
  UserSettings,
  VoiceAgent,
} from "../types";

const STORAGE_KEY = "opendot-platform-agents-v1";
const DEVICE_STORAGE_KEY = "opendot-platform-dot-devices-v1";
const USER_SETTINGS_KEY = "opendot-platform-user-settings-v1";
const API_KEYS_KEY = "opendot-platform-api-keys-v1";

const defaultUserSettings: UserSettings = {
  displayName: "Marco",
  email: "",
  workspaceName: "OpenDot Lab",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
  compactMode: false,
};

export function loadAgents() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VoiceAgent[]) : [];
  } catch {
    return [];
  }
}

export function saveAgents(agents: VoiceAgent[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function loadDotDevices() {
  try {
    const raw = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DotDevice[]).map(normalizeDotDevice) : [];
  } catch {
    return [];
  }
}

export function saveDotDevices(devices: DotDevice[]) {
  window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(devices));
}

export function loadUserSettings() {
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) {
      return defaultUserSettings;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return normalizeUserSettings(parsed);
  } catch {
    return defaultUserSettings;
  }
}

export function saveUserSettings(settings: UserSettings) {
  window.localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadUserApiKeys() {
  try {
    const raw = window.localStorage.getItem(API_KEYS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UserApiKey[]).map(normalizeApiKey) : [];
  } catch {
    return [];
  }
}

export function saveUserApiKeys(keys: UserApiKey[]) {
  window.localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

export function createUserApiKey(name: string): UserApiKey {
  const token = createApiToken();

  return {
    id: createId("api_key"),
    name,
    token,
    prefix: token.slice(0, 14),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    status: "active",
  };
}

export function createDotDevice(input: CreateDotDeviceInput): DotDevice {
  const now = new Date().toISOString();

  return {
    id: createId("dot"),
    name: input.name,
    model: input.model,
    serialNumber: input.serialNumber,
    availability: "unknown",
    ipAddress: input.ipAddress,
    deviceEndpoint: input.deviceEndpoint,
    lastSeenAt: null,
    boundAgentId: null,
    boundAgentName: null,
    boundConfigVersion: null,
    boundAt: null,
    updateMode: "idle",
    updatedAt: now,
  };
}

export function createId(prefix = "agent") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeDotDevice(device: DotDevice & { otaEndpoint?: string }): DotDevice {
  const { otaEndpoint: legacyEndpoint, ...currentDevice } = device;

  return {
    ...currentDevice,
    deviceEndpoint: currentDevice.deviceEndpoint ?? legacyEndpoint ?? "demo://custom-dot",
    availability: currentDevice.availability ?? "unknown",
    lastSeenAt: currentDevice.lastSeenAt ?? null,
    boundAgentId: currentDevice.boundAgentId ?? null,
    boundAgentName: currentDevice.boundAgentName ?? null,
    boundConfigVersion: currentDevice.boundConfigVersion ?? null,
    boundAt: currentDevice.boundAt ?? null,
    updateMode: currentDevice.updateMode ?? "idle",
    updatedAt: currentDevice.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeUserSettings(settings: Partial<UserSettings>): UserSettings {
  return {
    displayName: settings.displayName ?? defaultUserSettings.displayName,
    email: settings.email ?? defaultUserSettings.email,
    workspaceName: settings.workspaceName ?? defaultUserSettings.workspaceName,
    timezone: settings.timezone ?? defaultUserSettings.timezone,
    compactMode: Boolean(settings.compactMode),
  };
}

function normalizeApiKey(key: UserApiKey): UserApiKey {
  return {
    id: key.id ?? createId("api_key"),
    name: key.name ?? "SDK key",
    token: key.token ?? null,
    prefix: key.prefix ?? key.token?.slice(0, 14) ?? "od_sk",
    createdAt: key.createdAt ?? new Date().toISOString(),
    lastUsedAt: key.lastUsedAt ?? null,
    status: key.status ?? "active",
  };
}

function createApiToken() {
  const bytes = new Uint8Array(24);

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  const body = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `od_sk_${body}`;
}
