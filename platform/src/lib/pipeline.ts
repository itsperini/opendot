import type {
  PipelineStage,
  PipelineStageId,
  StageOption,
  StageSetting,
  StageSettingValue,
  VoiceAgent,
} from "../types.js";

const VAD_MODEL_OPTIONS: StageOption[] = [
  { label: "Deepgram Endpointing", value: "endpointing-vad" },
  { label: "Deepgram Utterance End", value: "utterance-end" },
];

const STT_MODEL_OPTIONS: StageOption[] = [
  { label: "Nova-3", value: "nova-3" },
  { label: "Nova-3 General", value: "nova-3-general" },
  { label: "Nova-2", value: "nova-2" },
  { label: "Nova-2 General", value: "nova-2-general" },
  { label: "Nova-2 Conversational AI", value: "nova-2-conversationalai" },
  { label: "Nova-2 Phone Call", value: "nova-2-phonecall" },
];

const OPENAI_MODEL_OPTIONS: StageOption[] = [
  { label: "GPT-5.1", value: "gpt-5.1" },
  { label: "GPT-5.1 Chat latest", value: "gpt-5.1-chat-latest" },
  { label: "GPT-5", value: "gpt-5" },
  { label: "GPT-5 mini", value: "gpt-5-mini" },
  { label: "GPT-5 nano", value: "gpt-5-nano" },
  { label: "GPT-5 pro", value: "gpt-5-pro" },
  { label: "GPT-4.1", value: "gpt-4.1" },
  { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
  { label: "GPT-4.1 nano", value: "gpt-4.1-nano" },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are a concise voice assistant. Start with the direct answer and reply in one or two short spoken sentences unless asked for detail.";

const LEGACY_DEFAULT_SYSTEM_PROMPT =
  "You are a concise voice assistant. Answer naturally in one or two short spoken paragraphs.";

const DEFAULT_CHUNK_PROMPT = [
  "For voice output, format every assistant reply as XML-like TTS chunks.",
  "Use only this format: <chunk>first spoken chunk</chunk><chunk>next spoken chunk</chunk>.",
  "Do not write any text outside <chunk> tags.",
  "Close the first chunk after 6-12 spoken words, then close each later chunk as soon as a natural phrase or short sentence is complete.",
  "Use plain spoken language. Avoid markdown, bullets, code fences, tables, emojis, and XML special characters.",
].join("\n");

const LEGACY_DEFAULT_CHUNK_PROMPT = [
  "For voice output, format every assistant reply as XML-like TTS chunks.",
  "Use only this format: <chunk>first spoken chunk</chunk><chunk>next spoken chunk</chunk>.",
  "Do not write any text outside <chunk> tags.",
  "Close each chunk as soon as a natural phrase or short sentence is complete so TTS can start immediately.",
  "Use plain spoken language. Avoid markdown, bullets, code fences, tables, emojis, and XML special characters.",
].join("\n");

const DEFAULT_SYSTEM_AND_CHUNK_PROMPT = `${DEFAULT_SYSTEM_PROMPT}\n\n${DEFAULT_CHUNK_PROMPT}`;
const LEGACY_DEFAULT_SYSTEM_AND_CHUNK_PROMPT = `${LEGACY_DEFAULT_SYSTEM_PROMPT}\n\n${LEGACY_DEFAULT_CHUNK_PROMPT}`;

const TTS_MODEL_OPTIONS: StageOption[] = [
  { label: "Aura-2 Thalia", value: "aura-2-thalia-en" },
  { label: "Aura-2 Asteria", value: "aura-2-asteria-en" },
  { label: "Aura-2 Luna", value: "aura-2-luna-en" },
  { label: "Aura-2 Athena", value: "aura-2-athena-en" },
  { label: "Aura-2 Hera", value: "aura-2-hera-en" },
  { label: "Aura-2 Orion", value: "aura-2-orion-en" },
  { label: "Aura-2 Arcas", value: "aura-2-arcas-en" },
  { label: "Aura-2 Perseus", value: "aura-2-perseus-en" },
];

const ENDPOINTING_OPTIONS: StageOption[] = [
  { label: "Fast chatbot pause - 100 ms", value: 100 },
  { label: "Balanced conversation - 300 ms", value: 300 },
  { label: "Thoughtful pause - 500 ms", value: 500 },
  { label: "Long pause - 750 ms", value: 750 },
  { label: "Safer device pause - 900 ms", value: 900 },
  { label: "Disable endpointing", value: "false" },
];

const UTTERANCE_END_OPTIONS: StageOption[] = [
  { label: "500 ms", value: 500 },
  { label: "1000 ms", value: 1000 },
  { label: "1500 ms", value: 1500 },
  { label: "2000 ms", value: 2000 },
];

const MIN_TRANSCRIPT_CHAR_OPTIONS: StageOption[] = [
  { label: "Very sensitive - 1 char", value: 1 },
  { label: "Balanced guard - 2 chars", value: 2 },
  { label: "Ignore tiny noises - 4 chars", value: 4 },
  { label: "Strict wake turn - 8 chars", value: 8 },
];

const DEVICE_CLOSE_DELAY_OPTIONS: StageOption[] = [
  { label: "150 ms", value: 150 },
  { label: "300 ms", value: 300 },
  { label: "600 ms", value: 600 },
  { label: "1000 ms", value: 1000 },
];

const VAD_EVENT_OPTIONS: StageOption[] = [
  { label: "Speech started events", value: "vad_events" },
  { label: "Interim transcripts", value: "interim_results" },
  { label: "speech_final turn close", value: "speech_final" },
];

const LANGUAGE_OPTIONS: StageOption[] = [
  { label: "English (US)", value: "en-US" },
  { label: "English", value: "en" },
  { label: "Multilingual", value: "multi" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Italian", value: "it" },
  { label: "Portuguese (Brazil)", value: "pt-BR" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Mandarin Chinese", value: "zh" },
];

const STT_ENCODING_OPTIONS: StageOption[] = [
  { label: "Linear16 PCM", value: "linear16" },
  { label: "Mu-law", value: "mulaw" },
  { label: "A-law", value: "alaw" },
  { label: "Opus", value: "opus" },
  { label: "Ogg Opus", value: "ogg-opus" },
  { label: "FLAC", value: "flac" },
];

const SAMPLE_RATE_OPTIONS: StageOption[] = [
  { label: "8 kHz", value: 8000 },
  { label: "16 kHz", value: 16000 },
  { label: "24 kHz", value: 24000 },
  { label: "48 kHz", value: 48000 },
];

const STT_FEATURE_OPTIONS: StageOption[] = [
  { label: "Smart formatting", value: "smart_format" },
  { label: "Punctuation", value: "punctuate" },
  { label: "Numerals", value: "numerals" },
];

const LLM_API_OPTIONS: StageOption[] = [
  { label: "Responses (recommended)", value: "responses" },
  { label: "Chat Completions", value: "chat_completions" },
];

function normalizeLlmApiValue(value: StageSettingValue | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["chat", "chat-completions", "chat_completions"].includes(normalized)) {
    return "chat_completions";
  }
  return normalized === "responses" ? "responses" : undefined;
}

const REASONING_EFFORT_OPTIONS: StageOption[] = [
  { label: "Default", value: "default" },
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "X-high", value: "xhigh" },
];

const VERBOSITY_OPTIONS: StageOption[] = [
  { label: "Default", value: "default" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const LLM_FEATURE_OPTIONS: StageOption[] = [
  { label: "Stream response deltas", value: "stream" },
];

const TTS_ENCODING_OPTIONS: StageOption[] = [
  { label: "MP3", value: "mp3" },
  { label: "Linear16 PCM", value: "linear16" },
  { label: "Opus (Ogg)", value: "opus" },
  { label: "FLAC", value: "flac" },
  { label: "AAC", value: "aac" },
];

const TTS_DELIVERY_OPTIONS: StageOption[] = [
  { label: "Chunked audio files", value: "chunked_file" },
  { label: "Direct PCM stream (Linear16 only)", value: "pcm_stream" },
];

const TTS_CHUNK_STYLE_OPTIONS: StageOption[] = [
  { label: "Fast phrases", value: "fast" },
  { label: "Balanced sentences", value: "balanced" },
  { label: "Relaxed paragraphs", value: "relaxed" },
];

function optionValueSet(options: StageOption[] = []) {
  return new Set(options.map((option) => String(option.value)));
}

function includesOption(options: StageOption[] | undefined, value: StageSettingValue) {
  if (!options || Array.isArray(value) || typeof value === "boolean") {
    return false;
  }
  return optionValueSet(options).has(String(value));
}

function normalizeScalarValue(
  setting: StageSetting,
  value: StageSettingValue | undefined,
) {
  if (value === undefined) {
    return setting.value;
  }

  if (setting.control === "switch") {
    return typeof value === "boolean" ? value : setting.value;
  }

  if (setting.control === "select" && includesOption(setting.options, value)) {
    const match = setting.options?.find(
      (option) => String(option.value) === String(value),
    );
    return match?.value ?? setting.value;
  }

  if (setting.control === "textarea") {
    return typeof value === "string" ? value : setting.value;
  }

  if (setting.control === "text") {
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : setting.value;
  }

  if (setting.control === "number") {
    const numericValue =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

    return Number.isFinite(numericValue) ? numericValue : setting.value;
  }

  if (setting.control === "key-value-list") {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return setting.value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key.trim(), String(entryValue)] as const)
        .filter(([key]) => key.length > 0),
    );
  }

  return setting.value;
}

function normalizeMultiValue(setting: StageSetting, values: unknown) {
  const selected = Array.isArray(values) ? values.map(String) : [];
  const allowed = optionValueSet(setting.options);
  const filtered = selected.filter((value) => allowed.has(value));
  return Array.isArray(values) ? filtered : setting.value;
}

function normalizeMultiTextValue(setting: StageSetting, values: unknown) {
  const selected = Array.isArray(values)
    ? values.map(String)
    : typeof values === "string"
      ? values.split(/\r?\n|,/)
      : [];
  const uniqueValues = Array.from(
    new Set(selected.map((value) => value.trim()).filter(Boolean)),
  );

  return uniqueValues.slice(0, setting.maxItems ?? uniqueValues.length);
}

function deriveFeatureList(
  existingSettings: StageSetting[] | undefined,
  nextSetting: StageSetting,
  legacyKeys: string[],
) {
  const current = existingSettings?.find((item) => item.key === nextSetting.key)?.value;
  if (Array.isArray(current)) {
    return normalizeMultiValue(nextSetting, current);
  }

  const hasLegacySettings = legacyKeys.some((legacyKey) =>
    existingSettings?.some((item) => item.key === legacyKey),
  );
  const legacyValues = legacyKeys.filter(
    (legacyKey) =>
      existingSettings?.find((item) => item.key === legacyKey)?.value === true,
  );

  return hasLegacySettings
    ? normalizeMultiValue(nextSetting, legacyValues)
    : nextSetting.value;
}

function balancedLegacySettingValue(
  defaultSetting: StageSetting,
  existingValue: StageSettingValue | undefined,
) {
  if (existingValue === undefined) {
    return undefined;
  }

  if (
    defaultSetting.key === "endpointing" &&
    String(existingValue) === "900"
  ) {
    return defaultSetting.value;
  }

  if (
    defaultSetting.key === "max_output_tokens" &&
    ["", "160"].includes(String(existingValue).trim())
  ) {
    return defaultSetting.value;
  }

  if (
    (defaultSetting.key === "reasoning_effort" ||
      defaultSetting.key === "verbosity") &&
    String(existingValue) === "default"
  ) {
    return defaultSetting.value;
  }

  return existingValue;
}

function normalizeSetting(
  defaultSetting: StageSetting,
  existingSettings: StageSetting[] = [],
) {
  if (defaultSetting.key === "api") {
    const existing = existingSettings.find(
      (setting) => setting.key === defaultSetting.key,
    );

    return {
      ...defaultSetting,
      value: normalizeLlmApiValue(existing?.value) ?? defaultSetting.value,
    };
  }

  if (defaultSetting.key === "system_prompt") {
    const existing = existingSettings.find(
      (setting) => setting.key === defaultSetting.key,
    );
    const value = typeof existing?.value === "string" ? existing.value.trim() : "";
    if (
      value === LEGACY_DEFAULT_SYSTEM_PROMPT ||
      value === LEGACY_DEFAULT_SYSTEM_AND_CHUNK_PROMPT
    ) {
      return {
        ...defaultSetting,
        value: defaultSetting.value,
      };
    }

    const upgradedValue =
      value && !value.toLowerCase().includes("<chunk")
        ? `${value}\n\n${DEFAULT_CHUNK_PROMPT}`
        : value;

    return {
      ...defaultSetting,
      value: upgradedValue || defaultSetting.value,
    };
  }

  if (defaultSetting.control === "multi-select") {
    if (defaultSetting.key === "features") {
      return {
        ...defaultSetting,
        value: deriveFeatureList(existingSettings, defaultSetting, [
          "vad_events",
          "interim_results",
          "speech_final",
        ]),
      };
    }

    if (defaultSetting.key === "stt_features") {
      return {
        ...defaultSetting,
        value: deriveFeatureList(existingSettings, defaultSetting, [
          "smart_format",
          "punctuate",
          "numerals",
        ]),
      };
    }

    if (defaultSetting.key === "response_features") {
      return {
        ...defaultSetting,
        value: deriveFeatureList(existingSettings, defaultSetting, ["stream"]),
      };
    }
  }

  if (defaultSetting.control === "multi-text") {
    const existing = existingSettings.find(
      (setting) => setting.key === defaultSetting.key,
    );

    return {
      ...defaultSetting,
      value: normalizeMultiTextValue(defaultSetting, existing?.value),
    };
  }

  const existing = existingSettings.find((setting) => setting.key === defaultSetting.key);
  return {
    ...defaultSetting,
    value: normalizeScalarValue(
      defaultSetting,
      balancedLegacySettingValue(defaultSetting, existing?.value),
    ),
  };
}

export function createDefaultPipeline(): PipelineStage[] {
  return [
    {
      id: "vad",
      label: "Voice activity",
      provider: "Deepgram",
      model: "endpointing-vad",
      modelOptions: VAD_MODEL_OPTIONS,
      purpose: "Detect speech boundaries before a turn is committed.",
      latencyTargetMs: 300,
      settings: [
        {
          key: "endpointing",
          label: "Endpointing",
          value: 300,
          unit: "ms",
          control: "select",
          options: ENDPOINTING_OPTIONS,
        },
        {
          key: "utterance_end_ms",
          label: "Utterance end",
          value: 1000,
          unit: "ms",
          control: "select",
          options: UTTERANCE_END_OPTIONS,
        },
        {
          key: "features",
          label: "Turn events",
          value: ["vad_events", "interim_results", "speech_final"],
          control: "multi-select",
          options: VAD_EVENT_OPTIONS,
        },
        {
          key: "min_transcript_chars",
          label: "Noise floor",
          value: 2,
          control: "select",
          options: MIN_TRANSCRIPT_CHAR_OPTIONS,
        },
        {
          key: "close_device_after_turn",
          label: "Return device to wake word",
          value: true,
          control: "switch",
        },
        {
          key: "close_device_after_turn_delay_ms",
          label: "Device close delay",
          value: 300,
          unit: "ms",
          control: "select",
          options: DEVICE_CLOSE_DELAY_OPTIONS,
        },
      ],
      emits: ["SpeechStarted", "UtteranceEnd", "speech_final"],
    },
    {
      id: "stt",
      label: "Speech to text",
      provider: "Deepgram",
      model: "nova-3",
      modelOptions: STT_MODEL_OPTIONS,
      allowCustomModel: true,
      purpose: "Stream live user audio into partial and final transcripts.",
      latencyTargetMs: 650,
      settings: [
        {
          key: "language",
          label: "Language",
          value: "en-US",
          control: "select",
          options: LANGUAGE_OPTIONS,
        },
        {
          key: "encoding",
          label: "Encoding",
          value: "linear16",
          control: "select",
          options: STT_ENCODING_OPTIONS,
        },
        {
          key: "sample_rate",
          label: "Sample rate",
          value: 16000,
          unit: "Hz",
          control: "select",
          options: SAMPLE_RATE_OPTIONS,
        },
        {
          key: "stt_features",
          label: "Transcript options",
          value: ["smart_format"],
          control: "multi-select",
          options: STT_FEATURE_OPTIONS,
        },
      ],
      emits: ["stt_interim", "stt_final"],
    },
    {
      id: "llm",
      label: "Language model",
      provider: "OpenAI Compatible Endpoint",
      model: "gpt-5-mini",
      modelOptions: OPENAI_MODEL_OPTIONS,
      allowCustomModel: true,
      purpose: "Generate the agent response from transcript and context.",
      latencyTargetMs: 1200,
      settings: [
        {
          key: "system_prompt",
          label: "System prompt and chunk rules",
          value: DEFAULT_SYSTEM_AND_CHUNK_PROMPT,
          control: "textarea",
        },
        {
          key: "api",
          label: "Provider API",
          value: "responses",
          control: "select",
          options: LLM_API_OPTIONS,
        },
        {
          key: "api_key_name",
          label: "API key name",
          value: "OPENAI_API_KEY",
          control: "text",
          placeholder: "OPENAI_API_KEY",
        },
        {
          key: "base_url",
          label: "Base URL",
          value: "",
          control: "text",
          placeholder: "https://api.openai.com/v1",
        },
        {
          key: "temperature",
          label: "Temperature",
          value: 1,
          control: "number",
          min: 0,
          max: 2,
          step: 0.1,
        },
        {
          key: "max_output_tokens",
          label: "Max output tokens",
          value: "512",
          control: "text",
          placeholder: "e.g. 1024",
        },
        {
          key: "reasoning_effort",
          label: "Reasoning effort",
          value: "low",
          control: "select",
          options: REASONING_EFFORT_OPTIONS,
        },
        {
          key: "verbosity",
          label: "Verbosity",
          value: "low",
          control: "select",
          options: VERBOSITY_OPTIONS,
        },
        {
          key: "response_features",
          label: "Options",
          value: ["stream"],
          control: "multi-select",
          options: LLM_FEATURE_OPTIONS,
        },
        {
          key: "stop_sequences",
          label: "Stop sequences",
          value: [],
          control: "multi-text",
          maxItems: 4,
          placeholder: "Type and press Enter...",
        },
        {
          key: "seed",
          label: "Seed",
          value: "",
          control: "text",
          placeholder: "e.g. 42",
        },
        {
          key: "json_mode",
          label: "JSON mode",
          value: false,
          control: "switch",
        },
        {
          key: "extra_headers",
          label: "Extra headers",
          value: {},
          control: "key-value-list",
        },
        {
          key: "timeout_s",
          label: "Timeout",
          value: 70,
          unit: "s",
          control: "number",
          min: 1,
          max: 600,
          step: 1,
        },
        {
          key: "max_retries",
          label: "Max retries",
          value: 2,
          control: "number",
          min: 0,
          max: 10,
          step: 1,
        },
        {
          key: "requests_per_second",
          label: "Requests per second",
          value: 50,
          control: "number",
          min: 0.1,
          max: 1000,
          step: 0.1,
        },
        {
          key: "extra_parameters",
          label: "Extra parameters",
          value: "{}",
          control: "textarea",
        },
      ],
      emits: ["llm_delta", "llm_done"],
    },
    {
      id: "tts",
      label: "Text to speech",
      provider: "Deepgram",
      model: "aura-2-thalia-en",
      modelOptions: TTS_MODEL_OPTIONS,
      allowCustomModel: true,
      purpose: "Render the assistant response as spoken audio.",
      latencyTargetMs: 900,
      settings: [
        {
          key: "encoding",
          label: "Encoding",
          value: "mp3",
          control: "select",
          options: TTS_ENCODING_OPTIONS,
        },
        {
          key: "sample_rate",
          label: "Sample rate",
          value: 24000,
          unit: "Hz",
          control: "select",
          options: SAMPLE_RATE_OPTIONS,
        },
        {
          key: "delivery",
          label: "Browser delivery",
          value: "chunked_file",
          control: "select",
          options: TTS_DELIVERY_OPTIONS,
        },
        {
          key: "chunk_style",
          label: "Chunk style",
          value: "fast",
          control: "select",
          options: TTS_CHUNK_STYLE_OPTIONS,
        },
      ],
      emits: ["tts_started", "tts_done"],
    },
  ];
}

export function updateStageModel(
  pipeline: PipelineStage[],
  stageId: PipelineStageId,
  model: string,
) {
  return pipeline.map((stage) => {
    if (stage.id !== stageId) {
      return stage;
    }

    const allowed = optionValueSet(stage.modelOptions);
    const trimmedModel = model.trim();

    if (stage.allowCustomModel) {
      return {
        ...stage,
        model,
      };
    }

    return {
      ...stage,
      model: allowed.has(trimmedModel) ? trimmedModel : stage.model,
    };
  });
}

export function updateStageSetting(
  pipeline: PipelineStage[],
  stageId: PipelineStageId,
  settingKey: string,
  value: StageSettingValue,
) {
  return pipeline.map((stage) => {
    if (stage.id !== stageId) {
      return stage;
    }

    return {
      ...stage,
      settings: stage.settings.map((setting) =>
        setting.key === settingKey ? { ...setting, value } : setting,
      ),
    };
  });
}

export function getSetting(stage: PipelineStage, key: string) {
  return stage.settings.find((setting) => setting.key === key)?.value;
}

function selectedValues(stage: PipelineStage | undefined, key: string) {
  const value = stage ? getSetting(stage, key) : undefined;
  return Array.isArray(value) ? value.map(String) : undefined;
}

function selectedFeature(
  stage: PipelineStage | undefined,
  featureKey: string,
  fallback: boolean,
  settingKey = "features",
) {
  const values = selectedValues(stage, settingKey);
  if (values) {
    return values.includes(featureKey);
  }

  const legacyValue = stage ? getSetting(stage, featureKey) : undefined;
  return typeof legacyValue === "boolean" ? legacyValue : fallback;
}

function settingString(
  stage: PipelineStage | undefined,
  key: string,
  fallback: string | number,
) {
  const value = stage ? getSetting(stage, key) : undefined;
  return String(value ?? fallback);
}

export function deepgramListenParams(pipeline: PipelineStage[]) {
  const vad = pipeline.find((stage) => stage.id === "vad");
  const stt = pipeline.find((stage) => stage.id === "stt");
  const params: Record<string, string> = {
    model: stt?.model ?? "nova-3",
    language: settingString(stt, "language", "en-US"),
    smart_format: String(selectedFeature(stt, "smart_format", true, "stt_features")),
    interim_results: String(selectedFeature(vad, "interim_results", true)),
    vad_events: String(selectedFeature(vad, "vad_events", true)),
    endpointing: settingString(vad, "endpointing", 300),
    utterance_end_ms: settingString(vad, "utterance_end_ms", 1000),
    encoding: settingString(stt, "encoding", "linear16"),
    sample_rate: settingString(stt, "sample_rate", 16000),
    channels: "1",
  };

  if (selectedFeature(stt, "punctuate", false, "stt_features")) {
    params.punctuate = "true";
  }

  if (selectedFeature(stt, "numerals", false, "stt_features")) {
    params.numerals = "true";
  }

  return params;
}

export function normalizeVoiceAgent(agent: VoiceAgent): VoiceAgent {
  const defaults = createDefaultPipeline();

  return {
    ...agent,
    pipeline: defaults.map((defaultStage) => {
      const existing = agent.pipeline?.find((stage) => stage.id === defaultStage.id);
      const allowedModels = optionValueSet(defaultStage.modelOptions);
      const existingModel =
        typeof existing?.model === "string"
          ? existing.model
          : String(existing?.model ?? "");
      const model = defaultStage.allowCustomModel
        ? existingModel || defaultStage.model
        : existingModel && allowedModels.has(existingModel)
          ? existingModel
          : defaultStage.model;

      return {
        ...defaultStage,
        model,
        settings: defaultStage.settings.map((setting) =>
          normalizeSetting(setting, existing?.settings),
        ),
      };
    }),
  };
}
