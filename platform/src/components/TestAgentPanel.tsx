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
import { createRuntimeVoiceSession } from "../lib/platformApi";
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
  elapsedMs?: number;
  startMs?: number;
  endMs?: number;
  spanId?: string;
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

type AudioChunk = {
  id: string;
  turnId: string;
  index: number;
  text: string;
  url: string;
  mimeType: string;
  bytes: number;
  streamedPcm: boolean;
};

type ResponseChunk = {
  id: string;
  text: string;
  complete: boolean;
};

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
  if (encoding === "opus") {
    return "audio/ogg;codecs=opus";
  }
  if (encoding === "flac") {
    return "audio/flac";
  }
  if (encoding === "aac") {
    return "audio/aac";
  }
  if (encoding === "wav") {
    return "audio/wav";
  }
  return "audio/mpeg";
}

function cleanChunkText(text: string) {
  return String(text || "")
    .replace(/<\/?chunk\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function responseChunksFromXml(xmlText: string, fallbackText: string): ResponseChunk[] {
  const source = String(xmlText || "");
  const chunks: ResponseChunk[] = [];
  const chunkPattern = /<chunk\b[^>]*>([\s\S]*?)<\/chunk>/gi;
  let match: RegExpExecArray | null;

  while ((match = chunkPattern.exec(source))) {
    const text = cleanChunkText(match[1]);
    if (text) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        text,
        complete: true,
      });
    }
  }

  const lowerSource = source.toLowerCase();
  const lastOpen = lowerSource.lastIndexOf("<chunk");
  const lastClose = lowerSource.lastIndexOf("</chunk>");

  if (lastOpen > lastClose) {
    const openEnd = source.indexOf(">", lastOpen);
    if (openEnd !== -1) {
      const text = cleanChunkText(source.slice(openEnd + 1));
      if (text) {
        chunks.push({
          id: `chunk-${chunks.length + 1}`,
          text,
          complete: false,
        });
      }
    }
  }

  if (chunks.length > 0) {
    return chunks;
  }

  const fallback = cleanChunkText(fallbackText || source);
  return fallback ? [{ id: "chunk-1", text: fallback, complete: true }] : [];
}

function buildSwimlaneTimeline(events: TimelineEvent[]): SwimlaneTimeline | null {
  const latestTurnId = events[events.length - 1]?.turnId;

  if (!latestTurnId) {
    return null;
  }

  const turnEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.turnId === latestTurnId)
    .map(({ event, index }) => ({ event, index, timing: timelineTiming(event) }))
    .sort(
      (a, b) =>
        a.timing.startMs - b.timing.startMs ||
        a.timing.endMs - b.timing.endMs ||
        stageSortOrder(a.event.stage) - stageSortOrder(b.event.stage) ||
        a.index - b.index,
    );

  if (turnEvents.length === 0) {
    return null;
  }

  const totalMs = Math.max(...turnEvents.map(({ timing }) => timing.endMs), 0);
  const axisMaxMs = niceAxisMax(totalMs);

  const spans = turnEvents.map(({ event, timing }, index) => {
    const { startMs, endMs } = timing;
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
      id: event.spanId || `${event.turnId}-${event.stage}-${index}`,
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

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timelineTiming(event: TimelineEvent) {
  const explicitStart = finiteNumber(event.startMs);
  const explicitEnd = finiteNumber(event.endMs);
  const elapsed = finiteNumber(event.elapsedMs);
  const rawEnd = explicitEnd ?? elapsed ?? explicitStart ?? 0;
  const rawStart = explicitStart ?? (explicitEnd !== null ? rawEnd : elapsed ?? rawEnd);
  const startMs = Math.max(0, Math.min(rawStart, rawEnd));
  const endMs = Math.max(startMs, Math.max(rawStart, rawEnd));

  return { startMs, endMs };
}

function stageSortOrder(stage: string) {
  if (stage.startsWith("stt")) {
    return 0;
  }
  if (stage === "llm_request") {
    return 1;
  }
  if (stage === "llm_first_delta") {
    return 2;
  }
  if (stage.startsWith("llm")) {
    return 3;
  }
  if (stage.startsWith("tts")) {
    return 4;
  }
  return 5;
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

  if (stage === "tts_done" || stage === "tts_chunk") {
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
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<AudioChunk[]>([]);
  const currentAudioUrlRef = useRef<string | null>(null);
  const retainedAudioUrlsRef = useRef<string[]>([]);
  const ttsPlaybackContextRef = useRef<AudioContext | null>(null);
  const ttsPlaybackTimeRef = useRef(0);
  const ttsPcmCarryRef = useRef<Uint8Array | null>(null);
  const ttsSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const [status, setStatus] = useState<RuntimeStatus>("disconnected");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [assistantXmlText, setAssistantXmlText] = useState("");
  const [showChunks, setShowChunks] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);
  const [pcmStreaming, setPcmStreaming] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [log, setLog] = useState<LogEvent[]>([]);

  useEffect(() => {
    return () => {
      stopMic();
      socketRef.current?.close();
      clearAudioQueue({ clearChunks: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (agent && socketRef.current?.readyState === WebSocket.OPEN) {
      appendLog(setLog, `Reconnecting runtime for ${agent.name}.`);
      socketRef.current.close(1000, "Agent changed");
      window.setTimeout(() => {
        connectRuntime();
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  async function connectRuntime() {
    if (!agent) {
      appendLog(setLog, "Create or select an agent before connecting.");
      return;
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      appendLog(setLog, "Runtime is already connected.");
      return;
    }

    setStatus("connecting");
    let voiceSession;
    try {
      voiceSession = await createRuntimeVoiceSession(agent.id);
    } catch (error) {
      setStatus("error");
      appendLog(
        setLog,
        `Could not authorize runtime session: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const socket = new WebSocket(voiceSession.url);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      appendLog(setLog, "Connected to authenticated voice runtime.");
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
      setAssistantXmlText("");
      setTimeline((current) => current.filter((item) => item.turnId !== payload.turnId));
      appendLog(setLog, `User: ${payload.text}`);
    } else if (payload.type === "assistant_start") {
      setStatus("thinking");
      setAssistantText("");
      setAssistantXmlText("");
      setPcmStreaming(false);
      clearAudioQueue({ clearChunks: true });
    } else if (payload.type === "assistant_xml_delta") {
      setAssistantXmlText((current) => current + payload.text);
    } else if (payload.type === "assistant_xml_text") {
      setAssistantXmlText(payload.text || "");
    } else if (payload.type === "assistant_delta") {
      setAssistantText((current) => current + payload.text);
    } else if (payload.type === "assistant_text") {
      setAssistantText(payload.text);
      appendLog(setLog, `Assistant: ${payload.text}`);
    } else if (payload.type === "assistant_pcm_delta") {
      setPcmStreaming(true);
      playPcmDelta(payload.pcmBase64, Number(payload.sampleRate || 24000)).catch(() => undefined);
    } else if (payload.type === "assistant_audio") {
      const binary = Uint8Array.from(atob(payload.audioBase64), (char) =>
        char.charCodeAt(0),
      );
      const blob = new Blob([binary], { type: payload.mimeType || audioMime("mp3") });
      const chunk: AudioChunk = {
        id: `${payload.turnId || "turn"}-${payload.chunkIndex || Date.now()}`,
        turnId: String(payload.turnId || ""),
        index: Number(payload.chunkIndex || 1),
        text: String(payload.text || ""),
        url: URL.createObjectURL(blob),
        mimeType: payload.mimeType || audioMime("mp3"),
        bytes: Number(payload.bytes || binary.byteLength),
        streamedPcm: Boolean(payload.streamedPcm),
      };

      if (chunk.streamedPcm) {
        setPcmStreaming(false);
      }
      registerAssistantAudio(chunk, !chunk.streamedPcm);
      appendLog(
        setLog,
        chunk.index
          ? `Assistant audio chunk ${chunk.index} is ${chunk.streamedPcm ? "saved from PCM stream" : "ready"}.`
          : "Assistant audio is ready.",
      );
    } else if (payload.type === "assistant_end") {
      setStatus(recording ? "listening" : "ready");
    } else if (payload.type === "timeline") {
      setTimeline((current) => [...current, payload].slice(-18));
    } else if (payload.type === "reset_done") {
      setInterim("");
      setFinalTranscript("");
      setAssistantText("");
      setAssistantXmlText("");
      setPcmStreaming(false);
      setTimeline([]);
      clearAudioQueue({ clearChunks: true });
      appendLog(setLog, "Conversation reset.");
    } else if (payload.type === "error") {
      setStatus("error");
      appendLog(setLog, payload.message);
    }
  }

  function resetPcmPlayback() {
    for (const source of ttsSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may have already ended.
      }
    }

    ttsSourcesRef.current = [];
    ttsPcmCarryRef.current = null;
    ttsPlaybackTimeRef.current = 0;
    ttsPlaybackContextRef.current?.close().catch(() => undefined);
    ttsPlaybackContextRef.current = null;
  }

  function clearAudioQueue({ clearChunks = false } = {}) {
    audioQueueRef.current = [];
    audioElementRef.current?.pause();
    currentAudioUrlRef.current = null;
    setAudioUrl(null);
    setPcmStreaming(false);
    resetPcmPlayback();

    if (clearChunks) {
      retainedAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      retainedAudioUrlsRef.current = [];
      setAudioChunks([]);
    }
  }

  function registerAssistantAudio(chunk: AudioChunk, shouldQueue: boolean) {
    retainedAudioUrlsRef.current.push(chunk.url);
    setAudioChunks((current) =>
      [...current, chunk].sort((first, second) => first.index - second.index),
    );

    if (shouldQueue) {
      queueAssistantAudio(chunk);
    }
  }

  function queueAssistantAudio(chunk: AudioChunk) {
    audioQueueRef.current.push(chunk);
    if (!currentAudioUrlRef.current) {
      playNextAudioChunk();
    }
  }

  function playNextAudioChunk() {
    const next = audioQueueRef.current.shift() ?? null;
    currentAudioUrlRef.current = next?.url ?? null;
    setAudioUrl(next?.url ?? null);

    if (next) {
      window.setTimeout(() => {
        audioElementRef.current?.play().catch(() => undefined);
      }, 0);
    }
  }

  function playStoredChunk(chunk: AudioChunk) {
    audioQueueRef.current = [];
    resetPcmPlayback();
    currentAudioUrlRef.current = chunk.url;
    setAudioUrl(chunk.url);
    window.setTimeout(() => {
      audioElementRef.current?.play().catch(() => undefined);
    }, 0);
  }

  function joinBytes(first: Uint8Array, second: Uint8Array) {
    const merged = new Uint8Array(first.byteLength + second.byteLength);
    merged.set(first);
    merged.set(second, first.byteLength);
    return merged;
  }

  async function playPcmDelta(base64: string, sampleRate: number) {
    if (!base64) {
      return;
    }

    const nextBytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    let pcmBytes = ttsPcmCarryRef.current
      ? joinBytes(ttsPcmCarryRef.current, nextBytes)
      : nextBytes;

    if (pcmBytes.byteLength % 2 !== 0) {
      ttsPcmCarryRef.current = pcmBytes.slice(pcmBytes.byteLength - 1);
      pcmBytes = pcmBytes.slice(0, pcmBytes.byteLength - 1);
    } else {
      ttsPcmCarryRef.current = null;
    }

    if (pcmBytes.byteLength === 0) {
      return;
    }

    const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
    let audioContext = ttsPlaybackContextRef.current;
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContext();
      ttsPlaybackContextRef.current = audioContext;
      ttsPlaybackTimeRef.current = audioContext.currentTime + 0.04;
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.addEventListener("ended", () => {
      ttsSourcesRef.current = ttsSourcesRef.current.filter((item) => item !== source);
    });
    ttsSourcesRef.current.push(source);

    const startAt = Math.max(audioContext.currentTime + 0.02, ttsPlaybackTimeRef.current);
    source.start(startAt);
    ttsPlaybackTimeRef.current = startAt + buffer.duration;
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
  const assistantChunks = responseChunksFromXml(assistantXmlText, assistantText);

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
          <div className="assistant-output-header">
            <span>Assistant</span>
            <label className="chunk-toggle">
              <input
                checked={showChunks}
                type="checkbox"
                onChange={(event) => setShowChunks(event.target.checked)}
              />
              <span className="chunk-toggle-track" aria-hidden="true" />
              <span className="chunk-toggle-text">Show chunks</span>
            </label>
          </div>
          {showChunks ? (
            <div className="assistant-chunked-output" aria-label="Assistant response chunks">
              {assistantChunks.length > 0 ? (
                assistantChunks.map((chunk, index) => {
                  const audioChunk = audioChunks.find((item) => item.index === index + 1);

                  return (
                    <div
                      className={`assistant-response-chunk ${chunk.complete ? "" : "partial"}`}
                      key={chunk.id}
                    >
                      <div className="assistant-response-chunk-copy">
                        <small>{index + 1}</small>
                        <span>{chunk.text}</span>
                      </div>
                      {audioChunk ? (
                        <div className="assistant-response-chunk-audio">
                          <button
                            aria-label={`Play TTS chunk ${audioChunk.index}`}
                            type="button"
                            onClick={() => playStoredChunk(audioChunk)}
                          >
                            <Play size={14} />
                          </button>
                          <span>
                            {audioChunk.streamedPcm ? "PCM stream saved as WAV" : audioChunk.mimeType} •{" "}
                            {formatBytes(audioChunk.bytes)}
                          </span>
                          <audio src={audioChunk.url} controls preload="metadata" />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <span className="assistant-chunk-placeholder">The agent response streams here.</span>
              )}
            </div>
          ) : (
            <p className="assistant-response-text">{assistantText || "The agent response streams here."}</p>
          )}
          {audioUrl ? (
            <audio
              ref={audioElementRef}
              src={audioUrl}
              controls
              autoPlay
              onEnded={playNextAudioChunk}
            />
          ) : (
            <div className="audio-placeholder">
              <AudioLines size={17} />
              {pcmStreaming ? "Streaming PCM audio" : "Waiting for TTS audio"}
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
