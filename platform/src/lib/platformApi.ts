import type {
  CreateAgentInput,
  CreateDotDeviceInput,
  DotDevice,
  UserApiKey,
  UserSettings,
  VoiceAgent,
} from "../types";

export type PlatformState = {
  agents: VoiceAgent[];
  devices: DotDevice[];
  userSettings: UserSettings;
  apiKeys: UserApiKey[];
};

const apiBase = (import.meta.env.VITE_PLATFORM_API_URL || "/api").replace(/\/+$/, "");

function apiPath(path: string) {
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Platform API returned ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function loadPlatformState() {
  return requestJson<PlatformState>("/platform-state", {
    cache: "no-store",
  });
}

export async function createAgent(input: CreateAgentInput) {
  const body = await requestJson<{ agent: VoiceAgent }>("/agents", {
    body: JSON.stringify(input),
    method: "POST",
  });
  return body.agent;
}

export async function updateAgent(agent: VoiceAgent) {
  const body = await requestJson<{ agent: VoiceAgent }>(`/agents/${encodeURIComponent(agent.id)}`, {
    body: JSON.stringify(agent),
    method: "PUT",
  });
  return body.agent;
}

export async function createDotDevice(input: CreateDotDeviceInput) {
  const body = await requestJson<{ device: DotDevice }>("/dot-devices", {
    body: JSON.stringify(input),
    method: "POST",
  });
  return body.device;
}

export async function updateDotDevice(device: DotDevice) {
  const body = await requestJson<{ device: DotDevice }>(
    `/dot-devices/${encodeURIComponent(device.id)}`,
    {
      body: JSON.stringify(device),
      method: "PUT",
    },
  );
  return body.device;
}

export async function deleteDotDevice(deviceId: string) {
  await requestJson<{ ok: true }>(`/dot-devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
}

export async function updateUserSettings(settings: UserSettings) {
  const body = await requestJson<{ settings: UserSettings }>("/settings", {
    body: JSON.stringify(settings),
    method: "PUT",
  });
  return body.settings;
}

export async function createUserApiKey(name: string) {
  const body = await requestJson<{ apiKey: UserApiKey }>("/api-keys", {
    body: JSON.stringify({ name }),
    method: "POST",
  });
  return body.apiKey;
}

export async function revokeUserApiKey(keyId: string) {
  const body = await requestJson<{ apiKey: UserApiKey | null }>(
    `/api-keys/${encodeURIComponent(keyId)}/revoke`,
    {
      method: "POST",
    },
  );
  return body.apiKey;
}
