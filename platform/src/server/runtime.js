import "./env.js";

import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import OpusScript from "opusscript";

const config = {
  host: process.env.RUNTIME_HOST || "0.0.0.0",
  port: Number(process.env.PORT || process.env.RUNTIME_PORT || 8787),
  platformApiInternalUrl: (
    process.env.PLATFORM_API_INTERNAL_URL || "http://localhost:8788/api"
  ).replace(/\/+$/, ""),
  runtimeInternalSecret:
    process.env.OPENDOT_RUNTIME_INTERNAL_SECRET ||
    "opendot-local-runtime-internal-secret-change-me",
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.1",
  systemPrompt:
    process.env.OPENDOT_SYSTEM_PROMPT ||
    "You are a concise voice assistant. Answer naturally in one or two short spoken paragraphs.",
  sttModel: process.env.DEEPGRAM_STT_MODEL || "nova-3",
  sttLanguage: process.env.DEEPGRAM_STT_LANGUAGE || "en-US",
  endpointingMs: Number(process.env.DEEPGRAM_ENDPOINTING_MS || 900),
  utteranceEndMs: Number(process.env.DEEPGRAM_UTTERANCE_END_MS || 1000),
  ttsModel: process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en",
  ttsEncoding: process.env.DEEPGRAM_TTS_ENCODING || "mp3",
  ttsSampleRate: Number(process.env.DEEPGRAM_TTS_SAMPLE_RATE || 24000),
  minTranscriptChars: Number(process.env.MIN_TRANSCRIPT_CHARS || 2),
  closeDeviceAfterTurn: process.env.CLOSE_DEVICE_AFTER_TURN !== "false",
  closeDeviceAfterTurnDelayMs: Number(
    process.env.CLOSE_DEVICE_AFTER_TURN_DELAY_MS || 300,
  ),
};

const ttsChunkBaseInstructions = [
  "For voice output, format every assistant reply as XML-like TTS chunks.",
  "Use only this format: <chunk>first spoken chunk</chunk><chunk>next spoken chunk</chunk>.",
  "Do not write any text outside <chunk> tags.",
  "Close each chunk as soon as a natural phrase or short sentence is complete so TTS can start immediately.",
  "Use plain spoken language. Avoid markdown, bullets, code fences, tables, emojis, and XML special characters.",
];

function defaultPromptInstructions() {
  return [config.systemPrompt, ttsChunkBaseInstructions.join("\n")].join("\n\n");
}

function ttsChunkStyleInstruction(runtimeConfig) {
  const style = runtimeConfig?.tts?.chunkStyle || "fast";
  return (
    {
      fast: "Keep each chunk very short: normally 6-16 words and never more than 120 characters.",
      balanced:
        "Keep each chunk short: normally 8-25 words and never more than 180 characters.",
      relaxed:
        "Use sentence-sized chunks: normally 16-40 words and never more than 260 characters.",
    }[style] ||
    "Keep each chunk short: normally 8-25 words and never more than 180 characters."
  );
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

const runtimeTransportKinds = Object.freeze({
  browserWebSocket: "websocket.browser",
  deviceWebSocket: "websocket.device",
  mqtt: "mqtt",
  udp: "udp",
  webrtc: "webrtc",
});

function createRuntimeEvent(session, type, payload = {}) {
  return {
    type,
    eventId: randomUUID(),
    sessionId: session.id,
    transport: session.transport.kind,
    createdAt: new Date().toISOString(),
    payload,
  };
}

// Runtime transport adapter contract: keep this small enough for WebRTC, MQTT,
// and UDP adapters to implement without changing pipeline/session code.
function createWebSocketTransport(kind, socket) {
  return {
    kind,
    protocol: "websocket",
    socket,
    isOpen() {
      return socket.readyState === WebSocket.OPEN;
    },
    sendJson(payload) {
      sendJson(socket, payload);
    },
    sendBinary(payload, options) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload, options);
      }
    },
    close(code, reason) {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(code, reason);
      }
    },
  };
}

function createPipelineRunner(kind, runTurn) {
  return {
    kind,
    runTurn,
  };
}

function createBrowserSession(client, auth = null) {
  const agent = auth?.agent || null;
  return {
    id: randomUUID(),
    kind: "browser",
    transport: createWebSocketTransport(runtimeTransportKinds.browserWebSocket, client),
    pipelineRunner: createPipelineRunner("browser", handleTurn),
    client,
    deepgram: null,
    runtimeConfig: normalizeAgentConfig(agent),
    agentSnapshot: agent,
    userId: auth?.userId || null,
    conversation: [],
    finalSegments: [],
    processing: false,
  };
}

function createDeviceConnection(device, request) {
  return {
    deviceId: device.id,
    deviceRecord: device,
    remoteAddress: request.socket.remoteAddress,
    userAgent: request.headers["user-agent"] || null,
  };
}

function createDeviceSession(ws, device, request) {
  return {
    id: randomUUID(),
    kind: "device",
    transport: createWebSocketTransport(runtimeTransportKinds.deviceWebSocket, ws),
    pipelineRunner: createPipelineRunner("device", handleDeviceTurn),
    deviceConnection: createDeviceConnection(device, request),
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
    listening: false,
    awaitingFinal: false,
    closingAfterTurn: false,
    closeTimer: null,
    pendingPcm: [],
    turnAudioFrames: 0,
    turnAudioBytes: 0,
    processing: false,
  };
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function writeUpgradeError(socket, statusCode, message) {
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${message}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(message)}`,
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
}

async function callPlatformInternal(path, payload) {
  const response = await fetch(`${config.platformApiInternalUrl}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      "X-OpenDot-Runtime-Secret": config.runtimeInternalSecret,
    },
    method: "POST",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(body?.error || `Platform API returned ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }

  return { statusCode: response.status, body };
}

function requestAuthorization(request) {
  const header = request.headers.authorization;
  return Array.isArray(header) ? header[0] : header || "";
}

function bearerToken(authorization) {
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function runtimeWebSocketUrl(request) {
  const host = request.headers.host || `${config.host}:${config.port}`;
  return `ws://${host}/ws`;
}

function runtimeDevicePayload(request, extra = {}) {
  return {
    deviceId: request.headers["device-id"] || "",
    clientId: request.headers["client-id"] || "",
    serialNumber: request.headers["serial-number"] || null,
    userAgent: request.headers["user-agent"] || "",
    ipAddress: requestIp(request),
    authorization: requestAuthorization(request),
    websocketUrl: runtimeWebSocketUrl(request),
    ...extra,
  };
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanAssistantText(text) {
  return String(text || "")
    .replace(/<\/?chunk\b[^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createChunkParser() {
  const openTag = "<chunk";
  const closeTag = "</chunk>";
  let buffer = "";

  function keepPossiblePartialTag() {
    const lastOpen = buffer.lastIndexOf("<");
    buffer = lastOpen === -1 ? "" : buffer.slice(lastOpen);
  }

  return {
    push(delta) {
      buffer += delta;
      const chunks = [];

      while (true) {
        const lowerBuffer = buffer.toLowerCase();
        const start = lowerBuffer.indexOf(openTag);
        if (start === -1) {
          keepPossiblePartialTag();
          break;
        }
        if (start > 0) {
          buffer = buffer.slice(start);
        }

        const openEnd = buffer.indexOf(">");
        if (openEnd === -1) {
          break;
        }

        const end = buffer.toLowerCase().indexOf(closeTag, openEnd + 1);
        if (end === -1) {
          break;
        }

        const text = cleanAssistantText(buffer.slice(openEnd + 1, end));
        if (text) {
          chunks.push(text);
        }
        buffer = buffer.slice(end + closeTag.length);
      }

      return chunks;
    },
    flush() {
      const text = cleanAssistantText(buffer);
      buffer = "";
      return text ? [text] : [];
    },
  };
}

function parseAssistantChunks(text) {
  const parser = createChunkParser();
  const chunks = parser.push(String(text || ""));
  chunks.push(...parser.flush());
  return chunks.length > 0
    ? chunks
    : cleanAssistantText(text)
      ? [cleanAssistantText(text)]
      : [];
}

function responseInstructions(runtimeConfig) {
  return [
    runtimeConfig.systemPrompt || defaultPromptInstructions(),
    `Agent name: ${runtimeConfig.agentName}.`,
    runtimeConfig.description ? `Agent description: ${runtimeConfig.description}.` : "",
    ttsChunkStyleInstruction(runtimeConfig),
  ]
    .filter(Boolean)
    .join("\n");
}

function isTranscriptTooShort(text, runtimeConfig = null) {
  const minimum = Number(
    runtimeConfig?.turn?.minTranscriptChars ?? config.minTranscriptChars,
  );
  return text.replace(/\s+/g, "").length < minimum;
}

function settingEntry(stage, key) {
  return stage?.settings?.find((item) => item.key === key);
}

function setting(stage, key, fallback) {
  const found = settingEntry(stage, key);
  return found?.value ?? fallback;
}

function stringSetting(stage, key, fallback = "") {
  const value = setting(stage, key, fallback);
  return typeof value === "string" ? value : String(value ?? fallback);
}

function booleanSetting(stage, key, fallback) {
  const value = setting(stage, key, fallback);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value !== "false";
  }
  return Boolean(value);
}

function numberSetting(stage, key, fallback) {
  const value = setting(stage, key, fallback);
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function stringListSetting(stage, key, fallback = []) {
  const value = setting(stage, key, fallback);
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

function recordSetting(stage, key, fallback = {}) {
  const value = setting(stage, key, fallback);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([entryKey, entryValue]) => [entryKey.trim(), String(entryValue)])
      .filter(([entryKey]) => entryKey.length > 0),
  );
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
    systemPrompt:
      stringSetting(llm, "system_prompt", "").trim() || defaultPromptInstructions(),
    listen,
    llm: {
      model: llm?.model || config.openaiModel,
      api: normalizeOpenAIApi(setting(llm, "api", "responses")),
      apiKeyName: stringSetting(llm, "api_key_name", "").trim() || "OPENAI_API_KEY",
      baseUrl: stringSetting(llm, "base_url", "").trim() || config.openaiBaseUrl,
      temperature: numberSetting(llm, "temperature", 1),
      maxOutputTokens: stringSetting(llm, "max_output_tokens", "").trim(),
      reasoning_effort: String(setting(llm, "reasoning_effort", "default")),
      verbosity: String(setting(llm, "verbosity", "default")),
      stream: selectedFeature(llm, "stream", true, "response_features"),
      stopSequences: stringListSetting(llm, "stop_sequences", []).slice(0, 4),
      seed: stringSetting(llm, "seed", "").trim(),
      jsonMode: booleanSetting(llm, "json_mode", false),
      extraHeaders: recordSetting(llm, "extra_headers", {}),
      timeoutSeconds: numberSetting(llm, "timeout_s", 70),
      maxRetries: numberSetting(llm, "max_retries", 2),
      requestsPerSecond: numberSetting(llm, "requests_per_second", 50),
      extraParameters: stringSetting(llm, "extra_parameters", "{}").trim() || "{}",
    },
    tts: {
      model: tts?.model || config.ttsModel,
      encoding: String(setting(tts, "encoding", config.ttsEncoding)),
      sampleRate: Number(setting(tts, "sample_rate", config.ttsSampleRate)),
      delivery: String(setting(tts, "delivery", "chunked_file")),
      chunkStyle: String(setting(tts, "chunk_style", "fast")),
    },
    turn: {
      minTranscriptChars: Number(
        setting(vad, "min_transcript_chars", config.minTranscriptChars),
      ),
      closeDeviceAfterTurn: booleanSetting(
        vad,
        "close_device_after_turn",
        config.closeDeviceAfterTurn,
      ),
      closeDeviceAfterTurnDelayMs: Number(
        setting(
          vad,
          "close_device_after_turn_delay_ms",
          config.closeDeviceAfterTurnDelayMs,
        ),
      ),
    },
  };
}

function deepgramListenUrl(runtimeConfig) {
  const params = new URLSearchParams(runtimeConfig.listen);
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function ttsEncoding(runtimeConfig) {
  return String(runtimeConfig.tts.encoding || "mp3").toLowerCase();
}

function ttsSampleRate(runtimeConfig) {
  return Number(runtimeConfig.tts.sampleRate || config.ttsSampleRate || 24000);
}

function shouldStreamBrowserPcm(runtimeConfig) {
  return (
    runtimeConfig.tts.delivery === "pcm_stream" &&
    ttsEncoding(runtimeConfig) === "linear16"
  );
}

function ttsMimeType(runtimeConfig) {
  const encoding = ttsEncoding(runtimeConfig);
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
  return "audio/wav";
}

function deepgramSpeakUrl(runtimeConfig) {
  const encoding = ttsEncoding(runtimeConfig);
  const params = new URLSearchParams({ model: runtimeConfig.tts.model, encoding });

  if (["linear16", "mulaw", "alaw", "flac"].includes(encoding)) {
    params.set("sample_rate", String(ttsSampleRate(runtimeConfig)));
  }

  if (["linear16", "mulaw", "alaw"].includes(encoding)) {
    params.set("container", shouldStreamBrowserPcm(runtimeConfig) ? "none" : "wav");
  }

  return `https://api.deepgram.com/v1/speak?${params.toString()}`;
}

function deepgramSpeakPcmUrl(runtimeConfig) {
  const params = new URLSearchParams({
    model: runtimeConfig.tts.model,
    encoding: "linear16",
    sample_rate: "24000",
    container: "none",
  });
  return `https://api.deepgram.com/v1/speak?${params.toString()}`;
}

function wavFromPcm(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  const dataLength = pcm.length;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcm]);
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
    device.protocolVersion =
      request.headers["protocol-version"] || device.protocolVersion;
  }

  device.lastSeenAt = now;
  device.updatedAt = now;
  return device;
}

function applyPlatformDeviceAuth(device, auth) {
  const platformDevice = auth?.device;
  const agent = auth?.agent || null;
  const now = new Date().toISOString();

  if (platformDevice) {
    device.platformDeviceId = platformDevice.id;
    device.name = platformDevice.name || device.name;
    device.model = platformDevice.model || device.model;
    device.serialNumber = platformDevice.serialNumber || device.serialNumber;
    device.ipAddress = platformDevice.ipAddress || device.ipAddress;
    device.boundAgentId = platformDevice.boundAgentId;
    device.boundAgentName = platformDevice.boundAgentName;
    device.boundConfigVersion = platformDevice.boundConfigVersion;
    device.boundAt = platformDevice.boundAt;
  }

  device.agentSnapshot = agent;
  device.runtimeConfig = normalizeAgentConfig(agent);
  device.updatedAt = now;

  if (agent) {
    logDeviceEvent(device, `Loaded bound agent config: ${agent.name}.`);
  } else {
    logDeviceEvent(device, "No agent is bound; using default runtime config.");
  }
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
  device.availability =
    session.ws.readyState === WebSocket.OPEN ? "available" : device.availability;
  device.lastSeenAt = new Date().toISOString();
  device.updatedAt = device.lastSeenAt;
  if (text) {
    logDeviceEvent(device, text);
  }
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

function chatInputMessage(message) {
  return {
    role: message.role,
    content: message.content,
  };
}

function chatInstructionsMessage(runtimeConfig) {
  return {
    role: "system",
    content: responseInstructions(runtimeConfig),
  };
}

function elapsedMs(turn, at = Date.now()) {
  return Math.max(0, at - turn.startedAt);
}

function sendTimeline(session, turn, payload) {
  const elapsed = Number.isFinite(payload.elapsedMs)
    ? payload.elapsedMs
    : Number.isFinite(payload.endMs)
      ? payload.endMs
      : Number.isFinite(payload.startMs)
        ? payload.startMs
        : elapsedMs(turn);

  sendJson(session.client, {
    type: "timeline",
    turnId: turn.id,
    elapsedMs: elapsed,
    ...payload,
  });
}

const defaultOpenAIBaseUrl = "https://api.openai.com/v1";
let openaiRateLimitQueue = Promise.resolve();
let lastOpenAIRequestAt = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOpenAIBaseUrl(baseUrl) {
  return (String(baseUrl || "").trim() || defaultOpenAIBaseUrl).replace(/\/+$/, "");
}

function normalizeOpenAIApi(api) {
  const normalized = String(api || "responses").trim().toLowerCase();
  if (["chat", "chat-completions", "chat_completions"].includes(normalized)) {
    return "chat_completions";
  }
  return "responses";
}

function openAIResponseUrl(llmConfig) {
  const baseUrl = normalizeOpenAIBaseUrl(llmConfig.baseUrl);
  return baseUrl.endsWith("/responses") ? baseUrl : `${baseUrl}/responses`;
}

function openAIChatCompletionsUrl(llmConfig) {
  const baseUrl = normalizeOpenAIBaseUrl(llmConfig.baseUrl);
  return baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;
}

function openAIApiKey(llmConfig) {
  const apiKeyName = String(llmConfig.apiKeyName || "OPENAI_API_KEY").trim();
  return apiKeyName ? process.env[apiKeyName] || "" : "";
}

function usesDefaultOpenAIEndpoint(llmConfig) {
  return normalizeOpenAIBaseUrl(llmConfig.baseUrl) === defaultOpenAIBaseUrl;
}

function hasRequiredLlmCredentials(runtimeConfig) {
  const llmConfig = runtimeConfig?.llm || {};
  return !usesDefaultOpenAIEndpoint(llmConfig) || Boolean(openAIApiKey(llmConfig));
}

function openAIHeaders(llmConfig) {
  const headers = {
    "Content-Type": "application/json",
    ...llmConfig.extraHeaders,
  };
  const apiKey = openAIApiKey(llmConfig);

  if (apiKey && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function parseJsonObject(value, label) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} must be valid JSON.`);
    }
    throw error;
  }
}

function optionalInteger(value, label) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isInteger(numericValue)) {
    throw new Error(`${label} must be an integer.`);
  }
  return numericValue;
}

function openAITextConfig(llmConfig) {
  const text = {};
  const verbosity = String(llmConfig.verbosity || "default");

  if (verbosity !== "default") {
    text.verbosity = verbosity;
  }

  if (llmConfig.jsonMode) {
    text.format = { type: "json_object" };
  }

  return Object.keys(text).length > 0 ? text : null;
}

function openAIResponseBody(runtimeConfig, input) {
  const llmConfig = runtimeConfig.llm;
  const body = {
    model: llmConfig.model,
    instructions: responseInstructions(runtimeConfig),
    input,
    stream: llmConfig.stream,
  };
  const temperature = Number(llmConfig.temperature);
  const maxOutputTokens = optionalInteger(
    llmConfig.maxOutputTokens,
    "Max output tokens",
  );
  const seed = optionalInteger(llmConfig.seed, "Seed");
  const reasoningEffort = String(llmConfig.reasoning_effort || "default");
  const textConfig = openAITextConfig(llmConfig);

  if (Number.isFinite(temperature)) {
    body.temperature = temperature;
  }

  if (maxOutputTokens !== null && maxOutputTokens > 0) {
    body.max_output_tokens = maxOutputTokens;
  }

  if (reasoningEffort && !["default", "none"].includes(reasoningEffort)) {
    body.reasoning = { effort: reasoningEffort };
  }

  if (textConfig) {
    body.text = textConfig;
  }

  if (Array.isArray(llmConfig.stopSequences) && llmConfig.stopSequences.length > 0) {
    body.stop = llmConfig.stopSequences;
  }

  if (seed !== null) {
    body.seed = seed;
  }

  return {
    ...body,
    ...parseJsonObject(llmConfig.extraParameters, "Extra parameters"),
  };
}

function openAIChatBody(runtimeConfig, conversation) {
  const llmConfig = runtimeConfig.llm;
  const body = {
    model: llmConfig.model,
    messages: [
      chatInstructionsMessage(runtimeConfig),
      ...conversation.map(chatInputMessage),
    ],
    stream: llmConfig.stream,
  };
  const temperature = Number(llmConfig.temperature);
  const maxOutputTokens = optionalInteger(
    llmConfig.maxOutputTokens,
    "Max output tokens",
  );
  const seed = optionalInteger(llmConfig.seed, "Seed");
  const reasoningEffort = String(llmConfig.reasoning_effort || "default");

  if (Number.isFinite(temperature)) {
    body.temperature = temperature;
  }

  if (maxOutputTokens !== null && maxOutputTokens > 0) {
    body.max_completion_tokens = maxOutputTokens;
  }

  if (reasoningEffort && reasoningEffort !== "default") {
    body.reasoning_effort = reasoningEffort;
  }

  if (Array.isArray(llmConfig.stopSequences) && llmConfig.stopSequences.length > 0) {
    body.stop = llmConfig.stopSequences;
  }

  if (seed !== null) {
    body.seed = seed;
  }

  if (llmConfig.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  return {
    ...body,
    ...parseJsonObject(llmConfig.extraParameters, "Extra parameters"),
  };
}

function openAIRequestUrl(llmConfig) {
  return llmConfig.api === "chat_completions"
    ? openAIChatCompletionsUrl(llmConfig)
    : openAIResponseUrl(llmConfig);
}

function openAIRequestBody(runtimeConfig, conversation) {
  return runtimeConfig.llm.api === "chat_completions"
    ? openAIChatBody(runtimeConfig, conversation)
    : openAIResponseBody(runtimeConfig, conversation.map(responseInputMessage));
}

async function waitForOpenAIRateLimit(llmConfig) {
  const requestsPerSecond = Number(llmConfig.requestsPerSecond);
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    return;
  }

  const minimumIntervalMs = 1000 / requestsPerSecond;
  openaiRateLimitQueue = openaiRateLimitQueue.then(async () => {
    const waitMs = lastOpenAIRequestAt + minimumIntervalMs - Date.now();
    if (waitMs > 0) {
      await delay(waitMs);
    }
    lastOpenAIRequestAt = Date.now();
  });

  await openaiRateLimitQueue;
}

function retryableOpenAIStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenAIResponse(runtimeConfig, conversation) {
  const llmConfig = runtimeConfig.llm;
  await waitForOpenAIRateLimit(llmConfig);

  const url = openAIRequestUrl(llmConfig);
  const request = {
    method: "POST",
    headers: openAIHeaders(llmConfig),
    body: JSON.stringify(openAIRequestBody(runtimeConfig, conversation)),
  };
  const timeoutMs = Math.max(1000, Number(llmConfig.timeoutSeconds || 70) * 1000);
  const maxRetries = Math.max(0, Math.floor(Number(llmConfig.maxRetries) || 0));
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, request, timeoutMs);
      if (
        response.ok ||
        !retryableOpenAIStatus(response.status) ||
        attempt === maxRetries
      ) {
        return response;
      }

      await response.arrayBuffer().catch(() => null);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`OpenAI-compatible request failed: ${message}`);
      }
    }

    await delay(Math.min(250 * 2 ** attempt, 2000));
  }

  throw lastError || new Error("OpenAI-compatible request failed.");
}

async function openAIErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null);
    return (
      body?.error?.message ||
      body?.message ||
      `OpenAI-compatible endpoint failed with ${response.status}`
    );
  }

  const body = await response.text().catch(() => "");
  return body || `OpenAI-compatible endpoint failed with ${response.status}`;
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item?.type === "text" && item.text) {
        return item.text;
      }
      if (item?.text) {
        return item.text;
      }
      return "";
    })
    .join("");
}

function openAICompletionText(api, body) {
  if (api === "chat_completions") {
    return contentToText(body.choices?.[0]?.message?.content);
  }

  return (
    body.output_text ||
    (body.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text" && item.text)
      .map((item) => item.text)
      .join("") ||
    ""
  );
}

function openAIStreamDelta(api, event) {
  if (api === "chat_completions") {
    return (event.choices || [])
      .map((choice) => contentToText(choice.delta?.content))
      .join("");
  }

  return event.type === "response.output_text.delta" && event.delta ? event.delta : "";
}

async function askOpenAIStream(
  session,
  turn,
  transcript,
  { onChunk = async () => {} } = {},
) {
  const stream = session.runtimeConfig.llm.stream;
  const llmApi = session.runtimeConfig.llm.api;
  const requestStartedAt = Date.now();
  const requestStartMs = elapsedMs(turn, requestStartedAt);
  const response = await fetchOpenAIResponse(session.runtimeConfig, session.conversation);

  if (!response.ok) {
    throw new Error(await openAIErrorMessage(response));
  }

  const requestEndMs = elapsedMs(turn);
  sendTimeline(session, turn, {
    spanId: "llm-request",
    stage: "llm_request",
    label: "OpenAI-compatible request",
    startMs: requestStartMs,
    endMs: requestEndMs,
  });
  sendJson(session.client, { type: "assistant_start", turnId: turn.id, transcript });

  if (!stream) {
    const responseReadStartMs = requestEndMs;
    const body = await response.json();
    const answer = openAICompletionText(llmApi, body);

    const chunks = parseAssistantChunks(answer);
    sendJson(session.client, {
      type: "assistant_xml_text",
      turnId: turn.id,
      text: answer,
    });
    for (const chunk of chunks) {
      sendJson(session.client, {
        type: "assistant_delta",
        turnId: turn.id,
        text: `${chunk} `,
      });
      await onChunk(chunk);
    }

    sendTimeline(session, turn, {
      spanId: "llm-response",
      stage: "llm_done",
      label: "OpenAI-compatible response",
      startMs: responseReadStartMs,
      endMs: elapsedMs(turn),
    });

    return cleanAssistantText(answer);
  }

  if (!response.body) {
    throw new Error("OpenAI-compatible streaming response had no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let sawFirstDelta = false;
  let firstDeltaMs = null;
  const chunkParser = createChunkParser();

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
        const delta = openAIStreamDelta(llmApi, event);
        if (delta) {
          answer += delta;
          sendJson(session.client, {
            type: "assistant_xml_delta",
            turnId: turn.id,
            text: delta,
          });

          if (!sawFirstDelta) {
            sawFirstDelta = true;
            firstDeltaMs = elapsedMs(turn);
            sendTimeline(session, turn, {
              spanId: "llm-first-token",
              stage: "llm_first_delta",
              label: "First token",
              startMs: firstDeltaMs,
              endMs: firstDeltaMs,
            });
          }

          for (const chunk of chunkParser.push(delta)) {
            sendJson(session.client, {
              type: "assistant_delta",
              turnId: turn.id,
              text: `${chunk} `,
            });
            await onChunk(chunk);
          }
        } else if (event.type === "error" || event.error) {
          throw new Error(
            event.error?.message || event.message || "OpenAI-compatible stream error.",
          );
        }
      }
    }
  }

  sendJson(session.client, {
    type: "assistant_xml_text",
    turnId: turn.id,
    text: answer,
  });

  for (const chunk of chunkParser.flush()) {
    sendJson(session.client, {
      type: "assistant_delta",
      turnId: turn.id,
      text: `${chunk} `,
    });
    await onChunk(chunk);
  }

  sendTimeline(session, turn, {
    spanId: "llm-stream",
    stage: "llm_done",
    label: "OpenAI-compatible stream",
    startMs: firstDeltaMs ?? requestEndMs,
    endMs: elapsedMs(turn),
  });

  return cleanAssistantText(answer);
}

async function synthesizeSpeechAudio(
  session,
  text,
  { turn = null, chunkIndex = null } = {},
) {
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

  const directPcm = shouldStreamBrowserPcm(session.runtimeConfig);
  const sampleRate = ttsSampleRate(session.runtimeConfig);

  if (directPcm && response.body) {
    const reader = response.body.getReader();
    const pcmChunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const pcm = Buffer.from(value);
      if (pcm.length === 0) {
        continue;
      }

      pcmChunks.push(pcm);
      sendJson(session.client, {
        type: "assistant_pcm_delta",
        turnId: turn?.id,
        chunkIndex,
        sampleRate,
        pcmBase64: pcm.toString("base64"),
      });
    }

    const pcm = Buffer.concat(pcmChunks);
    return {
      audio: wavFromPcm(pcm, sampleRate),
      bytes: pcm.length,
      mimeType: "audio/wav",
      streamedPcm: true,
    };
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (directPcm) {
    sendJson(session.client, {
      type: "assistant_pcm_delta",
      turnId: turn?.id,
      chunkIndex,
      sampleRate,
      pcmBase64: audio.toString("base64"),
    });
    return {
      audio: wavFromPcm(audio, sampleRate),
      bytes: audio.byteLength,
      mimeType: "audio/wav",
      streamedPcm: true,
    };
  }

  return {
    audio,
    bytes: audio.byteLength,
    mimeType: ttsMimeType(session.runtimeConfig),
    streamedPcm: false,
  };
}

function createBrowserTtsStreamer(session, turn) {
  const items = [];
  let inputDone = false;
  let notifyPlayback = null;
  const streamPcm = shouldStreamBrowserPcm(session.runtimeConfig);

  function notify() {
    if (notifyPlayback) {
      notifyPlayback();
      notifyPlayback = null;
    }
  }

  function waitForChunk() {
    return new Promise((resolve) => {
      notifyPlayback = resolve;
    });
  }

  function synthesizeBrowserChunk(chunkIndex, text) {
    return (async () => {
      const startMs = elapsedMs(turn);
      const result = await synthesizeSpeechAudio(session, text, { turn, chunkIndex });
      sendTimeline(session, turn, {
        spanId: `tts-chunk-${chunkIndex}`,
        stage: "tts_chunk",
        label: result.streamedPcm ? `PCM chunk ${chunkIndex}` : `TTS chunk ${chunkIndex}`,
        startMs,
        endMs: elapsedMs(turn),
        bytes: result.bytes,
      });

      return { chunkIndex, text, ...result };
    })().catch((error) => ({ error }));
  }

  const playback = (async () => {
    const stats = { chunks: 0, bytes: 0 };
    let index = 0;

    while (!inputDone || index < items.length) {
      if (index >= items.length) {
        await waitForChunk();
        continue;
      }

      const item = items[index];
      const result = item.promise
        ? await item.promise
        : await synthesizeBrowserChunk(item.chunkIndex, item.text);
      if (result.error) {
        throw result.error;
      }

      if (session.client.readyState !== WebSocket.OPEN) {
        break;
      }

      sendJson(session.client, {
        type: "assistant_audio",
        turnId: turn.id,
        chunkIndex: result.chunkIndex,
        text: result.text,
        mimeType: result.mimeType,
        bytes: result.bytes,
        streamedPcm: result.streamedPcm,
        audioBase64: result.audio.toString("base64"),
      });

      stats.chunks += 1;
      stats.bytes += result.bytes;
      index += 1;
    }

    return stats;
  })().catch((error) => ({ error }));

  return {
    enqueue(text) {
      const cleanText = cleanAssistantText(text);
      if (!cleanText) {
        return false;
      }

      const chunkIndex = items.length + 1;
      const promise = streamPcm ? null : synthesizeBrowserChunk(chunkIndex, cleanText);

      items.push({ chunkIndex, text: cleanText, promise });
      notify();
      return true;
    },
    async finish() {
      inputDone = true;
      notify();
      const stats = await playback;
      if (stats.error) {
        throw stats.error;
      }
      return stats;
    },
    get queuedCount() {
      return items.length;
    },
  };
}

// PipelineRunner for browser sessions: VAD/STT has already produced a turn.
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
  const ttsStreamer = createBrowserTtsStreamer(session, turn);
  let ttsFinished = false;

  try {
    session.conversation.push({ role: "user", content: cleanTranscript });
    sendJson(session.client, {
      type: "user_final",
      turnId: turn.id,
      text: cleanTranscript,
    });
    sendTimeline(session, turn, {
      spanId: "stt-final",
      stage: "stt_final",
      label: "STT final",
      startMs: 0,
      endMs: 0,
    });

    let answer = await askOpenAIStream(session, turn, cleanTranscript, {
      onChunk: async (chunk) => {
        ttsStreamer.enqueue(chunk);
      },
    });
    if (!answer) {
      answer = "Sorry, I missed that.";
    }
    if (ttsStreamer.queuedCount === 0) {
      ttsStreamer.enqueue(answer);
    }

    session.conversation.push({ role: "assistant", content: answer });
    sendJson(session.client, { type: "assistant_text", turnId: turn.id, text: answer });

    await ttsStreamer.finish();
    ttsFinished = true;
    sendJson(session.client, { type: "assistant_end", turnId: turn.id });
  } catch (error) {
    if (!ttsFinished) {
      await ttsStreamer.finish().catch(() => {});
    }
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
  const llmApi = runtimeConfig.llm.api;
  const response = await fetchOpenAIResponse(runtimeConfig, session.conversation);

  if (!response.ok) {
    throw new Error(await openAIErrorMessage(response));
  }

  if (!stream) {
    const body = await response.json();
    const answer = openAICompletionText(llmApi, body).trim();
    if (answer) {
      await onTextDelta(answer);
    }
    return answer;
  }

  if (!response.body) {
    throw new Error("OpenAI-compatible streaming response had no body.");
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
        const delta = openAIStreamDelta(llmApi, event);
        if (delta) {
          answer += delta;
          await onTextDelta(delta);
        } else if (event.type === "error" || event.error) {
          throw new Error(
            event.error?.message || event.message || "OpenAI-compatible stream error.",
          );
        }
      }
    }
  }

  return answer.trim();
}

function sendDeviceJson(session, payload) {
  session.transport.sendJson({
    session_id: session.id,
    ...payload,
  });
}

function resetDeviceTurnAudio(session) {
  session.pendingPcm = [];
  session.finalSegments = [];
  session.turnAudioFrames = 0;
  session.turnAudioBytes = 0;
}

function closeDeviceStt(session) {
  const dg = session.deepgram;
  session.deepgram = null;
  session.sttConnecting = false;
  session.sttOpen = false;
  session.awaitingFinal = false;
  session.pendingPcm = [];

  if (dg?.readyState === WebSocket.OPEN || dg?.readyState === WebSocket.CONNECTING) {
    dg.close();
  }
}

function finalizeDeviceStt(session) {
  if (!session.deepgram) {
    session.awaitingFinal = false;
    return;
  }

  session.awaitingFinal = true;
  setDeviceState(session, "stt_finalize", "Finalizing STT.");

  if (session.deepgram.readyState === WebSocket.OPEN) {
    session.deepgram.send(JSON.stringify({ type: "Finalize" }));
  }
}

function closeDeviceAfterTurn(session, reason = "turn_complete") {
  session.listening = false;
  closeDeviceStt(session);

  if (!session.runtimeConfig.turn.closeDeviceAfterTurn || !session.transport.isOpen()) {
    setDeviceState(session, "ready", "Turn complete.");
    return;
  }

  session.closingAfterTurn = true;
  if (session.closeTimer) {
    clearTimeout(session.closeTimer);
  }

  setDeviceState(
    session,
    "closing_audio_channel",
    "Closing audio channel to return to wake-word mode.",
  );
  session.closeTimer = setTimeout(() => {
    session.transport.close(1000, reason);
  }, session.runtimeConfig.turn.closeDeviceAfterTurnDelayMs);
}

function flushPendingPcm(session, dg) {
  if (!session.pendingPcm?.length || dg.readyState !== WebSocket.OPEN) {
    return;
  }

  for (const pcm of session.pendingPcm) {
    dg.send(pcm);
  }
  session.pendingPcm = [];
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
    if (session.awaitingFinal && !session.processing && !session.closingAfterTurn) {
      console.log(`[device ${session.id}] Deepgram STT connected for finalization`);
      setDeviceState(session, "stt_finalize", "Deepgram STT connected.");
      flushPendingPcm(session, dg);
      dg.send(JSON.stringify({ type: "Finalize" }));
      return;
    }
    if (!session.listening || session.processing || session.closingAfterTurn) {
      closeDeviceStt(session);
      return;
    }
    console.log(`[device ${session.id}] Deepgram STT connected`);
    setDeviceState(session, "listening", "Deepgram STT connected.");
    flushPendingPcm(session, dg);
  });

  dg.on("message", (raw) => {
    const data = parseJson(raw);
    if (!data) {
      return;
    }

    if (data.type === "SpeechStarted") {
      setDeviceState(session, "speech_started", "Deepgram VAD detected speech.");
      return;
    }

    if (
      data.type !== "Results" ||
      session.processing ||
      (!session.listening && !session.awaitingFinal)
    ) {
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();

    if (transcript && data.is_final) {
      session.finalSegments.push(transcript);
      sendDeviceJson(session, { type: "stt", text: transcript });
      setDeviceState(session, "listening", `STT final: ${transcript}`);
    }

    if (data.speech_final) {
      const text = (session.finalSegments.join(" ") || transcript || "").trim();
      session.finalSegments = [];
      session.listening = false;
      session.awaitingFinal = false;
      closeDeviceStt(session);

      if (!text || isTranscriptTooShort(text, session.runtimeConfig)) {
        setDeviceState(
          session,
          "ignored_transcript",
          text ? `Ignored short transcript: ${text}` : "Ignored empty transcript.",
        );
        closeDeviceAfterTurn(session, "ignored_transcript");
        return;
      }

      session.pipelineRunner.runTurn(session, text).catch((error) => {
        console.error(`[device ${session.id}] turn failed: ${error.message}`);
        setDeviceState(session, "error", `Turn failed: ${error.message}`);
        sendDeviceJson(session, {
          type: "alert",
          status: "Error",
          message: error.message,
          emotion: "sad",
        });
        closeDeviceAfterTurn(session, "error");
      });
    }
  });

  dg.on("close", () => {
    session.sttConnecting = false;
    session.sttOpen = false;
    session.awaitingFinal = false;
    session.pendingPcm = [];
    if (session.deepgram === dg) {
      session.deepgram = null;
    }
    console.log(`[device ${session.id}] Deepgram STT disconnected`);
    if (!session.processing && !session.closingAfterTurn) {
      setDeviceState(session, "ready", "Deepgram STT disconnected.");
    }
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

function createDeviceTtsStreamer(session, turnStartedAt) {
  const items = [];
  let inputDone = false;
  let notifyPlayback = null;
  let started = false;
  let firstAudioSent = false;

  function notify() {
    if (notifyPlayback) {
      notifyPlayback();
      notifyPlayback = null;
    }
  }

  function waitForChunk() {
    return new Promise((resolve) => {
      notifyPlayback = resolve;
    });
  }

  const playback = (async () => {
    const stats = { chunks: 0, pcmBytes: 0, opusFrames: 0 };
    let index = 0;

    try {
      while (!inputDone || index < items.length) {
        if (index >= items.length) {
          await waitForChunk();
          continue;
        }

        const result = await items[index].promise;
        if (result.error) {
          throw result.error;
        }

        if (!session.transport.isOpen()) {
          break;
        }

        if (!started) {
          sendDeviceJson(session, { type: "llm", emotion: "happy", text: "OK" });
          sendDeviceJson(session, { type: "tts", state: "start" });
          started = true;
        }

        sendDeviceJson(session, {
          type: "tts",
          state: "sentence_start",
          text: result.text,
        });

        for (const frame of result.frames) {
          if (!session.transport.isOpen()) {
            break;
          }
          if (!firstAudioSent) {
            firstAudioSent = true;
            setDeviceState(
              session,
              "speaking",
              `First TTS audio in ${Date.now() - turnStartedAt}ms.`,
            );
          }
          session.transport.sendBinary(frame, { binary: true });
          await sleep(55);
        }

        stats.chunks += 1;
        stats.pcmBytes += result.pcmBytes;
        stats.opusFrames += result.frames.length;
        index += 1;
      }
    } finally {
      if (started && session.transport.isOpen()) {
        sendDeviceJson(session, { type: "tts", state: "stop" });
      }
    }

    return stats;
  })().catch((error) => ({ error }));

  return {
    enqueue(text) {
      const cleanText = cleanAssistantText(text);
      if (!cleanText) {
        return false;
      }

      const chunkIndex = items.length + 1;
      const promise = (async () => {
        const startedAt = Date.now();
        const pcm = await synthesizeDevicePcm(session, cleanText);
        const frames = encodePcmToOpusFrames(pcm, 24000, 60);
        setDeviceState(
          session,
          "tts_chunk_ready",
          `TTS chunk ${chunkIndex}: ${pcm.length} PCM bytes in ${Date.now() - startedAt}ms.`,
        );
        return { text: cleanText, pcmBytes: pcm.length, frames };
      })().catch((error) => ({ error }));

      items.push({ promise });
      notify();
      return true;
    },
    async finish() {
      inputDone = true;
      notify();
      const stats = await playback;
      if (stats.error) {
        throw stats.error;
      }
      return stats;
    },
    get queuedCount() {
      return items.length;
    },
  };
}

async function handleDeviceTurn(session, transcript) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript || session.processing) {
    return;
  }

  session.processing = true;
  session.listening = false;
  session.awaitingFinal = false;
  const turnStartedAt = Date.now();
  const chunkParser = createChunkParser();
  const ttsStreamer = createDeviceTtsStreamer(session, turnStartedAt);
  let ttsFinished = false;
  let closeReason = "turn_complete";
  console.log(`[device ${session.id}] user: ${cleanTranscript}`);
  setDeviceState(session, "thinking", `User: ${cleanTranscript}`);

  try {
    session.conversation.push({ role: "user", content: cleanTranscript });
    const rawAnswer = await askOpenAIDeviceResponse(session, async (delta) => {
      for (const chunk of chunkParser.push(delta)) {
        ttsStreamer.enqueue(chunk);
      }
    });

    for (const chunk of chunkParser.flush()) {
      ttsStreamer.enqueue(chunk);
    }

    let answer = cleanAssistantText(rawAnswer);
    if (!answer) {
      answer = "Sorry, I missed that.";
    }
    if (ttsStreamer.queuedCount === 0) {
      ttsStreamer.enqueue(answer);
    }

    session.conversation.push({ role: "assistant", content: answer });
    console.log(`[device ${session.id}] assistant: ${answer}`);
    setDeviceState(session, "tts_streaming", `Assistant: ${answer}`);

    const ttsStats = await ttsStreamer.finish();
    ttsFinished = true;
    setDeviceState(
      session,
      "turn_complete",
      `TTS complete: ${ttsStats.chunks} chunks, ${ttsStats.opusFrames} Opus frames.`,
    );
  } catch (error) {
    closeReason = "error";
    if (!ttsFinished) {
      await ttsStreamer.finish().catch(() => {});
    }
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
    if (session.transport.isOpen()) {
      closeDeviceAfterTurn(session, closeReason);
    }
  }
}

function startDeviceStt(session) {
  if (session.processing || session.closingAfterTurn) {
    return;
  }
  if (
    session.sttConnecting ||
    (session.deepgram &&
      (session.deepgram.readyState === WebSocket.OPEN ||
        session.deepgram.readyState === WebSocket.CONNECTING))
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
    session.deviceRecord.protocolVersion = String(
      message.version || session.deviceRecord.protocolVersion || "",
    );
    setDeviceState(session, "ready", `Protocol hello v${message.version || "unknown"}.`);
    return;
  }

  if (message.type === "listen") {
    console.log(
      `[device ${session.id}] listen ${message.state} mode=${message.mode || ""} text=${message.text || ""}`,
    );
    if (message.state === "start" || message.state === "detect") {
      if (session.processing || session.closingAfterTurn) {
        setDeviceState(
          session,
          "listen_ignored",
          "Ignored listen start while finishing previous turn.",
        );
        return;
      }
      session.listening = true;
      session.awaitingFinal = false;
      resetDeviceTurnAudio(session);
      setDeviceState(
        session,
        message.state === "detect" ? "wake_detected" : "listening",
        message.text ? `Wake detected: ${message.text}` : `Listen ${message.state}.`,
      );
      startDeviceStt(session);
    } else if (message.state === "stop") {
      session.listening = false;
      setDeviceState(session, "processing", "Listen stop.");
      finalizeDeviceStt(session);
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
  if (!session.listening || session.processing || session.closingAfterTurn) {
    return;
  }

  startDeviceStt(session);
  if (!session.decoder) {
    session.decoder = new OpusScript(16000, 1, OpusScript.Application.AUDIO);
  }

  try {
    const pcm = Buffer.from(session.decoder.decode(frame));
    session.turnAudioFrames += 1;
    session.turnAudioBytes += frame.length;

    if (!session.sttOpen || session.deepgram?.readyState !== WebSocket.OPEN) {
      session.pendingPcm.push(pcm);
      if (session.pendingPcm.length > 20) {
        session.pendingPcm.shift();
      }
      return;
    }

    session.deepgram.send(pcm);
  } catch (error) {
    console.error(`[device ${session.id}] opus decode failed: ${error.message}`);
  }
}

function configureSession(session, agent) {
  const runtimeConfig = normalizeAgentConfig(agent);

  if (!config.deepgramApiKey || !hasRequiredLlmCredentials(runtimeConfig)) {
    sendJson(session.client, {
      type: "error",
      message:
        "Missing DEEPGRAM_API_KEY or LLM API key. Create root .env from .env.example.",
    });
    return;
  }

  session.runtimeConfig = runtimeConfig;
  session.conversation = [];
  session.finalSegments = [];
  if (
    session.deepgram?.readyState === WebSocket.OPEN ||
    session.deepgram?.readyState === WebSocket.CONNECTING
  ) {
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
      openaiConfigured: Boolean(config.openaiApiKey || config.openaiBaseUrl),
      otaEndpoint: "/ota/",
      deviceWebSocketEndpoint: "/ws",
      deviceCount: deviceRegistry.size,
    });
    return;
  }

  if (url.pathname === "/devices" && req.method === "GET") {
    writeJson(res, 403, {
      error: "Runtime device inventory is managed by the platform API.",
    });
    return;
  }

  const deviceConfigMatch = url.pathname.match(/^\/devices\/([^/]+)\/config$/);
  if (deviceConfigMatch && req.method === "PUT") {
    req.resume();
    writeJson(res, 410, {
      error: "Device config binding must go through the platform API.",
    });
    return;
  }

  const deviceForgetMatch = url.pathname.match(/^\/devices\/([^/]+)$/);
  if (deviceForgetMatch && req.method === "DELETE") {
    req.resume();
    writeJson(res, 410, {
      error: "Device removal must go through the platform API.",
    });
    return;
  }

  if (url.pathname === "/ota/") {
    const device = getOrCreateDevice(
      req.headers["device-id"] || req.headers["client-id"],
      req,
    );
    readJsonBody(req)
      .then((payload) =>
        callPlatformInternal("/internal/device-activations/bootstrap", {
          ...runtimeDevicePayload(req, { systemInfo: payload }),
        }),
      )
      .then(({ body }) => {
        console.log(`[ota] ${req.method} device=${device.id} -> platform bootstrap`);
        logDeviceEvent(device, "OTA bootstrap requested.");
        writeJson(res, 200, body);
      })
      .catch((error) => {
        console.error(`[ota] bootstrap failed: ${error.message}`);
        logDeviceEvent(device, `OTA bootstrap failed: ${error.message}`);
        writeJson(res, error.statusCode || 502, {
          error: error.message || String(error),
        });
      });
    return;
  }

  if (url.pathname === "/ota/activate" || url.pathname === "/ota/activate/") {
    const device = getOrCreateDevice(
      req.headers["device-id"] || req.headers["client-id"],
      req,
    );
    readJsonBody(req)
      .then((payload) =>
        callPlatformInternal("/internal/device-activations/activate", {
          ...runtimeDevicePayload(req),
          ...(payload && typeof payload === "object" ? payload : {}),
        }),
      )
      .then(({ statusCode, body }) => {
        console.log(`[ota] activate device=${device.id} status=${statusCode}`);
        logDeviceEvent(device, `Activation poll returned ${statusCode}.`);
        writeJson(res, statusCode, body);
      })
      .catch((error) => {
        console.error(`[ota] activation failed: ${error.message}`);
        logDeviceEvent(device, `Activation failed: ${error.message}`);
        writeJson(res, error.statusCode || 502, {
          error: error.message || String(error),
        });
      });
    return;
  }

  writeJson(res, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ noServer: true });
const deviceWss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/voice") {
    const token = url.searchParams.get("voice_token") || "";

    try {
      const { body } = await callPlatformInternal(
        "/internal/runtime/voice-sessions/verify",
        {
          token,
          ipAddress: requestIp(request),
          userAgent: request.headers["user-agent"] || "",
        },
      );
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, body);
      });
    } catch {
      writeUpgradeError(socket, 401, "Voice session authentication failed");
    }
    return;
  }

  if (url.pathname === "/ws") {
    const token = bearerToken(requestAuthorization(request));

    try {
      const { body } = await callPlatformInternal("/internal/device-runtime/verify", {
        ...runtimeDevicePayload(request),
        token,
      });
      deviceWss.handleUpgrade(request, socket, head, (ws) => {
        deviceWss.emit("connection", ws, request, body);
      });
    } catch {
      writeUpgradeError(socket, 401, "Device authentication failed");
    }
    return;
  }

  socket.destroy();
});

wss.on("connection", (client, _request, auth) => {
  const session = createBrowserSession(client, auth);
  console.log(JSON.stringify(createRuntimeEvent(session, "session.connected")));

  session.transport.sendJson({
    type: "runtime_connected",
    sessionId: session.id,
    transport: session.transport.protocol,
    agentId: session.agentSnapshot?.id ?? null,
    agentName: session.agentSnapshot?.name ?? null,
  });
  configureSession(session, session.agentSnapshot);

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
      sendJson(client, {
        type: "error",
        message:
          "Runtime configuration is API-owned. Mint a new voice session to change agents.",
      });
    } else if (payload.type === "force_response") {
      session.pipelineRunner.runTurn(session, session.finalSegments.join(" "));
    } else if (payload.type === "reset") {
      session.conversation = [];
      session.finalSegments = [];
      sendJson(client, { type: "reset_done" });
    } else if (
      payload.type === "finalize" &&
      session.deepgram?.readyState === WebSocket.OPEN
    ) {
      session.deepgram.send(JSON.stringify({ type: "Finalize" }));
    }
  });

  client.on("close", () => {
    if (
      session.deepgram?.readyState === WebSocket.OPEN ||
      session.deepgram?.readyState === WebSocket.CONNECTING
    ) {
      session.deepgram.close();
    }
  });
});

deviceWss.on("connection", (ws, request, auth) => {
  if (!config.deepgramApiKey) {
    ws.close(1011, "Missing API keys");
    return;
  }

  const device = getOrCreateDevice(
    request.headers["device-id"] || request.headers["client-id"],
    request,
  );
  applyPlatformDeviceAuth(device, auth);

  if (!hasRequiredLlmCredentials(device.runtimeConfig)) {
    ws.close(1011, "Missing API keys");
    return;
  }

  const session = createDeviceSession(ws, device, request);

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

  console.log(JSON.stringify(createRuntimeEvent(session, "session.connected")));

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
    if (session.closeTimer) {
      clearTimeout(session.closeTimer);
      session.closeTimer = null;
    }
    session.listening = false;
    session.closingAfterTurn = false;
    closeDeviceStt(session);
    if (device.session === session) {
      device.session = null;
      device.availability = "offline";
      device.state = "offline";
      device.updatedAt = new Date().toISOString();
      logDeviceEvent(device, "Disconnected.");
      if (device.platformDeviceId) {
        callPlatformInternal("/internal/device-runtime/state", {
          deviceId: device.platformDeviceId,
          availability: "offline",
        }).catch((error) => {
          console.error(`[device ${session.id}] state update failed: ${error.message}`);
        });
      }
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
