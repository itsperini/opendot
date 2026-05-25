import { AudioLines, Layers3, RadioTower } from "lucide-react";
import { PipelineBuilder } from "../components/PipelineBuilder";
import { PageHeader } from "../layout/PageHeader";
import {
  REALTIME_EAGERNESS_OPTIONS,
  REALTIME_MODEL_OPTIONS,
  REALTIME_REASONING_EFFORT_OPTIONS,
  REALTIME_TURN_DETECTION_OPTIONS,
  REALTIME_VOICE_OPTIONS,
  createDefaultRealtimeConfig,
} from "../lib/pipeline";
import type {
  PipelineStage,
  RealtimeReasoningEffort,
  RealtimeTurnDetectionConfig,
  RealtimeTurnDetectionType,
  RealtimeTurnEagerness,
  RealtimeVoiceAgentConfig,
  StageSettingValue,
  VoiceAgent,
  VoiceArchitecture,
} from "../types";

type ConfigurationPageProps = {
  agent: VoiceAgent | null;
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onArchitectureChange: (architecture: VoiceArchitecture) => void;
  onModelChange: (stageId: PipelineStage["id"], model: string) => void;
  onRealtimeConfigChange: (realtime: RealtimeVoiceAgentConfig) => void;
  onSelectAgent: (agentId: string) => void;
  onSettingChange: (
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) => void;
};

export function ConfigurationPage({
  agent,
  agents,
  selectedAgentId,
  onArchitectureChange,
  onModelChange,
  onRealtimeConfigChange,
  onSelectAgent,
  onSettingChange,
}: ConfigurationPageProps) {
  const architectureMode = agent?.architecture ?? "sandwich";
  const realtime = agent?.realtime ?? createDefaultRealtimeConfig();
  const realtimeDisabled = !agent;

  function updateRealtime(patch: Partial<RealtimeVoiceAgentConfig>) {
    onRealtimeConfigChange({
      ...realtime,
      ...patch,
    });
  }

  function updateTurnDetection(patch: Partial<RealtimeTurnDetectionConfig>) {
    updateRealtime({
      turnDetection: {
        ...realtime.turnDetection,
        ...patch,
      },
    });
  }

  return (
    <section className="page-section" aria-labelledby="configuration-title">
      <PageHeader
        agents={agents}
        eyebrow="Configuration"
        selectedAgentId={selectedAgentId}
        title="Voice pipeline"
        titleId="configuration-title"
        onSelectAgent={onSelectAgent}
      />
      <div className="page-body">
        <section
          className="panel architecture-panel"
          aria-labelledby="architecture-title"
        >
          <div className="architecture-panel-heading">
            <div>
              <p className="eyebrow">Architecture</p>
              <h2 id="architecture-title">Voice architecture</h2>
              <p>
                Choose how this agent listens, thinks, and speaks before tuning the
                stage-level model settings.
              </p>
            </div>
            <div className="icon-badge">
              {architectureMode === "sandwich" ? (
                <Layers3 size={18} />
              ) : (
                <RadioTower size={18} />
              )}
            </div>
          </div>

          <div
            aria-label="Architecture mode"
            className="architecture-toggle"
            role="tablist"
          >
            <button
              aria-selected={architectureMode === "sandwich"}
              className={architectureMode === "sandwich" ? "active" : ""}
              disabled={!agent}
              role="tab"
              type="button"
              onClick={() => onArchitectureChange("sandwich")}
            >
              <Layers3 size={15} />
              <span>Sandwich Architecture</span>
            </button>
            <button
              aria-selected={architectureMode === "speech_to_speech"}
              className={architectureMode === "speech_to_speech" ? "active" : ""}
              disabled={!agent}
              role="tab"
              type="button"
              onClick={() => onArchitectureChange("speech_to_speech")}
            >
              <RadioTower size={15} />
              <span>Speech-to-speech Architecture</span>
            </button>
          </div>

          {architectureMode === "sandwich" ? (
            <PipelineBuilder
              agent={agent}
              embedded
              onModelChange={onModelChange}
              onSettingChange={onSettingChange}
            />
          ) : (
            <section
              aria-labelledby="s2s-configuration-title"
              className="s2s-config"
              role="tabpanel"
            >
              <div className="s2s-stage-header">
                <div className="stage-icon llm">
                  <AudioLines size={19} />
                </div>
                <div>
                  <p className="eyebrow">Realtime models</p>
                  <h3 id="s2s-configuration-title">Speech-to-speech</h3>
                </div>
                <span className="runtime-chip available">Saved</span>
              </div>
              <div className="s2s-route" aria-label="Speech-to-speech signal path">
                <span>User audio</span>
                <strong>Realtime model</strong>
                <span>Audio output</span>
              </div>
              <div className="s2s-settings">
                <div className="setting-row">
                  <label htmlFor="realtime-provider">Provider</label>
                  <input
                    id="realtime-provider"
                    readOnly
                    type="text"
                    value="OpenAI Realtime"
                  />
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-model">Model</label>
                  <select
                    disabled={realtimeDisabled}
                    id="realtime-model"
                    value={realtime.model}
                    onChange={(event) =>
                      updateRealtime({ model: event.currentTarget.value })
                    }
                  >
                    {REALTIME_MODEL_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-voice">Voice</label>
                  <select
                    disabled={realtimeDisabled}
                    id="realtime-voice"
                    value={realtime.voice}
                    onChange={(event) =>
                      updateRealtime({ voice: event.currentTarget.value })
                    }
                  >
                    {REALTIME_VOICE_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-reasoning-effort">Reasoning effort</label>
                  <select
                    disabled={realtimeDisabled || realtime.model !== "gpt-realtime-2"}
                    id="realtime-reasoning-effort"
                    value={realtime.reasoningEffort}
                    onChange={(event) =>
                      updateRealtime({
                        reasoningEffort: event.currentTarget
                          .value as RealtimeReasoningEffort,
                      })
                    }
                  >
                    {REALTIME_REASONING_EFFORT_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-turn-detection">Turn detection</label>
                  <select
                    disabled={realtimeDisabled}
                    id="realtime-turn-detection"
                    value={realtime.turnDetection.type}
                    onChange={(event) =>
                      updateTurnDetection({
                        type: event.currentTarget.value as RealtimeTurnDetectionType,
                      })
                    }
                  >
                    {REALTIME_TURN_DETECTION_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-eagerness">Semantic eagerness</label>
                  <select
                    disabled={
                      realtimeDisabled || realtime.turnDetection.type !== "semantic_vad"
                    }
                    id="realtime-eagerness"
                    value={realtime.turnDetection.eagerness}
                    onChange={(event) =>
                      updateTurnDetection({
                        eagerness: event.currentTarget.value as RealtimeTurnEagerness,
                      })
                    }
                  >
                    {REALTIME_EAGERNESS_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-threshold">Server threshold</label>
                  <input
                    disabled={
                      realtimeDisabled || realtime.turnDetection.type !== "server_vad"
                    }
                    id="realtime-threshold"
                    max={1}
                    min={0}
                    step={0.05}
                    type="number"
                    value={realtime.turnDetection.threshold}
                    onChange={(event) =>
                      updateTurnDetection({
                        threshold: Number(event.currentTarget.value),
                      })
                    }
                  />
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-prefix-padding">Prefix padding</label>
                  <input
                    disabled={
                      realtimeDisabled || realtime.turnDetection.type !== "server_vad"
                    }
                    id="realtime-prefix-padding"
                    min={0}
                    step={50}
                    type="number"
                    value={realtime.turnDetection.prefixPaddingMs}
                    onChange={(event) =>
                      updateTurnDetection({
                        prefixPaddingMs: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <em>ms</em>
                </div>
                <div className="setting-row">
                  <label htmlFor="realtime-silence-duration">Silence duration</label>
                  <input
                    disabled={
                      realtimeDisabled || realtime.turnDetection.type !== "server_vad"
                    }
                    id="realtime-silence-duration"
                    min={100}
                    step={50}
                    type="number"
                    value={realtime.turnDetection.silenceDurationMs}
                    onChange={(event) =>
                      updateTurnDetection({
                        silenceDurationMs: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <em>ms</em>
                </div>
                <label className="s2s-checkbox">
                  <input
                    checked={realtime.turnDetection.createResponse}
                    disabled={realtimeDisabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateTurnDetection({
                        createResponse: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Create response</span>
                </label>
                <label className="s2s-checkbox">
                  <input
                    checked={realtime.turnDetection.interruptResponse}
                    disabled={realtimeDisabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateTurnDetection({
                        interruptResponse: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Interrupt response</span>
                </label>
                <div className="setting-row s2s-instructions-row">
                  <label htmlFor="realtime-instructions">Instructions</label>
                  <textarea
                    disabled={realtimeDisabled}
                    id="realtime-instructions"
                    value={realtime.instructions}
                    onChange={(event) =>
                      updateRealtime({ instructions: event.currentTarget.value })
                    }
                  />
                </div>
              </div>
            </section>
          )}
        </section>
      </div>
    </section>
  );
}
