import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  Cpu,
  Link2,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Server,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CreateDotDeviceInput, DotDevice, VoiceAgent } from "../types";

type DotDevicePageProps = {
  agents: VoiceAgent[];
  devices: DotDevice[];
  selectedAgent: VoiceAgent | null;
  onCreateDevice: (input: CreateDotDeviceInput) => Promise<DotDevice | null>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  onUpdateDevice: (device: DotDevice) => Promise<DotDevice | null>;
};

type DeviceLog = {
  id: string;
  text: string;
};

type RuntimeDeviceEvent = {
  id: string;
  text: string;
  timestamp: string;
};

type RuntimeDevice = {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  availability: DotDevice["availability"];
  state: string;
  ipAddress: string;
  lastSeenAt: string | null;
  connectedAt: string | null;
  updatedAt: string;
  boundAgentId: string | null;
  boundAgentName: string | null;
  boundConfigVersion: string | null;
  boundAt: string | null;
  events: RuntimeDeviceEvent[];
};

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function appendLog(setLog: Dispatch<SetStateAction<DeviceLog[]>>, text: string) {
  setLog((current) =>
    [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: `[${new Date().toLocaleTimeString()}] ${text}`,
      },
      ...current,
    ].slice(0, 80),
  );
}

function formatTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function availabilityLabel(device: DotDevice) {
  if (device.availability === "available") {
    return "Available";
  }

  if (device.availability === "offline") {
    return "Offline";
  }

  return "Unknown";
}

function endpointBase(endpoint: string) {
  return endpoint.replace(/\/+$/, "");
}

function runtimeBaseFromEnv() {
  const configuredHttp = import.meta.env.VITE_RUNTIME_HTTP_URL;
  if (configuredHttp) {
    return endpointBase(configuredHttp);
  }

  const configuredWs = import.meta.env.VITE_RUNTIME_WS_URL;
  if (configuredWs) {
    try {
      const url = new URL(configuredWs);
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return endpointBase(url.toString());
    } catch {
      return "http://localhost:8787";
    }
  }

  return "http://localhost:8787";
}

const runtimeApiBase = runtimeBaseFromEnv();

const initialDeviceInput: CreateDotDeviceInput = {
  name: "",
  model: "Dot S3",
  serialNumber: "",
  ipAddress: "",
  deviceEndpoint: runtimeApiBase,
};

function runtimeDeviceId(deviceId: string) {
  return `runtime:${deviceId}`;
}

function isRuntimeDevice(device: DotDevice) {
  return (
    device.id.startsWith("runtime:") ||
    endpointBase(device.deviceEndpoint) === runtimeApiBase
  );
}

function runtimeSerial(device: DotDevice) {
  return device.id.startsWith("runtime:")
    ? device.id.slice("runtime:".length)
    : device.serialNumber;
}

function runtimeEventText(event: RuntimeDeviceEvent) {
  return `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.text}`;
}

export function DotDevicePage({
  agents,
  devices: persistedDevices,
  selectedAgent,
  onCreateDevice,
  onRemoveDevice,
  onUpdateDevice,
}: DotDevicePageProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    () => persistedDevices[0]?.id ?? null,
  );
  const [deviceInput, setDeviceInput] =
    useState<CreateDotDeviceInput>(initialDeviceInput);
  const [bindingAgentId, setBindingAgentId] = useState(selectedAgent?.id ?? "");
  const [deviceLog, setDeviceLog] = useState<DeviceLog[]>([]);
  const [runtimeDevices, setRuntimeDevices] = useState<RuntimeDevice[]>([]);
  const [runtimeStatus, setRuntimeStatus] =
    useState<DotDevice["availability"]>("unknown");
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);

  useEffect(() => {
    if (selectedAgent) {
      setBindingAgentId(selectedAgent.id);
    }
  }, [selectedAgent]);

  const persistedDeviceIds = useMemo(
    () => new Set(persistedDevices.map((device) => device.id)),
    [persistedDevices],
  );

  const devices = useMemo(() => {
    const nextDevices = [...persistedDevices];

    for (const runtimeDevice of runtimeDevices) {
      const id = runtimeDeviceId(runtimeDevice.id);
      const existingIndex = nextDevices.findIndex(
        (device) => device.id === id || device.serialNumber === runtimeDevice.id,
      );
      const existing = existingIndex === -1 ? null : nextDevices[existingIndex];
      const merged: DotDevice = {
        id,
        name: existing?.name ?? runtimeDevice.name,
        model: runtimeDevice.model || existing?.model || "Dot S3",
        serialNumber: runtimeDevice.id,
        availability: runtimeDevice.availability,
        ipAddress: runtimeDevice.ipAddress || existing?.ipAddress || "",
        deviceEndpoint: runtimeApiBase,
        lastSeenAt: runtimeDevice.lastSeenAt ?? existing?.lastSeenAt ?? null,
        boundAgentId: runtimeDevice.boundAgentId ?? existing?.boundAgentId ?? null,
        boundAgentName: runtimeDevice.boundAgentName ?? existing?.boundAgentName ?? null,
        boundConfigVersion:
          runtimeDevice.boundConfigVersion ?? existing?.boundConfigVersion ?? null,
        boundAt: runtimeDevice.boundAt ?? existing?.boundAt ?? null,
        updateMode: existing?.updateMode ?? "idle",
        updatedAt:
          runtimeDevice.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
      };

      if (existingIndex === -1) {
        nextDevices.push(merged);
      } else {
        nextDevices[existingIndex] = merged;
      }
    }

    return nextDevices.sort((left, right) => {
      const leftRuntime = isRuntimeDevice(left) ? 0 : 1;
      const rightRuntime = isRuntimeDevice(right) ? 0 : 1;
      return leftRuntime - rightRuntime;
    });
  }, [persistedDevices, runtimeDevices]);

  useEffect(() => {
    if (selectedDeviceId && devices.some((device) => device.id === selectedDeviceId)) {
      return;
    }

    setSelectedDeviceId(devices[0]?.id ?? null);
  }, [devices, selectedDeviceId]);

  const syncRuntimeDevices = useCallback((nextRuntimeDevices: RuntimeDevice[]) => {
    setSelectedDeviceId((current) => {
      if (current) {
        return current;
      }
      const [firstRuntimeDevice] = nextRuntimeDevices;
      return firstRuntimeDevice ? runtimeDeviceId(firstRuntimeDevice.id) : null;
    });
  }, []);

  const refreshRuntimeDevices = useCallback(
    async (logResult = false) => {
      setRuntimeRefreshing(true);
      try {
        const response = await fetch(`${runtimeApiBase}/devices`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Runtime returned ${response.status}.`);
        }

        const body = (await response.json()) as { devices?: RuntimeDevice[] };
        const nextRuntimeDevices = Array.isArray(body.devices) ? body.devices : [];
        setRuntimeDevices(nextRuntimeDevices);
        setRuntimeStatus("available");
        syncRuntimeDevices(nextRuntimeDevices);

        if (logResult) {
          appendLog(
            setDeviceLog,
            `Runtime online. ${nextRuntimeDevices.length} device${nextRuntimeDevices.length === 1 ? "" : "s"} seen.`,
          );
        }
      } catch (error) {
        setRuntimeStatus("offline");
        if (logResult) {
          appendLog(
            setDeviceLog,
            `Runtime unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } finally {
        setRuntimeRefreshing(false);
      }
    },
    [syncRuntimeDevices],
  );

  useEffect(() => {
    refreshRuntimeDevices(false);
    const interval = window.setInterval(() => {
      refreshRuntimeDevices(false);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [refreshRuntimeDevices]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const bindingAgent = agents.find((agent) => agent.id === bindingAgentId) ?? null;
  const runtimeDeviceById = useMemo(
    () => new Map(runtimeDevices.map((device) => [device.id, device])),
    [runtimeDevices],
  );
  const selectedRuntimeDevice = useMemo(() => {
    if (!selectedDevice) {
      return null;
    }

    const serial = runtimeSerial(selectedDevice);
    return runtimeDeviceById.get(serial) ?? null;
  }, [runtimeDeviceById, selectedDevice]);

  function updateDevice(deviceId: string, update: (device: DotDevice) => DotDevice) {
    const device = devices.find((item) => item.id === deviceId);
    if (!device) {
      return;
    }
    onUpdateDevice(update(device)).catch(() => undefined);
  }

  async function handleCreateDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = deviceInput.name.trim();
    const serialNumber = deviceInput.serialNumber.trim();

    if (!name || !serialNumber) {
      return;
    }

    const device = await onCreateDevice({
      ...deviceInput,
      name,
      serialNumber,
      model: deviceInput.model.trim() || "Dot S3",
      ipAddress: deviceInput.ipAddress.trim(),
      deviceEndpoint: deviceInput.deviceEndpoint.trim() || "demo://custom-dot",
    });

    if (!device) {
      return;
    }

    setSelectedDeviceId(device.id);
    setDeviceInput(initialDeviceInput);
    appendLog(setDeviceLog, `Paired ${device.name}.`);
  }

  function removeDevice(deviceId: string) {
    const removed = devices.find((device) => device.id === deviceId);

    if (removed && !persistedDeviceIds.has(deviceId) && isRuntimeDevice(removed)) {
      appendLog(
        setDeviceLog,
        `${removed.name} is discovered from the runtime and will disappear when it disconnects.`,
      );
      return;
    }

    onRemoveDevice(deviceId).catch(() => undefined);
    setSelectedDeviceId((current) => {
      if (current !== deviceId) {
        return current;
      }

      const nextDevice = devices.find((device) => device.id !== deviceId);
      return nextDevice?.id ?? null;
    });

    if (removed) {
      appendLog(setDeviceLog, `Removed ${removed.name}.`);
    }
  }

  async function checkAvailability(device: DotDevice) {
    updateDevice(device.id, (current) => ({
      ...current,
      updateMode: "checking",
      updatedAt: new Date().toISOString(),
    }));

    let nextAvailability: DotDevice["availability"] = "unknown";
    let runtimeDevice: RuntimeDevice | null = null;

    if (isRuntimeDevice(device)) {
      try {
        const response = await fetch(`${runtimeApiBase}/devices`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Runtime returned ${response.status}.`);
        }
        const body = (await response.json()) as { devices?: RuntimeDevice[] };
        const nextRuntimeDevices = Array.isArray(body.devices) ? body.devices : [];
        runtimeDevice =
          nextRuntimeDevices.find((item) => item.id === runtimeSerial(device)) ?? null;
        setRuntimeDevices(nextRuntimeDevices);
        setRuntimeStatus("available");
        syncRuntimeDevices(nextRuntimeDevices);
        nextAvailability = runtimeDevice?.availability ?? "offline";
      } catch {
        setRuntimeStatus("offline");
        nextAvailability = "offline";
      }
    } else if (device.deviceEndpoint.startsWith("demo://")) {
      await wait(550);
      nextAvailability = device.deviceEndpoint.includes("lobby")
        ? "offline"
        : "available";
    } else if (device.deviceEndpoint.startsWith("http")) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);

      try {
        const response = await fetch(`${endpointBase(device.deviceEndpoint)}/health`, {
          signal: controller.signal,
        });
        nextAvailability = response.ok ? "available" : "offline";
      } catch {
        nextAvailability = "offline";
      } finally {
        window.clearTimeout(timeout);
      }
    }

    const now = new Date().toISOString();
    updateDevice(device.id, (current) => ({
      ...current,
      availability: nextAvailability,
      ipAddress: runtimeDevice?.ipAddress ?? current.ipAddress,
      lastSeenAt:
        runtimeDevice?.lastSeenAt ??
        (nextAvailability === "available" ? now : current.lastSeenAt),
      updateMode: "idle",
      updatedAt: now,
    }));
    appendLog(setDeviceLog, `${device.name} is ${nextAvailability}.`);
  }

  async function checkAllDevices() {
    await refreshRuntimeDevices(true);

    for (const device of devices.filter((item) => !isRuntimeDevice(item))) {
      await checkAvailability(device);
    }
  }

  async function bindVoiceConfig() {
    if (!selectedDevice || !bindingAgent) {
      return;
    }

    const now = new Date().toISOString();
    updateDevice(selectedDevice.id, (device) => ({
      ...device,
      updateMode: "binding",
      updatedAt: now,
    }));
    appendLog(setDeviceLog, `Binding ${bindingAgent.name} to ${selectedDevice.name}.`);

    const payload = {
      deviceId: selectedDevice.id,
      agent: {
        id: bindingAgent.id,
        name: bindingAgent.name,
        description: bindingAgent.description,
        updatedAt: bindingAgent.updatedAt,
        pipeline: bindingAgent.pipeline,
      },
    };

    try {
      if (isRuntimeDevice(selectedDevice)) {
        const response = await fetch(
          `${runtimeApiBase}/devices/${encodeURIComponent(runtimeSerial(selectedDevice))}/config`,
          {
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.error || `Runtime rejected config with ${response.status}.`,
          );
        }

        const body = (await response.json()) as { device?: RuntimeDevice };
        if (body.device) {
          setRuntimeDevices((current) => [
            body.device as RuntimeDevice,
            ...current.filter((device) => device.id !== body.device?.id),
          ]);
          syncRuntimeDevices([
            body.device as RuntimeDevice,
            ...runtimeDevices.filter((device) => device.id !== body.device?.id),
          ]);
        }
      } else if (selectedDevice.deviceEndpoint.startsWith("http")) {
        const response = await fetch(
          `${endpointBase(selectedDevice.deviceEndpoint)}/config`,
          {
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
        );

        if (!response.ok) {
          throw new Error(`Device rejected config with ${response.status}.`);
        }
      } else {
        await wait(700);
      }

      appendLog(setDeviceLog, `${selectedDevice.name} accepted the voice config.`);
    } catch (error) {
      appendLog(
        setDeviceLog,
        `Config stored locally; device push failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      updateDevice(selectedDevice.id, (device) => ({
        ...device,
        boundAgentId: bindingAgent.id,
        boundAgentName: bindingAgent.name,
        boundConfigVersion: bindingAgent.updatedAt,
        boundAt: now,
        updateMode: "idle",
        updatedAt: now,
      }));
    }
  }

  return (
    <section className="page-section" aria-labelledby="dot-device-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dot Device</p>
          <h2 id="dot-device-title">Paired devices</h2>
        </div>
        <div className="section-actions">
          <span className={`runtime-chip ${runtimeStatus}`}>
            <Server size={15} />
            Runtime {availabilityLabel({ availability: runtimeStatus } as DotDevice)}
          </span>
          <button
            className="secondary-action"
            type="button"
            onClick={checkAllDevices}
            disabled={runtimeRefreshing}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="device-grid">
        <section className="panel device-list-panel" aria-labelledby="device-list-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2 id="device-list-title">Dot devices</h2>
            </div>
            <span className="count-pill">{devices.length}</span>
          </div>

          <div className="device-list">
            {devices.map((device) => {
              const active = device.id === selectedDeviceId;
              const StatusIcon = device.availability === "available" ? Wifi : WifiOff;
              const runtimeDevice = runtimeDeviceById.get(runtimeSerial(device));

              return (
                <button
                  className={`device-row ${active ? "active" : ""}`}
                  key={device.id}
                  type="button"
                  onClick={() => setSelectedDeviceId(device.id)}
                >
                  <span className={`device-status-dot ${device.availability}`}>
                    <StatusIcon size={15} />
                  </span>
                  <span className="device-row-copy">
                    <strong>{device.name}</strong>
                    <small>
                      {device.model} / {device.serialNumber}
                    </small>
                    <em>
                      {availabilityLabel(device)}
                      {runtimeDevice?.state ? ` / ${runtimeDevice.state}` : ""} /{" "}
                      {formatTime(device.lastSeenAt)}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>

          <form className="device-form" onSubmit={handleCreateDevice}>
            <label>
              Name
              <input
                value={deviceInput.name}
                onChange={(event) =>
                  setDeviceInput((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Conference Dot"
                required
              />
            </label>
            <label>
              Serial
              <input
                value={deviceInput.serialNumber}
                onChange={(event) =>
                  setDeviceInput((current) => ({
                    ...current,
                    serialNumber: event.target.value,
                  }))
                }
                placeholder="DOT-S3-0003"
                required
              />
            </label>
            <label>
              Model
              <select
                value={deviceInput.model}
                onChange={(event) =>
                  setDeviceInput((current) => ({ ...current, model: event.target.value }))
                }
              >
                <option>Dot S3</option>
                <option>Dot Lite</option>
                <option>Dot Dev Board</option>
              </select>
            </label>
            <label>
              Device endpoint
              <input
                value={deviceInput.deviceEndpoint}
                onChange={(event) =>
                  setDeviceInput((current) => ({
                    ...current,
                    deviceEndpoint: event.target.value,
                  }))
                }
                placeholder="demo://custom-dot"
              />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={17} />
              Pair device
            </button>
          </form>
        </section>

        <section className="device-detail-stack">
          <section className="panel device-summary-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Availability</p>
                <h2>{selectedDevice?.name ?? "No device selected"}</h2>
              </div>
              <Cpu size={18} />
            </div>

            {selectedDevice ? (
              <>
                <div className="device-stats">
                  <div>
                    <span>Status</span>
                    <strong className={`device-pill ${selectedDevice.availability}`}>
                      {availabilityLabel(selectedDevice)}
                    </strong>
                  </div>
                  <div>
                    <span>Runtime state</span>
                    <strong>{selectedRuntimeDevice?.state ?? "Not connected"}</strong>
                  </div>
                  <div>
                    <span>Model</span>
                    <strong>{selectedDevice.model}</strong>
                  </div>
                  <div>
                    <span>IP</span>
                    <strong>{selectedDevice.ipAddress || "Unknown"}</strong>
                  </div>
                  <div>
                    <span>Last seen</span>
                    <strong>{formatTime(selectedDevice.lastSeenAt)}</strong>
                  </div>
                  <div>
                    <span>Bound agent</span>
                    <strong>{selectedDevice.boundAgentName ?? "None"}</strong>
                  </div>
                </div>

                <div className="device-actions">
                  <button
                    type="button"
                    onClick={() => checkAvailability(selectedDevice)}
                    disabled={selectedDevice.updateMode !== "idle"}
                  >
                    <Radio size={16} />
                    Check
                  </button>
                  <button type="button" onClick={() => removeDevice(selectedDevice.id)}>
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Router size={22} />
                <p>No paired devices.</p>
              </div>
            )}
          </section>

          <section className="panel binding-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Voice Config</p>
                <h2>Device binding</h2>
              </div>
              <Link2 size={18} />
            </div>

            <div className="binding-controls">
              <label>
                Agent
                <select
                  value={bindingAgentId}
                  onChange={(event) => setBindingAgentId(event.target.value)}
                  disabled={agents.length === 0}
                >
                  <option value="">
                    {agents.length === 0 ? "No agents" : "Select agent"}
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={bindVoiceConfig}
                disabled={!selectedDevice || !bindingAgent}
              >
                <CheckCircle2 size={17} />
                Bind config
              </button>
            </div>

            <div className="binding-meta">
              <span>{selectedDevice?.boundAgentName ?? "No agent bound"}</span>
              <strong>
                {selectedDevice?.boundAt
                  ? formatTime(selectedDevice.boundAt)
                  : "Not synced"}
              </strong>
            </div>
          </section>

          <section className="runtime-log device-log">
            <div>
              <Router size={14} />
              Device events
            </div>
            <ol>
              {deviceLog.length === 0 ? (
                selectedRuntimeDevice?.events.length ? (
                  selectedRuntimeDevice.events.map((item) => (
                    <li key={item.id}>{runtimeEventText(item)}</li>
                  ))
                ) : (
                  <li>Device events will appear here.</li>
                )
              ) : (
                [
                  ...(selectedRuntimeDevice?.events ?? []).map((item) => ({
                    id: item.id,
                    text: runtimeEventText(item),
                  })),
                  ...deviceLog,
                ].map((item) => <li key={item.id}>{item.text}</li>)
              )}
            </ol>
          </section>
        </section>
      </div>
    </section>
  );
}
