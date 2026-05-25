import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Cable,
  CheckCircle2,
  Cpu,
  Eraser,
  Hash,
  Link2,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Router,
  Server,
  Terminal,
  Trash2,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "../layout/PageHeader";
import type { CreateDotDeviceInput, DotDevice, VoiceAgent } from "../types";

type DotDevicePageProps = {
  agents: VoiceAgent[];
  devices: DotDevice[];
  selectedAgent: VoiceAgent | null;
  selectedAgentId: string | null;
  onCreateDevice: (input: CreateDotDeviceInput) => Promise<DotDevice | null>;
  onClaimDeviceActivation: (code: string) => Promise<DotDevice | null>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  onSelectAgent: (agentId: string) => void;
  onUpdateDevice: (device: DotDevice) => Promise<DotDevice | null>;
};

type DeviceLog = {
  id: string;
  text: string;
};

type SerialLogEntry = {
  id: string;
  level: "data" | "status" | "error";
  text: string;
};

type SerialPortInfo = {
  usbProductId?: number;
  usbVendorId?: number;
};

type SerialSignalState = {
  break?: boolean;
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
};

type BrowserSerialPort = {
  close: () => Promise<void>;
  getInfo?: () => SerialPortInfo;
  open: (options: { baudRate: number; bufferSize?: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  setSignals?: (signals: SerialSignalState) => Promise<void>;
};

type BrowserSerial = {
  getPorts: () => Promise<BrowserSerialPort[]>;
  requestPort: (options?: { filters?: SerialPortInfo[] }) => Promise<BrowserSerialPort>;
};

type SerialNavigator = Navigator & {
  serial?: BrowserSerial;
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

export function DotDevicePage({
  agents,
  devices: persistedDevices,
  selectedAgent,
  selectedAgentId,
  onCreateDevice,
  onClaimDeviceActivation,
  onRemoveDevice,
  onSelectAgent,
  onUpdateDevice,
}: DotDevicePageProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    () => persistedDevices[0]?.id ?? null,
  );
  const [deviceInput, setDeviceInput] =
    useState<CreateDotDeviceInput>(initialDeviceInput);
  const [activationCode, setActivationCode] = useState("");
  const [claimingActivation, setClaimingActivation] = useState(false);
  const [bindingAgentId, setBindingAgentId] = useState(selectedAgent?.id ?? "");
  const [deviceLog, setDeviceLog] = useState<DeviceLog[]>([]);
  const [runtimeStatus, setRuntimeStatus] =
    useState<DotDevice["availability"]>("unknown");
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);
  const [serialEnabled, setSerialEnabled] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [serialResetting, setSerialResetting] = useState(false);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [serialLines, setSerialLines] = useState<SerialLogEntry[]>([]);
  const serialPortRef = useRef<BrowserSerialPort | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const serialReadPromiseRef = useRef<Promise<void> | null>(null);
  const serialStopRef = useRef(false);
  const serialBufferRef = useRef("");
  const serialConsoleRef = useRef<HTMLOListElement | null>(null);
  const serialDecoderRef = useRef(new TextDecoder());
  const serialSupported =
    typeof navigator !== "undefined" &&
    Boolean((navigator as SerialNavigator).serial);

  useEffect(() => {
    if (selectedAgent) {
      setBindingAgentId(selectedAgent.id);
    }
  }, [selectedAgent]);

  const devices = useMemo(() => {
    return [...persistedDevices].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [persistedDevices]);

  useEffect(() => {
    if (selectedDeviceId && devices.some((device) => device.id === selectedDeviceId)) {
      return;
    }

    setSelectedDeviceId(devices[0]?.id ?? null);
  }, [devices, selectedDeviceId]);

  const refreshRuntimeHealth = useCallback(async (logResult = false) => {
    setRuntimeRefreshing(true);
    try {
      const response = await fetch(`${runtimeApiBase}/health`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Runtime returned ${response.status}.`);
      }

      setRuntimeStatus("available");

      if (logResult) {
        appendLog(setDeviceLog, "Runtime health check passed.");
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
  }, []);

  useEffect(() => {
    refreshRuntimeHealth(false);
  }, [refreshRuntimeHealth]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const bindingAgent = agents.find((agent) => agent.id === bindingAgentId) ?? null;
  function updateDevice(deviceId: string, update: (device: DotDevice) => DotDevice) {
    const device = devices.find((item) => item.id === deviceId);
    if (!device) {
      return;
    }
    onUpdateDevice(update(device)).catch(() => undefined);
  }

  const appendSerialEntries = useCallback(
    (entries: Array<Pick<SerialLogEntry, "level" | "text">>) => {
      if (entries.length === 0) {
        return;
      }

      setSerialLines((current) =>
        [
          ...current,
          ...entries.map((entry) => ({
            ...entry,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          })),
        ].slice(-500),
      );
    },
    [],
  );

  const appendSerialLine = useCallback(
    (text: string, level: SerialLogEntry["level"] = "data") => {
      appendSerialEntries([
        {
          level,
          text:
            level === "data"
              ? text
              : `[${new Date().toLocaleTimeString()}] ${text}`,
        },
      ]);
    },
    [appendSerialEntries],
  );

  const appendSerialChunk = useCallback((chunk: string) => {
    const normalizedChunk = chunk.replace(/\r/g, "");
    const lines = `${serialBufferRef.current}${normalizedChunk}`.split("\n");
    serialBufferRef.current = lines.pop() ?? "";
    appendSerialEntries(
      lines.map((line) => ({
        level: "data",
        text: line,
      })),
    );
  }, [appendSerialEntries]);

  const flushSerialBuffer = useCallback(() => {
    const buffered = serialBufferRef.current;
    if (!buffered) {
      return;
    }

    serialBufferRef.current = "";
    appendSerialLine(buffered);
  }, [appendSerialLine]);

  const readSerial = useCallback(async (port: BrowserSerialPort) => {
    while (port.readable && !serialStopRef.current) {
      const reader = port.readable.getReader();
      serialReaderRef.current = reader;

      try {
        while (!serialStopRef.current) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            appendSerialChunk(serialDecoderRef.current.decode(value, { stream: true }));
          }
        }
      } catch (error) {
        if (!serialStopRef.current) {
          const message = error instanceof Error ? error.message : String(error);
          setSerialError(message);
          appendSerialLine(`Serial read failed: ${message}`, "error");
        }
      } finally {
        reader.releaseLock();

        if (serialReaderRef.current === reader) {
          serialReaderRef.current = null;
        }
      }
    }
  }, [appendSerialChunk, appendSerialLine]);

  const disconnectSerial = useCallback(async () => {
    serialStopRef.current = true;

    const reader = serialReaderRef.current;
    serialReaderRef.current = null;
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }

    const readPromise = serialReadPromiseRef.current;
    if (readPromise) {
      await readPromise.catch(() => undefined);
    }

    flushSerialBuffer();

    const port = serialPortRef.current;
    serialPortRef.current = null;
    if (port) {
      await port.close().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setSerialError(message);
        appendSerialLine(`Serial close failed: ${message}`, "error");
      });
      appendSerialLine("Serial disconnected.", "status");
    }

    setSerialConnected(false);
    setSerialConnecting(false);
  }, [appendSerialLine, flushSerialBuffer]);

  useEffect(() => {
    return () => {
      void disconnectSerial();
    };
  }, [disconnectSerial]);

  useEffect(() => {
    if (serialEnabled || (!serialConnected && !serialConnecting)) {
      return;
    }

    void disconnectSerial();
  }, [disconnectSerial, serialConnected, serialConnecting, serialEnabled]);

  useEffect(() => {
    if (!serialEnabled || !serialConsoleRef.current) {
      return;
    }

    serialConsoleRef.current.scrollTop = serialConsoleRef.current.scrollHeight;
  }, [serialEnabled, serialLines]);

  async function connectSerial() {
    const serial = (navigator as SerialNavigator).serial;

    setSerialEnabled(true);
    setSerialError(null);

    if (!serial) {
      setSerialError("Web Serial is not available in this browser.");
      return;
    }

    setSerialConnecting(true);

    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: 115200, bufferSize: 64 * 1024 });

      serialPortRef.current = port;
      serialStopRef.current = false;
      serialBufferRef.current = "";
      serialDecoderRef.current = new TextDecoder();
      setSerialConnected(true);
      appendSerialLine("Serial connected at 115200 baud.", "status");

      const readPromise = readSerial(port);
      serialReadPromiseRef.current = readPromise;
      void readPromise.finally(() => {
        if (serialReadPromiseRef.current === readPromise) {
          serialReadPromiseRef.current = null;
        }

        if (!serialStopRef.current) {
          setSerialConnected(false);
        }
      });
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        appendSerialLine("Serial port selection canceled.", "status");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setSerialError(message);
        appendSerialLine(`Serial connect failed: ${message}`, "error");
      }
    } finally {
      setSerialConnecting(false);
    }
  }

  async function resetSerialDevice() {
    const port = serialPortRef.current;

    if (!port?.setSignals) {
      setSerialError("Serial reset signals are not available.");
      return;
    }

    setSerialResetting(true);
    setSerialError(null);

    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await wait(120);
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await wait(120);
      appendSerialLine("Reset pulse sent.", "status");
      appendLog(setDeviceLog, "Serial reset pulse sent.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSerialError(message);
      appendSerialLine(`Reset failed: ${message}`, "error");
    } finally {
      setSerialResetting(false);
    }
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

  async function handleClaimActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = activationCode.replace(/\D/g, "");

    if (!code) {
      return;
    }

    setClaimingActivation(true);
    try {
      const device = await onClaimDeviceActivation(code);

      if (device) {
        setSelectedDeviceId(device.id);
        setActivationCode("");
        appendLog(setDeviceLog, `Claimed ${device.name} with spoken code ${code}.`);
      }
    } finally {
      setClaimingActivation(false);
    }
  }

  function removeDevice(deviceId: string) {
    const removed = devices.find((device) => device.id === deviceId);

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

    if (device.deviceEndpoint.startsWith("demo://")) {
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
      ipAddress: current.ipAddress,
      lastSeenAt: nextAvailability === "available" ? now : current.lastSeenAt,
      updateMode: "idle",
      updatedAt: now,
    }));
    appendLog(setDeviceLog, `${device.name} is ${nextAvailability}.`);
  }

  async function checkAllDevices() {
    await refreshRuntimeHealth(true);

    for (const device of devices) {
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

    try {
      await onUpdateDevice({
        ...selectedDevice,
        boundAgentId: bindingAgent.id,
        boundAgentName: bindingAgent.name,
        boundConfigVersion: bindingAgent.updatedAt,
        boundAt: now,
        updateMode: "idle",
        updatedAt: now,
      });
      appendLog(
        setDeviceLog,
        `${bindingAgent.name} is bound in the platform API. The runtime will apply it on the next authenticated device session.`,
      );
    } catch (error) {
      appendLog(
        setDeviceLog,
        `Binding failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      updateDevice(selectedDevice.id, (device) => ({
        ...device,
        updateMode: "idle",
        updatedAt: new Date().toISOString(),
      }));
    }
  }

  return (
    <section className="page-section" aria-labelledby="dot-device-title">
      <PageHeader
        agents={agents}
        eyebrow="Dot Device"
        selectedAgentId={selectedAgentId}
        title="Hardware binding"
        titleId="dot-device-title"
        onSelectAgent={onSelectAgent}
      />

      <div className="page-body device-grid">
        <section className="panel device-list-panel" aria-labelledby="device-list-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2 id="device-list-title">Dot devices</h2>
            </div>
            <span className="count-pill">{devices.length}</span>
          </div>

          <div className="device-runtime-row">
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
              Refresh status
            </button>
          </div>

          <div className="device-list">
            {devices.map((device) => {
              const active = device.id === selectedDeviceId;
              const StatusIcon = device.availability === "available" ? Wifi : WifiOff;

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
                      {availabilityLabel(device)} / {formatTime(device.lastSeenAt)}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>

          <form className="device-form activation-form" onSubmit={handleClaimActivation}>
            <label>
              Spoken code
              <input
                value={activationCode}
                inputMode="numeric"
                onChange={(event) => setActivationCode(event.target.value)}
                placeholder="123456"
                required
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={claimingActivation}
            >
              <Hash size={17} />
              Claim code
            </button>
          </form>

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
                    <span>Auth source</span>
                    <strong>Platform credential</strong>
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
                Agent identity
                <select
                  value={bindingAgentId}
                  onChange={(event) => setBindingAgentId(event.target.value)}
                  disabled={agents.length === 0}
                >
                  <option value="">
                    {agents.length === 0 ? "No identities" : "Select identity"}
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
              <span>{selectedDevice?.boundAgentName ?? "No identity bound"}</span>
              <strong>
                {selectedDevice?.boundAt
                  ? formatTime(selectedDevice.boundAt)
                  : "Not synced"}
              </strong>
            </div>
          </section>

          <section className="panel serial-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Serial</p>
                <h2>Device console</h2>
              </div>
              <Terminal size={18} />
            </div>

            <div className="serial-toolbar">
              <label className="serial-enable-toggle">
                <input
                  checked={serialEnabled}
                  type="checkbox"
                  onChange={(event) => setSerialEnabled(event.target.checked)}
                />
                Enable serial
              </label>

              <div className="serial-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={connectSerial}
                  disabled={
                    !serialEnabled ||
                    !serialSupported ||
                    serialConnected ||
                    serialConnecting
                  }
                >
                  <Cable size={16} />
                  Connect
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={resetSerialDevice}
                  disabled={!serialEnabled || !serialConnected || serialResetting}
                >
                  <Power size={16} />
                  Reset
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={disconnectSerial}
                  disabled={!serialConnected && !serialConnecting}
                >
                  <Unplug size={16} />
                  Disconnect
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setSerialLines([])}
                  disabled={serialLines.length === 0}
                >
                  <Eraser size={16} />
                  Clear
                </button>
              </div>
            </div>

            <div
              className={`serial-status ${
                serialConnected ? "connected" : serialSupported ? "idle" : "unsupported"
              }`}
            >
              {serialConnected
                ? "Connected"
                : serialSupported
                  ? "Waiting"
                  : "Unsupported"}
            </div>

            {serialEnabled ? (
              <ol className="serial-console" ref={serialConsoleRef}>
                {serialLines.length === 0 ? (
                  <li className="status">No serial data.</li>
                ) : (
                  serialLines.map((line) => (
                    <li className={line.level} key={line.id}>
                      {line.text || " "}
                    </li>
                  ))
                )}
              </ol>
            ) : null}

            {serialError ? <p className="serial-error">{serialError}</p> : null}
          </section>

          <section className="runtime-log device-log">
            <div>
              <Router size={14} />
              Device events
            </div>
            <ol>
              {deviceLog.length === 0 ? (
                <li>Pairing, checks, and binding events will appear here.</li>
              ) : (
                deviceLog.map((item) => <li key={item.id}>{item.text}</li>)
              )}
            </ol>
          </section>
        </section>
      </div>
    </section>
  );
}
