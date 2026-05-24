import { useState } from "react";
import { AudioLines, Layers3, RadioTower } from "lucide-react";
import { PipelineBuilder } from "../components/PipelineBuilder";
import { PageHeader } from "../layout/PageHeader";
import type { PipelineStage, StageSettingValue, VoiceAgent } from "../types";

type ConfigurationPageProps = {
  agent: VoiceAgent | null;
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onModelChange: (stageId: PipelineStage["id"], model: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSettingChange: (
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) => void;
};

type ArchitectureMode = "sandwich" | "speech-to-speech";

export function ConfigurationPage({
  agent,
  agents,
  selectedAgentId,
  onModelChange,
  onSelectAgent,
  onSettingChange,
}: ConfigurationPageProps) {
  const [architectureMode, setArchitectureMode] = useState<ArchitectureMode>("sandwich");

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
              role="tab"
              type="button"
              onClick={() => setArchitectureMode("sandwich")}
            >
              <Layers3 size={15} />
              <span>Sandwich Architecture</span>
            </button>
            <button
              aria-selected={architectureMode === "speech-to-speech"}
              className={architectureMode === "speech-to-speech" ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => setArchitectureMode("speech-to-speech")}
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
              className="s2s-placeholder"
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
                <span className="runtime-chip offline">Coming soon</span>
              </div>
              <div className="s2s-route" aria-label="Speech-to-speech signal path">
                <span>User audio</span>
                <strong>Realtime model</strong>
                <span>Audio output</span>
              </div>
              <div className="s2s-disabled-settings" aria-disabled="true">
                <label>
                  <span>Provider</span>
                  <input disabled placeholder="OpenAI Realtime compatible" />
                </label>
                <label>
                  <span>Model</span>
                  <input disabled placeholder="Realtime model id" />
                </label>
                <label>
                  <span>Transport</span>
                  <input disabled placeholder="WebRTC or WebSocket" />
                </label>
              </div>
            </section>
          )}
        </section>
      </div>
    </section>
  );
}
