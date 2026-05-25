import { WebSocket } from "ws";
import OpusScript from "opusscript";
import { openAIRealtimeSessionConfig } from "./realtime-config.js";

const realtimeInputSampleRate = 24000;
const deviceInputSampleRate = 16000;
const deviceInputFrameMs = 60;
const deviceOutputSampleRate = 24000;
const deviceOutputFrameMs = 60;
const deviceOpusBitrate = 32000;
const maxOpusFrameBytes = 1275;
const defaultFallbackCommitDelayMs = 350;
const defaultOutputFrameDelayMs = 60;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openState(WebSocketImpl) {
  return WebSocketImpl.OPEN ?? 1;
}

function connectingState(WebSocketImpl) {
  return WebSocketImpl.CONNECTING ?? 0;
}

function isOpen(ws, WebSocketImpl) {
  return ws?.readyState === openState(WebSocketImpl);
}

function isConnecting(ws, WebSocketImpl) {
  return ws?.readyState === connectingState(WebSocketImpl);
}

function parseRealtimeEvent(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function clampInt16(value) {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

function disposeOpusCodec(codec) {
  if (codec && typeof codec.delete === "function") {
    try {
      codec.delete();
    } catch {
      // Some codec failures leave the underlying WASM instance half-torn-down.
    }
  }
}

function createOpusEncoder(sampleRate, OpusScriptImpl) {
  const encoder = new OpusScriptImpl(
    sampleRate,
    1,
    OpusScriptImpl.Application.VOIP ?? OpusScriptImpl.Application.AUDIO,
  );
  if (typeof encoder.setBitrate === "function") {
    encoder.setBitrate(deviceOpusBitrate);
  }
  return encoder;
}

export function realtimeWebSocketUrl(model) {
  const url = new URL("wss://api.openai.com/v1/realtime");
  url.searchParams.set("model", String(model || "gpt-realtime-2"));
  return url.toString();
}

export function resamplePcm16Mono(pcm, fromRate, toRate) {
  const rawInput = Buffer.from(pcm || []);
  const input =
    rawInput.length % 2 === 0 ? rawInput : rawInput.subarray(0, rawInput.length - 1);
  if (!input.length || fromRate === toRate) {
    return input;
  }

  const inputSamples = Math.floor(input.length / 2);
  if (inputSamples <= 0) {
    return Buffer.alloc(0);
  }

  const outputSamples = Math.max(1, Math.round((inputSamples * toRate) / fromRate));
  const output = Buffer.alloc(outputSamples * 2);
  const ratio = fromRate / toRate;

  for (let index = 0; index < outputSamples; index += 1) {
    const source = index * ratio;
    const leftIndex = Math.min(inputSamples - 1, Math.floor(source));
    const rightIndex = Math.min(inputSamples - 1, leftIndex + 1);
    const mix = source - leftIndex;
    const left = input.readInt16LE(leftIndex * 2);
    const right = input.readInt16LE(rightIndex * 2);
    output.writeInt16LE(clampInt16(left + (right - left) * mix), index * 2);
  }

  return output;
}

export function encodePcmToOpusFrames(
  pcm,
  sampleRate = deviceOutputSampleRate,
  frameDurationMs = deviceOutputFrameMs,
  OpusScriptImpl = OpusScript,
) {
  const input = Buffer.from(pcm || []);
  const evenPcm =
    input.length % 2 === 0 ? input : input.subarray(0, input.length - 1);
  if (!evenPcm.length) {
    return [];
  }

  const encoder = createOpusEncoder(sampleRate, OpusScriptImpl);
  const frameSamples = (sampleRate / 1000) * frameDurationMs;
  const frameBytes = frameSamples * 2;
  const frames = [];

  try {
    for (let offset = 0; offset < evenPcm.length; offset += frameBytes) {
      const frame = Buffer.alloc(frameBytes);
      evenPcm.copy(frame, 0, offset, Math.min(offset + frameBytes, evenPcm.length));
      frames.push(Buffer.from(encoder.encode(frame, frameSamples)));
    }
  } finally {
    disposeOpusCodec(encoder);
  }

  return frames;
}

export function createPcmToOpusFrameEncoder(
  sampleRate = deviceOutputSampleRate,
  frameDurationMs = deviceOutputFrameMs,
  OpusScriptImpl = OpusScript,
) {
  const encoder = createOpusEncoder(sampleRate, OpusScriptImpl);
  const frameSamples = (sampleRate / 1000) * frameDurationMs;
  const frameBytes = frameSamples * 2;
  let pendingPcm = Buffer.alloc(0);
  let closed = false;

  function encodeFrame(frame) {
    return Buffer.from(encoder.encode(frame, frameSamples));
  }

  return {
    push(pcm) {
      if (closed) {
        return [];
      }

      const input = Buffer.from(pcm || []);
      const evenPcm =
        input.length % 2 === 0 ? input : input.subarray(0, input.length - 1);
      if (!evenPcm.length) {
        return [];
      }

      pendingPcm = pendingPcm.length
        ? Buffer.concat([pendingPcm, evenPcm])
        : evenPcm;

      const frames = [];
      while (pendingPcm.length >= frameBytes) {
        frames.push(encodeFrame(pendingPcm.subarray(0, frameBytes)));
        pendingPcm = pendingPcm.subarray(frameBytes);
      }
      return frames;
    },
    flush() {
      if (closed || !pendingPcm.length) {
        return [];
      }

      const frame = Buffer.alloc(frameBytes);
      pendingPcm.copy(frame);
      pendingPcm = Buffer.alloc(0);
      return [encodeFrame(frame)];
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      pendingPcm = Buffer.alloc(0);
      disposeOpusCodec(encoder);
    },
  };
}

export function deviceRuntimeCredentialStatus(runtimeConfig, credentials) {
  if (runtimeConfig?.architecture === "speech_to_speech") {
    return credentials.openaiApiKey
      ? { ok: true, message: "" }
      : {
          ok: false,
          message:
            "Missing OPENAI_API_KEY. Speech-to-speech device sessions use OpenAI Realtime from the runtime.",
        };
  }

  if (!credentials.deepgramApiKey || !credentials.llmConfigured) {
    return {
      ok: false,
      message:
        "Missing DEEPGRAM_API_KEY or LLM API key. Sandwich device sessions use Deepgram plus the configured LLM provider.",
    };
  }

  return { ok: true, message: "" };
}

export function realtimeSessionUpdatePayload(runtimeConfig) {
  return {
    type: "session.update",
    session: openAIRealtimeSessionConfig(runtimeConfig, { includeModel: false }),
  };
}

export function createDeviceRealtimeBridge(options) {
  const {
    session,
    apiKey,
    safetyIdentifier,
    WebSocketImpl = WebSocket,
    OpusScriptImpl = OpusScript,
    sendDeviceJson,
    setDeviceState,
    markTurnTiming,
    logTurnTimingSummary,
    closeDeviceAfterTurn,
    sleep = defaultSleep,
    fallbackCommitDelayMs = defaultFallbackCommitDelayMs,
    outputFrameDelayMs = defaultOutputFrameDelayMs,
  } = options;

  const realtime = session.runtimeConfig.realtime;
  const websocketUrl = realtimeWebSocketUrl(realtime.model);
  const queuedClientEvents = [];
  let ws = null;
  let decoder = null;
  let outputEncoder = null;
  let closed = false;
  let closingOpenAI = false;
  let cancelled = false;
  let fallbackTimer = null;
  let listening = false;
  let responseStarted = false;
  let responseDone = false;
  let committed = false;
  let finishing = false;
  let ttsStarted = false;
  let ttsStopped = false;
  let firstAudioReady = false;
  let firstAudioSent = false;
  let playbackQueue = Promise.resolve();
  let finishPromise = null;
  const stats = {
    decodeErrors: 0,
    droppedOpusFrames: 0,
    pcmBytes: 0,
    opusFrames: 0,
  };

  function closeCodecs() {
    disposeOpusCodec(decoder);
    decoder = null;
    outputEncoder?.close();
    outputEncoder = null;
  }

  function sendOpenAI(event) {
    if (closed || closingOpenAI) {
      return false;
    }
    if (!isOpen(ws, WebSocketImpl)) {
      queuedClientEvents.push(event);
      return false;
    }
    ws.send(JSON.stringify(event));
    return true;
  }

  function flushQueuedEvents() {
    if (!isOpen(ws, WebSocketImpl)) {
      return;
    }

    while (queuedClientEvents.length > 0) {
      ws.send(JSON.stringify(queuedClientEvents.shift()));
    }
  }

  function clearFallbackTimer() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function closeOpenAI(code = 1000, reason = "turn complete") {
    clearFallbackTimer();
    queuedClientEvents.length = 0;
    closingOpenAI = true;
    const socket = ws;
    ws = null;

    if (
      socket &&
      (isOpen(socket, WebSocketImpl) || isConnecting(socket, WebSocketImpl))
    ) {
      socket.close(code, reason);
    }
  }

  function sendDevice(payload) {
    if (session.transport.isOpen()) {
      sendDeviceJson(session, payload);
    }
  }

  async function finishTurn(reason = "turn_complete", status = "complete") {
    if (finishPromise) {
      return finishPromise;
    }

    finishPromise = (async () => {
      finishing = true;
      listening = false;
      clearFallbackTimer();

      await playbackQueue.catch((error) => {
        console.error(
          `[device ${session.id}] realtime playback failed: ${error.message}`,
        );
      });

      if (ttsStarted && !ttsStopped && session.transport.isOpen()) {
        sendDevice({ type: "tts", state: "stop" });
        ttsStopped = true;
      }

      markTurnTiming(session, session.turnTimings, "turn_complete");
      logTurnTimingSummary(session, session.turnTimings, status);
      setDeviceState(
        session,
        status === "error" ? "error" : status === "cancelled" ? "ready" : "turn_complete",
        status === "error"
          ? "Realtime turn failed."
          : status === "cancelled"
            ? "Realtime turn cancelled."
            : `Realtime audio complete: ${stats.opusFrames} Opus frames.`,
      );
      session.processing = false;
      closed = true;
      closeCodecs();
      closeOpenAI(1000, reason);

      if (session.realtimeBridge === bridge) {
        session.realtimeBridge = null;
      }
      if (session.transport.isOpen()) {
        closeDeviceAfterTurn(session, reason);
      }
    })();

    return finishPromise;
  }

  function finishWithError(error) {
    if (closed || cancelled) {
      return;
    }
    cancelled = true;
    console.error(`[device ${session.id}] realtime bridge error: ${error.message}`);
    sendDevice({
      type: "alert",
      status: "Error",
      message: error.message,
      emotion: "sad",
    });
    void finishTurn("realtime_error", "error");
  }

  function ensureConnected() {
    if (ws && (isOpen(ws, WebSocketImpl) || isConnecting(ws, WebSocketImpl) || closed)) {
      return;
    }

    ws = new WebSocketImpl(websocketUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
    });

    ws.on("open", () => {
      markTurnTiming(session, session.turnTimings, "stt_connected");
      setDeviceState(session, "realtime_connected", "OpenAI Realtime connected.");
      sendOpenAI(realtimeSessionUpdatePayload(session.runtimeConfig));
      flushQueuedEvents();
    });

    ws.on("message", (raw) => {
      handleRealtimeEvent(parseRealtimeEvent(raw));
    });

    ws.on("error", (error) => {
      finishWithError(error);
    });

    ws.on("close", (code, reason) => {
      if (!closed && !closingOpenAI && !cancelled) {
        finishWithError(
          new Error(
            `OpenAI Realtime closed unexpectedly (${code}${
              reason ? `: ${reason}` : ""
            }).`,
          ),
        );
      }
    });
  }

  function startFallbackCommitTimer() {
    clearFallbackTimer();
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (closed || cancelled || finishing || responseStarted) {
        return;
      }
      if (!committed) {
        sendOpenAI({ type: "input_audio_buffer.commit" });
        committed = true;
        markTurnTiming(session, session.turnTimings, "stt_final");
      }
      sendOpenAI({ type: "response.create" });
      setDeviceState(
        session,
        "realtime_response_requested",
        "Requested Realtime response after listen stop.",
      );
    }, fallbackCommitDelayMs);
  }

  function decodeDeviceFrame(frame) {
    const opusFrame = Buffer.from(frame || []);
    if (!opusFrame.length || opusFrame.length > maxOpusFrameBytes) {
      stats.droppedOpusFrames += 1;
      return Buffer.alloc(0);
    }

    if (!decoder) {
      decoder = new OpusScriptImpl(
        deviceInputSampleRate,
        1,
        OpusScriptImpl.Application.AUDIO,
      );
    }
    const frameSamples = (deviceInputSampleRate / 1000) * deviceInputFrameMs;
    const decoded = Buffer.from(decoder.decode(opusFrame, frameSamples));
    const pcm16 =
      decoded.length % 2 === 0 ? decoded : decoded.subarray(0, decoded.length - 1);
    return resamplePcm16Mono(pcm16, deviceInputSampleRate, realtimeInputSampleRate);
  }

  function sendInputAudio(pcm24) {
    if (!pcm24.length) {
      return;
    }
    session.turnAudioFrames += 1;
    session.turnAudioBytes += pcm24.length;
    sendOpenAI({
      type: "input_audio_buffer.append",
      audio: pcm24.toString("base64"),
    });
  }

  function encodeOutputPcm(pcm, flush = false) {
    if (!outputEncoder) {
      outputEncoder = createPcmToOpusFrameEncoder(
        deviceOutputSampleRate,
        deviceOutputFrameMs,
        OpusScriptImpl,
      );
    }

    const frames = outputEncoder.push(pcm);
    if (flush) {
      frames.push(...outputEncoder.flush());
    }
    return frames;
  }

  async function streamOutputFrames(frames) {
    if (cancelled || closed || !frames.length) {
      return;
    }

    if (!ttsStarted && session.transport.isOpen()) {
      sendDevice({ type: "llm", emotion: "happy", text: "OK" });
      sendDevice({ type: "tts", state: "start" });
      ttsStarted = true;
    }

    for (const frame of frames) {
      if (cancelled || closed || !session.transport.isOpen()) {
        break;
      }
      if (!firstAudioSent) {
        firstAudioSent = true;
        markTurnTiming(session, session.turnTimings, "first_audio_sent");
        setDeviceState(
          session,
          "speaking",
          `First Realtime audio in ${Date.now() - session.turnTimings.startedAt}ms.`,
        );
      }
      session.transport.sendBinary(frame, { binary: true });
      stats.opusFrames += 1;
      await sleep(outputFrameDelayMs);
    }
  }

  function enqueueOutputAudio(delta) {
    const pcm = Buffer.from(delta, "base64");
    if (!pcm.length) {
      return;
    }

    stats.pcmBytes += pcm.length;
    if (!firstAudioReady) {
      firstAudioReady = true;
      markTurnTiming(session, session.turnTimings, "first_tts_audio_ready");
      markTurnTiming(session, session.turnTimings, "first_llm_delta");
    }
    playbackQueue = playbackQueue.then(() => streamOutputFrames(encodeOutputPcm(pcm)));
  }

  function flushOutputAudio() {
    playbackQueue = playbackQueue.then(() =>
      streamOutputFrames(encodeOutputPcm(Buffer.alloc(0), true)),
    );
  }

  function handleRealtimeEvent(event) {
    if (!event || closed) {
      return;
    }

    if (event.type === "error") {
      finishWithError(new Error(event.error?.message || "OpenAI Realtime error."));
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      markTurnTiming(session, session.turnTimings, "speech_started");
      setDeviceState(session, "speech_started", "OpenAI Realtime detected speech.");
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setDeviceState(session, "thinking", "OpenAI Realtime detected speech stop.");
      return;
    }

    if (event.type === "input_audio_buffer.committed") {
      committed = true;
      markTurnTiming(session, session.turnTimings, "stt_final");
      return;
    }

    if (event.type === "response.created") {
      clearFallbackTimer();
      responseStarted = true;
      session.processing = true;
      session.listening = false;
      setDeviceState(session, "thinking", "OpenAI Realtime response started.");
      return;
    }

    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript
    ) {
      sendDevice({ type: "stt", text: event.transcript });
      return;
    }

    if (
      (event.type === "response.output_audio_transcript.delta" ||
        event.type === "response.audio_transcript.delta") &&
      event.delta
    ) {
      sendDevice({ type: "llm", emotion: "happy", text: event.delta });
      return;
    }

    if (
      (event.type === "response.output_audio.delta" ||
        event.type === "response.audio.delta") &&
      (event.delta || event.audio)
    ) {
      enqueueOutputAudio(event.delta || event.audio);
      return;
    }

    if (event.type === "response.cancelled") {
      cancelled = true;
      void finishTurn("abort", "cancelled");
      return;
    }

    if (event.type === "response.done") {
      responseDone = true;
      flushOutputAudio();
      void finishTurn("turn_complete");
    }
  }

  const bridge = {
    preconnect() {
      if (closed || responseDone) {
        return;
      }
      ensureConnected();
    },
    startListening() {
      if (closed || responseDone) {
        return;
      }
      listening = true;
      cancelled = false;
      ensureConnected();
    },
    handleAudio(frame) {
      if (!listening || closed || cancelled) {
        return;
      }
      ensureConnected();
      try {
        const pcm = decodeDeviceFrame(frame);
        if (!pcm.length) {
          return;
        }
        sendInputAudio(pcm);
      } catch (error) {
        stats.decodeErrors += 1;
        disposeOpusCodec(decoder);
        decoder = null;

        if (stats.decodeErrors <= 3 || stats.decodeErrors % 25 === 0) {
          const preview = Buffer.from(frame || []).subarray(0, 8).toString("hex");
          console.error(
            `[device ${session.id}] realtime opus decode failed (${stats.decodeErrors}, len=${frame?.length || 0}, head=${preview}): ${error.message}`,
          );
        }

        if (stats.decodeErrors >= 60 && stats.pcmBytes === 0) {
          finishWithError(
            new Error(
              "Device audio could not be decoded as Opus. Reconnect the device audio channel and try again.",
            ),
          );
        }
      }
    },
    stopListening() {
      if (closed || cancelled) {
        return;
      }
      listening = false;
      setDeviceState(session, "processing", "Listen stop.");
      startFallbackCommitTimer();
    },
    abort(reason = "abort") {
      if (closed) {
        return;
      }
      cancelled = true;
      listening = false;
      session.processing = false;
      clearFallbackTimer();
      sendOpenAI({ type: "response.cancel" });
      if (ttsStarted && !ttsStopped && session.transport.isOpen()) {
        sendDevice({ type: "tts", state: "stop" });
        ttsStopped = true;
      }
      setDeviceState(session, "ready", `Abort: ${reason}.`);
      void finishTurn("abort", "cancelled");
    },
    close(reason = "closed") {
      if (closed) {
        return;
      }
      closed = true;
      listening = false;
      closeOpenAI(1000, reason);
    },
  };

  return bridge;
}
