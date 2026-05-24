import { describe, expect, it } from "vitest";
import type { StageSetting, VoiceAgent } from "../types.js";
import {
  createDefaultPipeline,
  deepgramListenParams,
  normalizeVoiceAgent,
  updateStageModel,
  updateStageSetting,
} from "./pipeline.js";

describe("pipeline helpers", () => {
  it("creates the default VAD, STT, LLM, and TTS pipeline", () => {
    const pipeline = createDefaultPipeline();

    expect(pipeline.map((stage) => stage.id)).toEqual(["vad", "stt", "llm", "tts"]);
    expect(pipeline.find((stage) => stage.id === "vad")?.model).toBe("endpointing-vad");
    expect(pipeline.find((stage) => stage.id === "stt")?.model).toBe("nova-3");
    expect(pipeline.find((stage) => stage.id === "llm")?.model).toBe("gpt-5-mini");
    expect(pipeline.find((stage) => stage.id === "tts")?.model).toBe("aura-2-thalia-en");
    expect(pipeline.find((stage) => stage.id === "vad")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "endpointing", value: 300 }),
        expect.objectContaining({ key: "utterance_end_ms", value: 1000 }),
      ]),
    );
    expect(pipeline.find((stage) => stage.id === "llm")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "max_output_tokens", value: "512" }),
        expect.objectContaining({ key: "reasoning_effort", value: "low" }),
        expect.objectContaining({ key: "verbosity", value: "low" }),
      ]),
    );
  });

  it("keeps fixed VAD models constrained to known options", () => {
    const pipeline = createDefaultPipeline();

    const validUpdate = updateStageModel(pipeline, "vad", "utterance-end");
    const invalidUpdate = updateStageModel(validUpdate, "vad", "missing-vad");

    expect(validUpdate.find((stage) => stage.id === "vad")?.model).toBe("utterance-end");
    expect(invalidUpdate.find((stage) => stage.id === "vad")?.model).toBe(
      "utterance-end",
    );
  });

  it("allows custom STT, LLM, and TTS model names", () => {
    let pipeline = createDefaultPipeline();

    pipeline = updateStageModel(pipeline, "stt", "custom-stt-live");
    pipeline = updateStageModel(pipeline, "llm", "vendor/gpt-voice");
    pipeline = updateStageModel(pipeline, "tts", "custom-voice");

    expect(pipeline.find((stage) => stage.id === "stt")?.model).toBe("custom-stt-live");
    expect(pipeline.find((stage) => stage.id === "llm")?.model).toBe("vendor/gpt-voice");
    expect(pipeline.find((stage) => stage.id === "tts")?.model).toBe("custom-voice");
  });

  it("keeps Chat Completions selected when normalizing LLM settings", () => {
    let pipeline = createDefaultPipeline();
    pipeline = updateStageSetting(pipeline, "llm", "api", "chat_completions");

    const agent: VoiceAgent = {
      id: "agent-1",
      name: "Test Agent",
      description: "Uses chat completions",
      status: "draft",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z",
      pipeline,
    };

    const apiSetting = normalizeVoiceAgent(agent)
      .pipeline.find((stage) => stage.id === "llm")
      ?.settings.find((setting) => setting.key === "api");

    expect(apiSetting?.value).toBe("chat_completions");
  });

  it("derives Deepgram listen parameters from VAD and STT settings", () => {
    let pipeline = createDefaultPipeline();
    pipeline = updateStageSetting(pipeline, "vad", "endpointing", 500);
    pipeline = updateStageSetting(pipeline, "vad", "features", ["vad_events"]);
    pipeline = updateStageSetting(pipeline, "stt", "language", "it");
    pipeline = updateStageSetting(pipeline, "stt", "stt_features", [
      "smart_format",
      "punctuate",
      "numerals",
    ]);

    expect(deepgramListenParams(pipeline)).toMatchObject({
      model: "nova-3",
      language: "it",
      endpointing: "500",
      interim_results: "false",
      vad_events: "true",
      smart_format: "true",
      punctuate: "true",
      numerals: "true",
      channels: "1",
    });
  });

  it("upgrades persisted old latency defaults when normalizing agents", () => {
    let pipeline = createDefaultPipeline();
    pipeline = updateStageSetting(pipeline, "vad", "endpointing", 900);
    pipeline = updateStageSetting(pipeline, "vad", "utterance_end_ms", 1000);
    pipeline = updateStageSetting(pipeline, "llm", "system_prompt", [
      "You are a concise voice assistant. Answer naturally in one or two short spoken paragraphs.",
      "",
      "For voice output, format every assistant reply as XML-like TTS chunks.",
      "Use only this format: <chunk>first spoken chunk</chunk><chunk>next spoken chunk</chunk>.",
      "Do not write any text outside <chunk> tags.",
      "Close each chunk as soon as a natural phrase or short sentence is complete so TTS can start immediately.",
      "Use plain spoken language. Avoid markdown, bullets, code fences, tables, emojis, and XML special characters.",
    ].join("\n"));
    pipeline = updateStageSetting(pipeline, "llm", "max_output_tokens", "");
    pipeline = updateStageSetting(pipeline, "llm", "reasoning_effort", "default");
    pipeline = updateStageSetting(pipeline, "llm", "verbosity", "default");

    const normalized = normalizeVoiceAgent({
      id: "agent-1",
      name: "Test Agent",
      description: "Persisted old defaults",
      status: "draft",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z",
      pipeline,
    });
    const vadSettings = normalized.pipeline.find((stage) => stage.id === "vad")
      ?.settings;
    const llmSettings = normalized.pipeline.find((stage) => stage.id === "llm")
      ?.settings;

    expect(vadSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "endpointing", value: 300 }),
        expect.objectContaining({ key: "utterance_end_ms", value: 1000 }),
      ]),
    );
    expect(llmSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "max_output_tokens", value: "512" }),
        expect.objectContaining({ key: "reasoning_effort", value: "low" }),
        expect.objectContaining({ key: "verbosity", value: "low" }),
      ]),
    );
    expect(
      llmSettings?.find((setting) => setting.key === "system_prompt")?.value,
    ).toContain("Start with the direct answer");
  });

  it("normalizes legacy agents and upgrades plain system prompts with chunk rules", () => {
    const legacyPipeline = createDefaultPipeline();
    const vad = legacyPipeline.find((stage) => stage.id === "vad");
    const stt = legacyPipeline.find((stage) => stage.id === "stt");
    const llm = legacyPipeline.find((stage) => stage.id === "llm");

    if (!vad || !stt || !llm) {
      throw new Error("Expected default pipeline stages");
    }

    vad.settings = [
      legacySwitch("vad_events", false),
      legacySwitch("interim_results", true),
      legacySwitch("speech_final", true),
    ];
    stt.model = "old-model";
    llm.settings = [
      {
        key: "system_prompt",
        label: "System prompt",
        value: "Be concise.",
        control: "textarea",
      },
    ];

    const agent: VoiceAgent = {
      id: "agent-1",
      name: "Test Agent",
      description: "Legacy draft",
      status: "draft",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z",
      pipeline: legacyPipeline,
    };

    const normalized = normalizeVoiceAgent(agent);
    const normalizedVad = normalized.pipeline.find((stage) => stage.id === "vad");
    const normalizedStt = normalized.pipeline.find((stage) => stage.id === "stt");
    const normalizedPrompt = normalized.pipeline
      .find((stage) => stage.id === "llm")
      ?.settings.find((setting) => setting.key === "system_prompt")?.value;

    expect(normalizedStt?.model).toBe("old-model");
    expect(
      normalizedVad?.settings.find((setting) => setting.key === "features")?.value,
    ).toEqual(["interim_results", "speech_final"]);
    expect(normalizedPrompt).toContain("Be concise.");
    expect(normalizedPrompt).toContain("<chunk>");
  });
});

function legacySwitch(key: string, value: boolean): StageSetting {
  return {
    key,
    label: key,
    value,
    control: "switch",
  };
}
