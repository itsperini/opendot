const defaultRealtimeInstructions =
  "You are a concise voice assistant for OpenDot. Speak naturally, keep answers short, and ask one clear follow-up only when it helps the user move forward.";

const realtimeModels = new Set(["gpt-realtime-2", "gpt-realtime-mini"]);
const realtimeVoices = new Set([
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
]);
const realtimeReasoningEfforts = new Set(["low", "medium", "high"]);
const realtimeTurnTypes = new Set(["semantic_vad", "server_vad"]);
const realtimeEagerness = new Set(["auto", "low", "medium", "high"]);

function stringSetValue(value, allowed, fallback) {
  const candidate = String(value || "").trim();
  return allowed.has(candidate) ? candidate : fallback;
}

function booleanConfigValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function boundedConfigNumber(value, fallback, min, max) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(Math.max(numericValue, min), max)
    : fallback;
}

export function normalizeRealtimeConfig(value = null) {
  const input = value && !Array.isArray(value) && typeof value === "object" ? value : {};
  const turnInput =
    input.turnDetection &&
    !Array.isArray(input.turnDetection) &&
    typeof input.turnDetection === "object"
      ? input.turnDetection
      : {};

  return {
    provider: "openai",
    model: stringSetValue(input.model, realtimeModels, "gpt-realtime-2"),
    voice: stringSetValue(input.voice, realtimeVoices, "marin"),
    instructions:
      typeof input.instructions === "string" && input.instructions.trim()
        ? input.instructions.trim()
        : defaultRealtimeInstructions,
    reasoningEffort: stringSetValue(
      input.reasoningEffort,
      realtimeReasoningEfforts,
      "low",
    ),
    turnDetection: {
      type: stringSetValue(turnInput.type, realtimeTurnTypes, "semantic_vad"),
      eagerness: stringSetValue(turnInput.eagerness, realtimeEagerness, "auto"),
      threshold: boundedConfigNumber(turnInput.threshold, 0.5, 0, 1),
      prefixPaddingMs: boundedConfigNumber(turnInput.prefixPaddingMs, 300, 0, 2000),
      silenceDurationMs: boundedConfigNumber(turnInput.silenceDurationMs, 500, 100, 4000),
      createResponse: booleanConfigValue(turnInput.createResponse, true),
      interruptResponse: booleanConfigValue(turnInput.interruptResponse, true),
    },
  };
}

export function realtimeInstructions(agent, realtime) {
  return [
    realtime.instructions,
    `Agent name: ${agent?.name || agent?.agentName || "Untitled agent"}.`,
    agent?.description ? `Agent description: ${agent.description}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function realtimeTurnDetectionPayload(realtime) {
  const turn = realtime.turnDetection;
  if (turn.type === "server_vad") {
    return {
      type: "server_vad",
      threshold: turn.threshold,
      prefix_padding_ms: turn.prefixPaddingMs,
      silence_duration_ms: turn.silenceDurationMs,
      create_response: turn.createResponse,
      interrupt_response: turn.interruptResponse,
    };
  }

  return {
    type: "semantic_vad",
    eagerness: turn.eagerness,
    create_response: turn.createResponse,
    interrupt_response: turn.interruptResponse,
  };
}

export function openAIRealtimeSessionConfig(agent, options = {}) {
  const includeModel = options.includeModel !== false;
  const realtime = normalizeRealtimeConfig(agent?.realtime);
  const session = {
    type: "realtime",
    instructions: realtimeInstructions(agent, realtime),
    output_modalities: ["audio"],
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        turn_detection: realtimeTurnDetectionPayload(realtime),
      },
      output: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        voice: realtime.voice,
      },
    },
  };

  if (includeModel) {
    session.model = realtime.model;
  }

  if (realtime.model === "gpt-realtime-2") {
    session.reasoning = { effort: realtime.reasoningEffort };
  }

  return session;
}

export function openAIRealtimeClientSecretPayload(agent) {
  return { session: openAIRealtimeSessionConfig(agent) };
}
