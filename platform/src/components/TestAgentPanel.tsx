import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  AudioLines,
  Cable,
  Mic,
  Play,
  RotateCcw,
  Send,
  Square,
} from "lucide-react";
import type { VoiceAgent } from "../types";

type TestAgentPanelProps = {
  agent: VoiceAgent | null;
};

type RuntimeStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "error";

type TimelineEvent = {
  turnId: string;
  stage: string;
  label: string;
  elapsedMs: number;
  bytes?: number;
};

type TimelineSpan = {
  id: string;
  turnId: string;
  stage: string;
  label: string;
  group: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  bytes?: number;
  colorClass: string;
  leftPercent: number;
  widthPercent: number;
  isMilestone: boolean;
};

type SwimlaneTimeline = {
  turnId: string;
  axisMaxMs: number;
  totalMs: number;
  ticks: number[];
  spans: TimelineSpan[];
};

type LogEvent = {
  id: string;
  text: string;
};

const runtimeUrl =
  import.meta.env.VITE_RUNTIME_WS_URL || "ws://localhost:8787/voice";

function appendLog(setLog: Dispatch<SetStateAction<LogEvent[]>>, text: string) {
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

function audioMime(encoding: string | undefined) {
  if (encoding === "mp3") {
    return "audio/mpeg";
  }
  if (encoding === "wav") {
    return "audio/wav";
  }
  return "audio/mpeg";
}

function buildSwimlaneTimeline(events: TimelineEvent[]): SwimlaneTimeline | null {
  const latestTurnId = events[events.length - 1]?.turnId;

  if (!latestTurnId) {
    return null;
  }

  const turnEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.turnId === latestTurnId)
    .sort((a, b) => a.event.elapsedMs - b.event.elapsedMs || a.index - b.index);

  if (turnEvents.length === 0) {
    return null;
  }

  const totalMs = Math.max(...turnEvents.map(({ event }) => event.elapsedMs), 0);
  const axisMaxMs = niceAxisMax(totalMs);

  const spans = turnEvents.map(({ event }, index) => {
    const previousElapsedMs = index === 0 ? 0 : turnEvents[index - 1].event.elapsedMs;
    const startMs = Math.min(previousElapsedMs, event.elapsedMs);
    const endMs = Math.max(previousElapsedMs, event.elapsedMs);
    const durationMs = Math.max(0, endMs - startMs);
    const isMilestone = durationMs === 0;
    const rawLeftPercent = (startMs / axisMaxMs) * 100;
    const rawWidthPercent = (durationMs / axisMaxMs) * 100;
    const widthPercent = isMilestone
      ? 0
      : Math.min(Math.max(rawWidthPercent, 2.2), 100);
    const leftPercent = isMilestone
      ? Math.min(rawLeftPercent, 100)
      : Math.min(rawLeftPercent, 100 - widthPercent);

    return {
      id: `${event.turnId}-${event.stage}-${index}`,
      turnId: event.turnId,
      stage: event.stage,
      label: event.label,
      group: stageGroup(event.stage),
      startMs,
      endMs,
      durationMs,
      bytes: event.bytes,
      colorClass: stageColorClass(event.stage),
      leftPercent,
      widthPercent,
      isMilestone,
    };
  });

  return {
    turnId: latestTurnId,
    axisMaxMs,
    totalMs,
    ticks: axisTicks(axisMaxMs),
    spans,
  };
}

function niceAxisMax(value: number) {
  const minimum = 500;
  const target = Math.max(value, minimum);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function axisTicks(axisMaxMs: number) {
  return Array.from({ length: 5 }, (_, index) => Math.round((axisMaxMs / 4) * index));
}

function stageGroup(stage: string) {
  if (stage.startsWith("tts")) {
    return "Speech output";
  }

  if (stage.startsWith("llm")) {
    return "LLM";
  }

  return "Speech input";
}

function stageColorClass(stage: string) {
  if (stage === "stt_final") {
    return "timeline-color-stt";
  }

  if (stage === "llm_request") {
    return "timeline-color-request";
  }

  if (stage === "llm_first_delta") {
    return "timeline-color-token";
  }

  if (stage === "llm_done") {
    return "timeline-color-llm";
  }

  if (stage === "tts_request") {
    return "timeline-color-tts-request";
  }

  if (stage === "tts_done") {
    return "timeline-color-tts";
  }

  return "timeline-color-runtime";
}

function formatMs(value: number) {
  if (value >= 1000) {
    const seconds = value / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2).replace(/\.0+$/, "")} s`;
  }

  return `${Math.round(value)} ms`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }

  return `${bytes} bytes`;
}

function shortTurnId(turnId: string) {
  return turnId.slice(0, 8);
}

export function TestAgentPanel({ agent }: TestAgentPanelProps) {
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<RuntimeStatus>("disconnected");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [log, setLog] = useState<LogEvent[]>([]);

  useEffect(() => {
    return () => {
      stopMic();
      socketRef.current?.close();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (agent && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "configure", agent }));
      appendLog(setLog, `Reconfigured runtime for ${agent.name}.`);
    }
  }, [agent]);

  function connectRuntime() {
    if (!agent) {
      appendLog(setLog, "Create or select an agent before connecting.");
      return;
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "configure", agent }));
      return;
    }

    setStatus("connecting");
    const socket = new WebSocket(runtimeUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      appendLog(setLog, "Connected to local voice runtime.");
      socket.send(JSON.stringify({ type: "configure", agent }));
    });

    socket.addEventListener("close", () => {
      stopMic();
      setStatus("disconnected");
      appendLog(setLog, "Runtime socket closed.");
    });

    socket.addEventListener("error", () => {
      setStatus("error");
      appendLog(setLog, "Runtime socket error.");
    });

    socket.addEventListener("message", (event) => {
      handleRuntimeEvent(JSON.parse(event.data));
    });
  }

  function handleRuntimeEvent(payload: any) {
    if (payload.type === "runtime_connected") {
      appendLog(setLog, "Runtime accepted the WebSocket connection.");
    } else if (payload.type === "runtime_ready") {
      setStatus(recording ? "listening" : "ready");
      appendLog(setLog, "Deepgram VAD/STT stream is ready.");
    } else if (payload.type === "runtime_closed") {
      appendLog(setLog, `Deepgram stream closed (${payload.code || "no code"}).`);
    } else if (payload.type === "vad_event") {
      appendLog(setLog, `VAD event: ${payload.event}`);
    } else if (payload.type === "stt_interim") {
      setInterim(payload.text);
    } else if (payload.type === "stt_final") {
      setFinalTranscript(payload.text);
      if (payload.speechFinal) {
        setInterim("");
      }
    } else if (payload.type === "user_final") {
      setInterim("");
      setFinalTranscript(payload.text);
      setAssistantText("");
      setTimeline((current) => current.filter((item) => item.turnId !== payload.turnId));
      appendLog(setLog, `User: ${payload.text}`);
    } else if (payload.type === "assistant_start") {
      setStatus("thinking");
      setAssistantText("");
    } else if (payload.type === "assistant_delta") {
      setAssistantText((current) => current + payload.text);
    } else if (payload.type === "assistant_text") {
      setAssistantText(payload.text);
      appendLog(setLog, `Assistant: ${payload.text}`);
    } else if (payload.type === "assistant_audio") {
      const binary = Uint8Array.from(atob(payload.audioBase64), (char) =>
        char.charCodeAt(0),
      );
      const blob = new Blob([binary], { type: payload.mimeType || audioMime("mp3") });
      setAudioUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(blob);
      });
      appendLog(setLog, "Assistant audio is ready.");
    } else if (payload.type === "assistant_end") {
      setStatus(recording ? "listening" : "ready");
    } else if (payload.type === "timeline") {
      setTimeline((current) => [...current, payload].slice(-18));
    } else if (payload.type === "reset_done") {
      setInterim("");
      setFinalTranscript("");
      setAssistantText("");
      setTimeline([]);
      setAudioUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      appendLog(setLog, "Conversation reset.");
    } else if (payload.type === "error") {
      setStatus("error");
      appendLog(setLog, payload.message);
    }
  }

  async function startMic() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendLog(setLog, "Connect to the runtime before starting the microphone.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleToInt16(input, audioContext.sampleRate, 16000);
      socketRef.current.send(
        pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    sourceRef.current = source;
    processorRef.current = processor;
    setRecording(true);
    setStatus("listening");
    appendLog(setLog, `Microphone started at ${audioContext.sampleRate} Hz.`);
  }

  function stopMic() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => undefined);
    }

    processorRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    setRecording(false);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "finalize" }));
      setStatus("ready");
    }
  }

  function forceResponse() {
    socketRef.current?.send(JSON.stringify({ type: "force_response" }));
  }

  function resetConversation() {
    socketRef.current?.send(JSON.stringify({ type: "reset" }));
  }

  const connected = socketRef.current?.readyState === WebSocket.OPEN;
  const canUseMic = connected && status !== "connecting" && Boolean(agent);
  const swimlaneTimeline = buildSwimlaneTimeline(timeline);

  return (
    <section className="panel test-panel" aria-labelledby="test-agent-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Browser Test</p>
          <h2 id="test-agent-title">Run this agent</h2>
        </div>
        <span className={`runtime-status ${status}`}>{status}</span>
      </div>

      <div className="test-actions">
        <button type="button" onClick={connectRuntime} disabled={!agent || status === "connecting"}>
          <Cable size={16} />
          Connect
        </button>
        <button
          type="button"
          onClick={recording ? stopMic : () => startMic().catch((error) => appendLog(setLog, error.message))}
          disabled={!canUseMic}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}
          {recording ? "Stop mic" : "Start mic"}
        </button>
        <button type="button" onClick={forceResponse} disabled={!connected}>
          <Send size={16} />
          Force reply
        </button>
        <button type="button" onClick={resetConversation} disabled={!connected}>
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      {!agent ? (
        <div className="test-warning">
          <AlertCircle size={17} />
          Create or select an agent before opening the runtime.
        </div>
      ) : null}

      <div className="test-grid">
        <div className="test-card transcript-card">
          <span>Live transcript</span>
          <p className="interim-text">{interim || "Interim speech appears here."}</p>
          <p className="final-text">{finalTranscript || "Final user turn appears here."}</p>
        </div>

        <div className="test-card assistant-card">
          <span>Assistant</span>
          <p>{assistantText || "The agent response streams here."}</p>
          {audioUrl ? (
            <audio src={audioUrl} controls autoPlay />
          ) : (
            <div className="audio-placeholder">
              <AudioLines size={17} />
              Waiting for TTS audio
            </div>
          )}
        </div>
      </div>

      <div className="timeline-swimlanes">
        <div className="timeline-swimlanes-heading">
          <div>
            <span>Audio pipeline</span>
            <strong>
              {swimlaneTimeline ? `${formatMs(swimlaneTimeline.totalMs)} total` : "Waiting for timing"}
            </strong>
          </div>
          {swimlaneTimeline ? <small>Turn {shortTurnId(swimlaneTimeline.turnId)}</small> : null}
        </div>

        {!swimlaneTimeline ? (
          <p className="timeline-empty">No runtime timing events yet.</p>
        ) : (
          <>
            <div className="timeline-axis">
              <span>Span</span>
              <div className="timeline-axis-scale" aria-hidden="true">
                <div className="timeline-axis-labels">
                  {swimlaneTimeline.ticks.map((tick) => (
                    <span key={tick}>{formatMs(tick)}</span>
                  ))}
                </div>
                <div className="timeline-axis-line" />
              </div>
            </div>

            <div className="timeline-lanes">
              {swimlaneTimeline.spans.map((span) => {
                const timingLabel = span.isMilestone
                  ? `at ${formatMs(span.endMs)}`
                  : formatMs(span.durationMs);
                const title = `${span.label}: ${timingLabel} (${formatMs(span.startMs)} - ${formatMs(
                  span.endMs,
                )})`;
                const barStyle = {
                  "--span-left": `${span.leftPercent}%`,
                  "--span-width": `${span.widthPercent}%`,
                } as CSSProperties;

                return (
                  <div className={`timeline-lane ${span.colorClass}`} key={span.id}>
                    <div className="timeline-lane-meta">
                      <div className="timeline-lane-title">
                        <span className="timeline-dot" aria-hidden="true" />
                        <strong>{span.label}</strong>
                      </div>
                      <span>
                        {span.group} • {timingLabel}
                        {span.bytes ? ` • ${formatBytes(span.bytes)}` : ""}
                      </span>
                    </div>
                    <div className="timeline-track">
                      <div
                        aria-label={title}
                        className={`timeline-segment ${span.isMilestone ? "milestone" : ""}`}
                        role="img"
                        style={barStyle}
                        title={title}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="runtime-log">
        <div>
          <Play size={14} />
          Runtime events
        </div>
        <ol>
          {log.length === 0 ? (
            <li>Connect the runtime to begin.</li>
          ) : (
            log.map((item) => <li key={item.id}>{item.text}</li>)
          )}
        </ol>
      </div>
    </section>
  );
}

function downsampleToInt16(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) {
    return floatToInt16(input);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  let inputOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.floor((outputOffset + 1) * ratio);
    let sum = 0;
    let count = 0;

    for (let index = inputOffset; index < nextInputOffset && index < input.length; index += 1) {
      sum += input[index];
      count += 1;
    }

    output[outputOffset] = count > 0 ? sum / count : 0;
    inputOffset = nextInputOffset;
  }

  return floatToInt16(output);
}

function floatToInt16(input: Float32Array) {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}
