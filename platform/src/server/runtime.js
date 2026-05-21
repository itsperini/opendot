import "dotenv/config";

import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import OpusScript from "opusscript";

const config = {
  host: process.env.RUNTIME_HOST || "0.0.0.0",
  port: Number(process.env.RUNTIME_PORT || 8787),
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  systemPrompt:
    process.env.OPENDOT_SYSTEM_PROMPT ||
    "You are a concise voice assistant. Answer naturally in one or two short spoken paragraphs.",
  sttModel: process.env.DEEPGRAM_STT_MODEL || "nova-3",
  sttLanguage: process.env.DEEPGRAM_STT_LANGUAGE || "en-US",
  endpointingMs: Number(process.env.DEEPGRAM_ENDPOINTING_MS || 300),
  utteranceEndMs: Number(process.env.DEEPGRAM_UTTERANCE_END_MS || 1000),
  ttsModel: process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en",
  ttsEncoding: process.env.DEEPGRAM_TTS_ENCODING || "mp3",
};

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function settingEntry(stage, key) {
  return stage?.settings?.find((item) => item.key === key);
}

function setting(stage, key, fallback) {
  const found = settingEntry(stage, key);
  return found?.value ?? fallback;
}

function stage(agent, id) {
  return agent?.pipeline?.find((item) => item.id === id);
}

function selectedFeature(stage, featureKey, fallback, settingKey = "features") {
  const selected = settingEntry(stage, settingKey)?.value;
  if (Array.isArray(selected)) {
    return selected.map(String).includes(featureKey);
  }

  const legacyValue = setting(stage, featureKey, undefined);
  return typeof legacyValue === "boolean" ? legacyValue : fallback;
}

function normalizeAgentConfig(agent) {
  const vad = stage(agent, "vad");
  const stt = stage(agent, "stt");
  const llm = stage(agent, "llm");
  const tts = stage(agent, "tts");
  const listen = {
    model: stt?.model || config.sttModel,
    language: String(setting(stt, "language", config.sttLanguage)),
    smart_format: String(selectedFeature(stt, "smart_format", true, "stt_features")),
    interim_results: String(selectedFeature(vad, "interim_results", true)),
    vad_events: String(selectedFeature(vad, "vad_events", true)),
    endpointing: String(setting(vad, "endpointing", config.endpointingMs)),
    utterance_end_ms: String(setting(vad, "utterance_end_ms", config.utteranceEndMs)),
    encoding: String(setting(stt, "encoding", "linear16")),
    sample_rate: String(setting(stt, "sample_rate", 16000)),
    channels: "1",
  };

  if (selectedFeature(stt, "punctuate", false, "stt_features")) {
    listen.punctuate = "true";
  }

  if (selectedFeature(stt, "numerals", false, "stt_features")) {
    listen.numerals = "true";
  }

  return {
    agentName: agent?.name || "Untitled agent",
    description: agent?.description || "",
    listen,
    llm: {
      model: llm?.model || config.openaiModel,
      reasoning_effort: String(setting(llm, "reasoning_effort", "none")),
      verbosity: String(setting(llm, "verbosity", "low")),
      stream: selectedFeature(llm, "stream", true, "response_features"),
    },
    tts: {
      model: tts?.model || config.ttsModel,
      encoding: String(setting(tts, "encoding", config.ttsEncoding)),
    },
  };
}

function deepgramListenUrl(runtimeConfig) {
  const params = new URLSearchParams(runtimeConfig.listen);
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function deepgramSpeakUrl(runtimeConfig) {
  const params = new URLSearchParams({
    model: runtimeConfig.tts.model,
    encoding: runtimeConfig.tts.encoding,
  });
  return `https://api.deepgram.com/v1/speak?${params.toString()}`;
}

function deepgramSpeakPcmUrl(runtimeConfig) {
  const params = new URLSearchParams({
    model: runtimeConfig.tts.model,
    encoding: "linear16",
    sample_rate: "24000",
  });
  return `https://api.deepgram.com/v1/speak?${params.toString()}`;
}

const deviceRegistry = new Map();
const deviceEventLimit = 80;

function normalizeDeviceId(value) {
  const id = String(value || "").trim();
  return id || `unknown-${randomUUID()}`;
}

function displayDeviceName(id) {
  const compact = id.replace(/[^a-fA-F0-9]/g, "");
  return compact.length >= 6 ? `Dot ${compact.slice(-6).toUpperCase()}` : "Dot Device";
}

function requestIp(request) {
  return (request.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

function getOrCreateDevice(id, request = null) {
  const deviceId = normalizeDeviceId(id);
  const now = new Date().toISOString();
  let device = deviceRegistry.get(deviceId);

  if (!device) {
    device = {
      id: deviceId,
      name: displayDeviceName(deviceId),
      model: "ESP32-S3",
      serialNumber: deviceId,
      ipAddress: request ? requestIp(request) : "",
      availability: "offline",
      state: "seen",
      session: null,
      runtimeConfig: normalizeAgentConfig(null),
      agentSnapshot: null,
      boundAgentId: null,
      boundAgentName: null,
      boundConfigVersion: null,
      boundAt: null,
      clientId: request?.headers["client-id"] || "",
      userAgent: request?.headers["user-agent"] || "",
      protocolVersion: request?.headers["protocol-version"] || "",
      lastSeenAt: now,
      connectedAt: null,
      updatedAt: now,
      events: [],
    };
    deviceRegistry.set(deviceId, device);
    logDeviceEvent(device, "Device discovered.");
  }

  if (request) {
    device.ipAddress = requestIp(request) || device.ipAddress;
    device.clientId = request.headers["client-id"] || device.clientId;
    device.userAgent = request.headers["user-agent"] || device.userAgent;
    device.protocolVersion = request.headers["protocol-version"] || device.protocolVersion;
  }

  device.lastSeenAt = now;
  device.updatedAt = now;
  return device;
}

function logDeviceEvent(device, text) {
  const now = new Date().toISOString();
  device.events = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      timestamp: now,
    },
    ...device.events,
  ].slice(0, deviceEventLimit);
  device.updatedAt = now;
}

function setDeviceState(session, state, text = null) {
  const device = session.deviceRecord;
  if (!device) {
    return;
  }

  device.state = state;
  device.availability = session.ws.readyState === WebSocket.OPEN ? "available" : device.availability;
  device.lastSeenAt = new Date().toISOString();
  device.updatedAt = device.lastSeenAt;
  if (text) {
    logDeviceEvent(device, text);
  }
}

function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    model: device.model,
    serialNumber: device.serialNumber,
    availability: device.session?.ws.readyState === WebSocket.OPEN ? "available" : device.availability,
    state: device.state,
    ipAddress: device.ipAddress,
    clientId: device.clientId,
    protocolVersion: device.protocolVersion,
    lastSeenAt: device.lastSeenAt,
    connectedAt: device.connectedAt,
    updatedAt: device.updatedAt,
    boundAgentId: device.boundAgentId,
    boundAgentName: device.boundAgentName,
    boundConfigVersion: device.boundConfigVersion,
    boundAt: device.boundAt,
    events: device.events,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function bindDeviceConfig(device, payload) {
  const agent = payload.agent;
  if (!agent?.id || !agent?.name) {
    throw new Error("Missing agent payload.");
  }

  const now = new Date().toISOString();
  device.agentSnapshot = agent;
  device.runtimeConfig = normalizeAgentConfig(agent);
  device.boundAgentId = agent.id;
  device.boundAgentName = agent.name;
  device.boundConfigVersion = agent.updatedAt || now;
  device.boundAt = now;
  device.updatedAt = now;
  logDeviceEvent(device, `Bound voice config: ${agent.name}.`);

  const session = device.session;
  if (session) {
    session.runtimeConfig = device.runtimeConfig;
    session.conversation = [];
    session.finalSegments = [];
    if (session.deepgram?.readyState === WebSocket.OPEN || session.deepgram?.readyState === WebSocket.CONNECTING) {
      session.deepgram.close();
    }
    session.deepgram = null;
    session.sttConnecting = false;
    session.sttOpen = false;
  }
}

function responseInputMessage(message) {
  return {
    role: message.role,
    content: [
      {
        type: message.role === "assistant" ? "output_text" : "input_text",
        text: message.content,
      },
    ],
  };
}

async function askOpenAIStream(session, turn, transcript) {
  const stream = session.runtimeConfig.llm.stream;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: session.runtimeConfig.llm.model,
      instructions: [
        config.systemPrompt,
        `Agent name: ${session.runtimeConfig.agentName}.`,
        session.runtimeConfig.description
          ? `Agent description: ${session.runtimeConfig.description}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      input: session.conversation.map(responseInputMessage),
      reasoning: { effort: session.runtimeConfig.llm.reasoning_effort },
      text: { verbosity: session.runtimeConfig.llm.verbosity },
      stream,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || `OpenAI failed with ${response.status}`);
  }

  sendJson(session.client, {
    type: "timeline",
    turnId: turn.id,
    stage: "llm_request",
    label: "OpenAI request",
    elapsedMs: Date.now() - turn.startedAt,
  });
  sendJson(session.client, { type: "assistant_start", turnId: turn.id, transcript });

  if (!stream) {
    const body = await response.json();
    const answer =
      body.output_text ||
      (body.output || [])
        .flatMap((item) => item.content || [])
        .filter((item) => item.type === "output_text" && item.text)
        .map((item) => item.text)
        .join("") ||
      "";

    if (answer) {
      sendJson(session.client, {
        type: "assistant_delta",
        turnId: turn.id,
        text: answer,
      });
    }

    sendJson(session.client, {
      type: "timeline",
      turnId: turn.id,
      stage: "llm_done",
      label: "OpenAI done",
      elapsedMs: Date.now() - turn.startedAt,
    });

    return answer.trim();
  }

  if (!response.body) {
    throw new Error("OpenAI streaming response had no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let sawFirstDelta = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") {
          continue;
        }

        const event = JSON.parse(dataLine);
        if (event.type === "response.output_text.delta" && event.delta) {
          answer += event.delta;

          if (!sawFirstDelta) {
            sawFirstDelta = true;
            sendJson(session.client, {
              type: "timeline",
              turnId: turn.id,
              stage: "llm_first_delta",
              label: "First token",
              elapsedMs: Date.now() - turn.startedAt,
            });
          }

          sendJson(session.client, {
            type: "assistant_delta",
            turnId: turn.id,
            text: event.delta,
          });
        } else if (event.type === "error" || event.error) {
          throw new Error(event.error?.message || event.message || "OpenAI stream error.");
        }
      }
    }
  }

  sendJson(session.client, {
    type: "timeline",
    turnId: turn.id,
    stage: "llm_done",
    label: "OpenAI done",
    elapsedMs: Date.now() - turn.startedAt,
  });

  return answer.trim();
}

async function synthesizeSpeech(session, turn, text) {
  sendJson(session.client, {
    type: "timeline",
    turnId: turn.id,
    stage: "tts_request",
    label: "TTS request",
    elapsedMs: Date.now() - turn.startedAt,
  });

  const response = await fetch(deepgramSpeakUrl(session.runtimeConfig), {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Deepgram TTS failed with ${response.status}: ${body}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  sendJson(session.client, {
    type: "timeline",
    turnId: turn.id,
    stage: "tts_done",
    label: "TTS done",
    elapsedMs: Date.now() - turn.startedAt,
    bytes: audio.byteLength,
  });

  return audio.toString("base64");
}

async function handleTurn(session, transcript) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript || session.processing) {
    return;
  }

  session.processing = true;
  session.finalSegments = [];
  const turn = {
    id: randomUUID(),
    startedAt: Date.now(),
  };

  try {
    session.conversation.push({ role: "user", content: cleanTranscript });
    sendJson(session.client, {
      type: "user_final",
      turnId: turn.id,
      text: cleanTranscript,
    });
    sendJson(session.client, {
      type: "timeline",
      turnId: turn.id,
      stage: "stt_final",
      label: "STT final",
      elapsedMs: 0,
    });

    const answer = await askOpenAIStream(session, turn, cleanTranscript);
    session.conversation.push({ role: "assistant", content: answer });
    sendJson(session.client, { type: "assistant_text", turnId: turn.id, text: answer });

    const audioBase64 = await synthesizeSpeech(session, turn, answer);
    sendJson(session.client, {
      type: "assistant_audio",
      turnId: turn.id,
      mimeType: session.runtimeConfig.tts.encoding === "mp3" ? "audio/mpeg" : "audio/wav",
      audioBase64,
    });
    sendJson(session.client, { type: "assistant_end", turnId: turn.id });
  } catch (error) {
    sendJson(session.client, {
      type: "error",
      message: error.message || String(error),
    });
  } finally {
    session.processing = false;
  }
}

function createDeepgramConnection(session) {
  const dg = new WebSocket(deepgramListenUrl(session.runtimeConfig), {
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      "Content-Type": "audio/linear16",
    },
  });

  dg.on("open", () => {
    sendJson(session.client, {
      type: "runtime_ready",
      listen: session.runtimeConfig.listen,
    });
  });

  dg.on("message", (raw) => {
    const data = parseJson(raw);
    if (!data) {
      return;
    }

    if (data.type === "SpeechStarted" || data.type === "UtteranceEnd") {
      sendJson(session.client, {
        type: "vad_event",
        event: data.type,
        payload: data,
      });
      if (data.type === "UtteranceEnd" && session.finalSegments.length > 0) {
        handleTurn(session, session.finalSegments.join(" "));
      }
      return;
    }

    if (data.type !== "Results") {
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    sendJson(session.client, {
      type: data.is_final ? "stt_final" : "stt_interim",
      text: transcript,
      speechFinal: Boolean(data.speech_final),
    });

    if (data.is_final) {
      session.finalSegments.push(transcript);
    }

    if (data.speech_final) {
      handleTurn(session, session.finalSegments.join(" ") || transcript);
    }
  });

  dg.on("close", (code, reason) => {
    sendJson(session.client, {
      type: "runtime_closed",
      code,
      reason: reason.toString(),
    });
  });

  dg.on("error", (error) => {
    sendJson(session.client, {
      type: "error",
      message: `Deepgram STT error: ${error.message}`,
    });
  });

  return dg;
}

async function askOpenAIDeviceResponse(session, onTextDelta = () => {}) {
  const runtimeConfig = session.runtimeConfig;
  const stream = runtimeConfig.llm.stream;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtimeConfig.llm.model,
      instructions: [
        config.systemPrompt,
        `Agent name: ${runtimeConfig.agentName}.`,
        runtimeConfig.description ? `Agent description: ${runtimeConfig.description}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      input: session.conversation.map(responseInputMessage),
      reasoning: { effort: runtimeConfig.llm.reasoning_effort },
      text: { verbosity: runtimeConfig.llm.verbosity },
      stream,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || `OpenAI failed with ${response.status}`);
  }

  if (!stream) {
    const body = await response.json();
    return (
      body.output_text ||
      (body.output || [])
        .flatMap((item) => item.content || [])
        .filter((item) => item.type === "output_text" && item.text)
        .map((item) => item.text)
        .join("") ||
      ""
    ).trim();
  }

  if (!response.body) {
    throw new Error("OpenAI streaming response had no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") {
          continue;
        }

        const event = JSON.parse(dataLine);
        if (event.type === "response.output_text.delta" && event.delta) {
          answer += event.delta;
          await onTextDelta(event.delta);
        } else if (event.type === "error" || event.error) {
          throw new Error(event.error?.message || event.message || "OpenAI stream error.");
        }
      }
    }
  }

  return answer.trim();
}

function sendDeviceJson(session, payload) {
  sendJson(session.ws, {
    session_id: session.id,
    ...payload,
  });
}

function createDeviceSttConnection(session) {
  session.sttConnecting = true;
  const dg = new WebSocket(deepgramListenUrl(session.runtimeConfig), {
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      "Content-Type": "audio/linear16",
    },
  });

  dg.on("open", () => {
    session.sttConnecting = false;
    session.sttOpen = true;
    console.log(`[device ${session.id}] Deepgram STT connected`);
    setDeviceState(session, "listening", "Deepgram STT connected.");
  });

  dg.on("message", (raw) => {
    const data = parseJson(raw);
    if (!data || data.type !== "Results") {
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    if (data.is_final) {
      session.finalSegments.push(transcript);
      sendDeviceJson(session, { type: "stt", text: transcript });
      setDeviceState(session, "listening", `STT final: ${transcript}`);
    }

    if (data.speech_final) {
      const text = session.finalSegments.join(" ") || transcript;
      session.finalSegments = [];
      handleDeviceTurn(session, text);
    }
  });

  dg.on("close", () => {
    session.sttConnecting = false;
    session.sttOpen = false;
    if (session.deepgram === dg) {
      session.deepgram = null;
    }
    console.log(`[device ${session.id}] Deepgram STT disconnected`);
    setDeviceState(session, "ready", "Deepgram STT disconnected.");
  });

  dg.on("error", (error) => {
    session.sttConnecting = false;
    console.error(`[device ${session.id}] Deepgram STT error: ${error.message}`);
    setDeviceState(session, "error", `Deepgram STT error: ${error.message}`);
  });

  return dg;
}

async function synthesizeDevicePcm(session, text) {
  const response = await fetch(deepgramSpeakPcmUrl(session.runtimeConfig), {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Deepgram TTS failed with ${response.status}: ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function encodePcmToOpusFrames(pcm, sampleRate = 24000, frameDurationMs = 60) {
  const encoder = new OpusScript(sampleRate, 1, OpusScript.Application.AUDIO);
  const frameSamples = (sampleRate / 1000) * frameDurationMs;
  const frameBytes = frameSamples * 2;
  const frames = [];

  for (let offset = 0; offset < pcm.length; offset += frameBytes) {
    const frame = Buffer.alloc(frameBytes);
    pcm.copy(frame, 0, offset, Math.min(offset + frameBytes, pcm.length));
    frames.push(Buffer.from(encoder.encode(frame, frameSamples)));
  }

  return frames;
}

async function handleDeviceTurn(session, transcript) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript || session.processing) {
    return;
  }

  session.processing = true;
  console.log(`[device ${session.id}] user: ${cleanTranscript}`);
  setDeviceState(session, "thinking", `User: ${cleanTranscript}`);

  try {
    session.conversation.push({ role: "user", content: cleanTranscript });
    const answer = await askOpenAIDeviceResponse(session);
    if (!answer) {
      throw new Error("OpenAI returned no text output.");
    }

    session.conversation.push({ role: "assistant", content: answer });
    console.log(`[device ${session.id}] assistant: ${answer}`);
    setDeviceState(session, "speaking", `Assistant: ${answer}`);

    sendDeviceJson(session, { type: "llm", emotion: "happy", text: "" });
    sendDeviceJson(session, { type: "tts", state: "start" });
    sendDeviceJson(session, { type: "tts", state: "sentence_start", text: answer });

    const pcm = await synthesizeDevicePcm(session, answer);
    const frames = encodePcmToOpusFrames(pcm, 24000, 60);
    for (const frame of frames) {
      if (session.ws.readyState !== WebSocket.OPEN) {
        break;
      }
      session.ws.send(frame, { binary: true });
      await new Promise((resolve) => setTimeout(resolve, 55));
    }

    sendDeviceJson(session, { type: "tts", state: "stop" });
    setDeviceState(session, "ready", "TTS complete.");
  } catch (error) {
    console.error(`[device ${session.id}] turn failed: ${error.message}`);
    setDeviceState(session, "error", `Turn failed: ${error.message}`);
    sendDeviceJson(session, {
      type: "alert",
      status: "Error",
      message: error.message,
      emotion: "sad",
    });
  } finally {
    session.processing = false;
  }
}

function startDeviceStt(session) {
  if (
    session.sttConnecting ||
    (session.deepgram &&
      (session.deepgram.readyState === WebSocket.OPEN || session.deepgram.readyState === WebSocket.CONNECTING))
  ) {
    return;
  }
  session.deepgram = createDeviceSttConnection(session);
}

function handleDeviceJson(session, message) {
  if (message.type === "hello") {
    sendDeviceJson(session, {
      type: "hello",
      transport: "websocket",
      audio_params: {
        format: "opus",
        sample_rate: 24000,
        channels: 1,
        frame_duration: 60,
      },
    });
    console.log(`[device ${session.id}] hello version=${message.version}`);
    session.deviceRecord.protocolVersion = String(message.version || session.deviceRecord.protocolVersion || "");
    setDeviceState(session, "ready", `Protocol hello v${message.version || "unknown"}.`);
    return;
  }

  if (message.type === "listen") {
    console.log(`[device ${session.id}] listen ${message.state} mode=${message.mode || ""} text=${message.text || ""}`);
    if (message.state === "start" || message.state === "detect") {
      setDeviceState(
        session,
        message.state === "detect" ? "wake_detected" : "listening",
        message.text ? `Wake detected: ${message.text}` : `Listen ${message.state}.`,
      );
      startDeviceStt(session);
    } else if (message.state === "stop" && session.deepgram?.readyState === WebSocket.OPEN) {
      setDeviceState(session, "processing", "Listen stop.");
      session.deepgram.send(JSON.stringify({ type: "Finalize" }));
    }
    return;
  }

  if (message.type === "abort") {
    console.log(`[device ${session.id}] abort ${message.reason || ""}`);
    setDeviceState(session, "ready", `Abort: ${message.reason || "no reason"}.`);
    return;
  }

  if (message.type === "mcp") {
    return;
  }

  console.log(`[device ${session.id}] ignored json`, message);
}

function handleDeviceAudio(session, frame) {
  startDeviceStt(session);
  if (!session.decoder) {
    session.decoder = new OpusScript(16000, 1, OpusScript.Application.AUDIO);
  }
  if (!session.sttOpen || session.deepgram?.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    const pcm = session.decoder.decode(frame);
    session.deepgram.send(Buffer.from(pcm));
  } catch (error) {
    console.error(`[device ${session.id}] opus decode failed: ${error.message}`);
  }
}

function configureSession(session, agent) {
  if (!config.deepgramApiKey || !config.openaiApiKey) {
    sendJson(session.client, {
      type: "error",
      message: "Missing DEEPGRAM_API_KEY or OPENAI_API_KEY. Create .env from .env.example.",
    });
    return;
  }

  session.runtimeConfig = normalizeAgentConfig(agent);
  session.conversation = [];
  session.finalSegments = [];
  if (session.deepgram?.readyState === WebSocket.OPEN || session.deepgram?.readyState === WebSocket.CONNECTING) {
    session.deepgram.close();
  }
  session.deepgram = createDeepgramConnection(session);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    writeJson(res, 204, {});
    return;
  }

  if (url.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      deepgramConfigured: Boolean(config.deepgramApiKey),
      openaiConfigured: Boolean(config.openaiApiKey),
      otaEndpoint: "/ota/",
      deviceWebSocketEndpoint: "/ws",
      deviceCount: deviceRegistry.size,
    });
    return;
  }

  if (url.pathname === "/devices" && req.method === "GET") {
    writeJson(res, 200, {
      devices: Array.from(deviceRegistry.values()).map(publicDevice),
    });
    return;
  }

  const deviceConfigMatch = url.pathname.match(/^\/devices\/([^/]+)\/config$/);
  if (deviceConfigMatch && req.method === "PUT") {
    readJsonBody(req)
      .then((payload) => {
        const deviceId = decodeURIComponent(deviceConfigMatch[1]);
        const device = getOrCreateDevice(deviceId);
        bindDeviceConfig(device, payload);
        writeJson(res, 200, { device: publicDevice(device) });
      })
      .catch((error) => {
        writeJson(res, 400, { error: error.message || String(error) });
      });
    return;
  }

  const deviceForgetMatch = url.pathname.match(/^\/devices\/([^/]+)$/);
  if (deviceForgetMatch && req.method === "DELETE") {
    const deviceId = decodeURIComponent(deviceForgetMatch[1]);
    const device = deviceRegistry.get(deviceId);
    if (device?.session?.ws.readyState === WebSocket.OPEN) {
      writeJson(res, 409, { error: "Connected devices cannot be forgotten from runtime." });
      return;
    }
    deviceRegistry.delete(deviceId);
    writeJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/ota/") {
    const host = req.headers.host || `${config.host}:${config.port}`;
    const wsUrl = `ws://${host}/ws`;
    const device = getOrCreateDevice(req.headers["device-id"] || req.headers["client-id"], req);
    req.resume();
    console.log(`[ota] ${req.method} device=${device.id} -> ${wsUrl}`);
    logDeviceEvent(device, `OTA requested. WebSocket ${wsUrl}.`);
    writeJson(res, 200, {
      websocket: {
        url: wsUrl,
        token: "dot-local",
        version: 1,
      },
      server_time: {
        timestamp: Date.now(),
        timezone_offset: -new Date().getTimezoneOffset(),
      },
    });
    return;
  }

  writeJson(res, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ noServer: true });
const deviceWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/voice") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
    return;
  }

  if (url.pathname === "/ws") {
    deviceWss.handleUpgrade(request, socket, head, (ws) => {
      deviceWss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

wss.on("connection", (client) => {
  const session = {
    client,
    deepgram: null,
    runtimeConfig: normalizeAgentConfig(null),
    conversation: [],
    finalSegments: [],
    processing: false,
  };

  sendJson(client, { type: "runtime_connected" });

  client.on("message", (message, isBinary) => {
    if (isBinary) {
      if (session.deepgram?.readyState === WebSocket.OPEN) {
        session.deepgram.send(message);
      }
      return;
    }

    const payload = parseJson(message);
    if (!payload) {
      return;
    }

    if (payload.type === "configure") {
      configureSession(session, payload.agent);
    } else if (payload.type === "force_response") {
      handleTurn(session, session.finalSegments.join(" "));
    } else if (payload.type === "reset") {
      session.conversation = [];
      session.finalSegments = [];
      sendJson(client, { type: "reset_done" });
    } else if (payload.type === "finalize" && session.deepgram?.readyState === WebSocket.OPEN) {
      session.deepgram.send(JSON.stringify({ type: "Finalize" }));
    }
  });

  client.on("close", () => {
    if (session.deepgram?.readyState === WebSocket.OPEN || session.deepgram?.readyState === WebSocket.CONNECTING) {
      session.deepgram.close();
    }
  });
});

deviceWss.on("connection", (ws, request) => {
  if (!config.deepgramApiKey || !config.openaiApiKey) {
    ws.close(1011, "Missing API keys");
    return;
  }

  const device = getOrCreateDevice(request.headers["device-id"] || request.headers["client-id"], request);
  const session = {
    id: randomUUID(),
    deviceId: device.id,
    deviceRecord: device,
    ws,
    deepgram: null,
    decoder: null,
    runtimeConfig: device.runtimeConfig,
    conversation: [],
    finalSegments: [],
    sttConnecting: false,
    sttOpen: false,
    processing: false,
  };

  if (device.session?.ws.readyState === WebSocket.OPEN) {
    device.session.ws.close(1000, "Replaced by a new device connection");
  }
  device.session = session;
  device.availability = "available";
  device.state = "connected";
  device.connectedAt = new Date().toISOString();
  device.lastSeenAt = device.connectedAt;
  device.updatedAt = device.connectedAt;
  logDeviceEvent(device, `Connected from ${device.ipAddress || "unknown IP"}.`);

  console.log(
    `[device ${session.id}] connected from ${request.socket.remoteAddress} device=${device.id}`,
  );

  ws.on("message", (message, isBinary) => {
    if (isBinary) {
      handleDeviceAudio(session, Buffer.from(message));
      return;
    }

    const payload = parseJson(message);
    if (!payload) {
      console.error(`[device ${session.id}] invalid json`);
      return;
    }

    handleDeviceJson(session, payload);
  });

  ws.on("close", () => {
    console.log(`[device ${session.id}] disconnected`);
    if (session.deepgram?.readyState === WebSocket.OPEN || session.deepgram?.readyState === WebSocket.CONNECTING) {
      session.deepgram.close();
    }
    if (device.session === session) {
      device.session = null;
      device.availability = "offline";
      device.state = "offline";
      device.updatedAt = new Date().toISOString();
      logDeviceEvent(device, "Disconnected.");
    }
  });

  ws.on("error", (error) => {
    console.error(`[device ${session.id}] websocket error: ${error.message}`);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`OpenDot voice runtime listening on http://${config.host}:${config.port}`);
  console.log(`Browser WebSocket endpoint: ws://localhost:${config.port}/voice`);
  console.log(`DOT device OTA endpoint: http://localhost:${config.port}/ota/`);
});
