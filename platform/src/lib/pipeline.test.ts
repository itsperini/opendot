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
    expect(pipeline.find((stage) => stage.id === "llm")?.model).toBe("gpt-5.4-mini");
    expect(pipeline.find((stage) => stage.id === "tts")?.model).toBe("aura-2-thalia-en");
  });

  it("updates a stage model only when the model is allowed", () => {
    const pipeline = createDefaultPipeline();

    const validUpdate = updateStageModel(pipeline, "tts", "aura-2-luna-en");
    const invalidUpdate = updateStageModel(validUpdate, "tts", "missing-voice");

    expect(validUpdate.find((stage) => stage.id === "tts")?.model).toBe("aura-2-luna-en");
    expect(invalidUpdate.find((stage) => stage.id === "tts")?.model).toBe(
      "aura-2-luna-en",
    );
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

    expect(normalizedStt?.model).toBe("nova-3");
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
