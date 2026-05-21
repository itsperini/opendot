import { PipelineBuilder } from "../components/PipelineBuilder";
import type { PipelineStage, StageSettingValue, VoiceAgent } from "../types";

type ConfigurationPageProps = {
  agent: VoiceAgent | null;
  onModelChange: (stageId: PipelineStage["id"], model: string) => void;
  onSettingChange: (
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) => void;
};

export function ConfigurationPage({
  agent,
  onModelChange,
  onSettingChange,
}: ConfigurationPageProps) {
  return (
    <section className="page-section" aria-labelledby="configuration-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2 id="configuration-title">Voice pipeline</h2>
        </div>
      </div>
      <PipelineBuilder
        agent={agent}
        onModelChange={onModelChange}
        onSettingChange={onSettingChange}
      />
    </section>
  );
}
