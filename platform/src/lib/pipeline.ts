import type {
  PipelineStage,
  PipelineStageId,
  StageOption,
  StageSetting,
  StageSettingValue,
  VoiceAgent,
} from "../types";

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
  { label: "GPT-5.5", value: "gpt-5.5" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-5.4 mini", value: "gpt-5.4-mini" },
  { label: "GPT-5.4 nano", value: "gpt-5.4-nano" },
];

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
  { label: "Disable endpointing", value: "false" },
];

const UTTERANCE_END_OPTIONS: StageOption[] = [
  { label: "500 ms", value: 500 },
  { label: "1000 ms", value: 1000 },
  { label: "1500 ms", value: 1500 },
  { label: "2000 ms", value: 2000 },
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
  { label: "Responses API", value: "Responses" },
];

const REASONING_EFFORT_OPTIONS: StageOption[] = [
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "X-high", value: "xhigh" },
];

const VERBOSITY_OPTIONS: StageOption[] = [
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
  { label: "Mu-law", value: "mulaw" },
  { label: "A-law", value: "alaw" },
  { label: "Opus", value: "opus" },
  { label: "FLAC", value: "flac" },
  { label: "AAC", value: "aac" },
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

function normalizeScalarValue(setting: StageSetting, value: StageSettingValue | undefined) {
  if (value === undefined) {
    return setting.value;
  }

  if (setting.control === "switch") {
    return typeof value === "boolean" ? value : setting.value;
  }

  if (setting.control === "select" && includesOption(setting.options, value)) {
    const match = setting.options?.find((option) => String(option.value) === String(value));
    return match?.value ?? setting.value;
  }

  return setting.value;
}

function normalizeMultiValue(setting: StageSetting, values: unknown) {
  const selected = Array.isArray(values) ? values.map(String) : [];
  const allowed = optionValueSet(setting.options);
  const filtered = selected.filter((value) => allowed.has(value));
  return Array.isArray(values) ? filtered : setting.value;
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

  return hasLegacySettings ? normalizeMultiValue(nextSetting, legacyValues) : nextSetting.value;
}

function normalizeSetting(defaultSetting: StageSetting, existingSettings: StageSetting[] = []) {
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

  const existing = existingSettings.find((setting) => setting.key === defaultSetting.key);
  return {
    ...defaultSetting,
    value: normalizeScalarValue(defaultSetting, existing?.value),
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
      ],
      emits: ["SpeechStarted", "UtteranceEnd", "speech_final"],
    },
    {
      id: "stt",
      label: "Speech to text",
      provider: "Deepgram",
      model: "nova-3",
      modelOptions: STT_MODEL_OPTIONS,
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
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      modelOptions: OPENAI_MODEL_OPTIONS,
      purpose: "Generate the agent response from transcript and context.",
      latencyTargetMs: 1200,
      settings: [
        {
          key: "api",
          label: "API",
          value: "Responses",
          control: "select",
          options: LLM_API_OPTIONS,
        },
        {
          key: "reasoning_effort",
          label: "Reasoning effort",
          value: "none",
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
          label: "Response features",
          value: ["stream"],
          control: "multi-select",
          options: LLM_FEATURE_OPTIONS,
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
    return {
      ...stage,
      model: allowed.has(model) ? model : stage.model,
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

function settingString(stage: PipelineStage | undefined, key: string, fallback: string | number) {
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
      const model =
        existing?.model && allowedModels.has(String(existing.model))
          ? existing.model
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
