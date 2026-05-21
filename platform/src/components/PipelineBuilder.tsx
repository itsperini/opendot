import {
  Activity,
  Brain,
  Mic,
  Radio,
  Volume2,
} from "lucide-react";
import type { PipelineStage, StageOption, StageSetting, StageSettingValue, VoiceAgent } from "../types";

type PipelineBuilderProps = {
  agent: VoiceAgent | null;
  onModelChange: (stageId: PipelineStage["id"], model: string) => void;
  onSettingChange: (
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) => void;
};

const stageIcons = {
  vad: Activity,
  stt: Mic,
  llm: Brain,
  tts: Volume2,
};

function optionLabel(options: StageOption[] | undefined, value: string | number) {
  return options?.find((option) => String(option.value) === String(value))?.label ?? String(value);
}

function selectedValues(value: StageSettingValue) {
  return Array.isArray(value) ? value.map(String) : [];
}

function selectedSummary(setting: StageSetting) {
  const values = selectedValues(setting.value);
  if (values.length === 0) {
    return "None selected";
  }

  return values.map((value) => optionLabel(setting.options, value)).join(", ");
}

function selectOptionValue(setting: StageSetting, rawValue: string) {
  const option = setting.options?.find((item) => String(item.value) === rawValue);
  return option?.value ?? rawValue;
}

function toggleMultiValue(setting: StageSetting, option: StageOption) {
  const optionValue = String(option.value);
  const values = selectedValues(setting.value);

  if (values.includes(optionValue)) {
    return values.filter((value) => value !== optionValue);
  }

  return [...values, optionValue];
}

export function PipelineBuilder({
  agent,
  onModelChange,
  onSettingChange,
}: PipelineBuilderProps) {
  if (!agent) {
    return (
      <section className="panel empty-workspace">
        <Radio size={30} />
        <h2>No agent selected</h2>
        <p>Create a draft agent to configure its voice pipeline.</p>
      </section>
    );
  }

  return (
    <section className="workspace" aria-label={`${agent.name} pipeline`}>
      <div className="pipeline-flow">
        {agent.pipeline.map((stage, index) => {
          const Icon = stageIcons[stage.id];

          return (
            <article className="stage-card" key={stage.id}>
              <div className="stage-topline">
                <div className={`stage-icon ${stage.id}`}>
                  <Icon size={19} />
                </div>
                <span>0{index + 1}</span>
              </div>
              <h3>{stage.label}</h3>
              <p>{stage.purpose}</p>
              <div className="provider-row">
                <strong>{stage.provider}</strong>
                <label>
                  <span className="sr-only">{stage.label} model</span>
                  <select
                    className="model-select"
                    value={stage.model}
                    onChange={(event) => onModelChange(stage.id, event.target.value)}
                  >
                    {stage.modelOptions.map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="settings-list">
                {stage.settings.map((setting) => {
                  const controlId = `${stage.id}-${setting.key}`;

                  return (
                    <div className="setting-row" key={setting.key}>
                      <label htmlFor={controlId}>{setting.label}</label>
                      {setting.control === "select" ? (
                        <select
                          id={controlId}
                          value={String(setting.value)}
                          onChange={(event) =>
                            onSettingChange(
                              stage.id,
                              setting.key,
                              selectOptionValue(setting, event.target.value),
                            )
                          }
                        >
                          {setting.options?.map((option) => (
                            <option key={String(option.value)} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {setting.control === "multi-select" ? (
                        <details className="multi-select-dropdown">
                          <summary id={controlId}>
                            <span>{selectedSummary(setting)}</span>
                          </summary>
                          <div className="multi-select-menu">
                            {setting.options?.map((option) => {
                              const checked = selectedValues(setting.value).includes(
                                String(option.value),
                              );

                              return (
                                <label key={String(option.value)}>
                                  <input
                                    checked={checked}
                                    type="checkbox"
                                    onChange={() =>
                                      onSettingChange(
                                        stage.id,
                                        setting.key,
                                        toggleMultiValue(setting, option),
                                      )
                                    }
                                  />
                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      ) : null}

                      {setting.control === "switch" ? (
                        <input
                          checked={Boolean(setting.value)}
                          id={controlId}
                          type="checkbox"
                          onChange={(event) =>
                            onSettingChange(stage.id, setting.key, event.target.checked)
                          }
                        />
                      ) : null}
                      {setting.unit && setting.value !== "false" ? <em>{setting.unit}</em> : null}
                    </div>
                  );
                })}
              </div>
              <div className="event-chips">
                {stage.emits.map((eventName) => (
                  <span key={eventName}>{eventName}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
