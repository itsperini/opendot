import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimDeviceActivation,
  createRealtimeBrowserSession,
  createRuntimeVoiceSession,
  setPlatformAccessTokenProvider,
} from "./platformApi";

describe("platform API runtime auth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setPlatformAccessTokenProvider(null);
  });

  it("mints browser voice sessions with the active user bearer token", async () => {
    setPlatformAccessTokenProvider(() => "user-session-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          voiceSession: {
            url: "ws://localhost:8787/voice?voice_token=od_vt_test",
            expiresAt: "2026-05-23T14:00:00.000Z",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const voiceSession = await createRuntimeVoiceSession("agent-1");

    expect(voiceSession.url).toContain("voice_token=od_vt_test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runtime/voice-sessions",
      expect.objectContaining({
        body: JSON.stringify({ agentId: "agent-1" }),
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers.get("Authorization")).toBe(
      "Bearer user-session-token",
    );
  });

  it("claims spoken device activation codes through the platform API", async () => {
    setPlatformAccessTokenProvider(() => "user-session-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          device: {
            id: "device-1",
            name: "Dot 000001",
            model: "Dot S3",
            serialNumber: "DOT-000001",
            availability: "available",
            ipAddress: "",
            deviceEndpoint: "http://localhost:8787",
            lastSeenAt: null,
            boundAgentId: null,
            boundAgentName: null,
            boundConfigVersion: null,
            boundAt: null,
            updateMode: "idle",
            updatedAt: "2026-05-23T14:00:00.000Z",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const device = await claimDeviceActivation({ code: "123456" });

    expect(device.id).toBe("device-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/device-activations/claim",
      expect.objectContaining({
        body: JSON.stringify({ code: "123456" }),
        method: "POST",
      }),
    );
  });

  it("mints realtime browser sessions with the active user bearer token", async () => {
    setPlatformAccessTokenProvider(() => "user-session-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          realtimeSession: {
            token: "od_vt_realtime",
            clientSecretUrl: "http://localhost:8787/realtime/client-secret",
            expiresAt: "2026-05-23T14:00:00.000Z",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const realtimeSession = await createRealtimeBrowserSession("agent-1");

    expect(realtimeSession.token).toBe("od_vt_realtime");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runtime/realtime-browser-sessions",
      expect.objectContaining({
        body: JSON.stringify({ agentId: "agent-1" }),
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers.get("Authorization")).toBe(
      "Bearer user-session-token",
    );
  });
});
