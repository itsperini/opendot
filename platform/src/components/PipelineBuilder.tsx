import { useState } from "react";
import { Activity, Brain, ChevronDown, Mic, Plus, Radio, X, Volume2 } from "lucide-react";
import type {
  PipelineStage,
  StageOption,
  StageSetting,
  StageSettingValue,
  VoiceAgent,
} from "../types";

type PipelineBuilderProps = {
  agent: VoiceAgent | null;
  embedded?: boolean;
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

const stageRoles = {
  vad: "Listen",
  stt: "Transcribe",
  llm: "Think",
  tts: "Speak",
};

function optionLabel(options: StageOption[] | undefined, value: string | number) {
  return (
    options?.find((option) => String(option.value) === String(value))?.label ??
    String(value)
  );
}

function selectedValues(value: StageSettingValue) {
  return Array.isArray(value) ? value.map(String) : [];
}

function keyValueMap(value: StageSettingValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, String(entryValue)] as const)
      .filter(([key]) => key.length > 0),
  );
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

function selectedModelOption(stage: PipelineStage) {
  return stage.modelOptions.find(
    (option) => String(option.value) === String(stage.model),
  );
}

type ModelPickerProps = {
  stage: PipelineStage;
  onModelChange: (stageId: PipelineStage["id"], model: string) => void;
};

function ModelPicker({ stage, onModelChange }: ModelPickerProps) {
  const matchedOption = selectedModelOption(stage);
  const selectValue = matchedOption ? String(matchedOption.value) : "__custom__";
  const customHint =
    stage.id === "llm"
      ? "Choose a suggested OpenAI model or type any model ID supported by your OpenAI-compatible endpoint."
      : "Choose a suggested model or type a provider-specific model ID.";

  if (!stage.allowCustomModel) {
    return (
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
    );
  }

  if (stage.id !== "llm") {
    return (
      <>
        <input
          className="model-input"
          list={`${stage.id}-model-options`}
          value={stage.model}
          onChange={(event) => onModelChange(stage.id, event.target.value)}
        />
        <datalist id={`${stage.id}-model-options`}>
          {stage.modelOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </datalist>
      </>
    );
  }

  return (
    <div className="model-picker llm-model-picker">
      <label className="model-choice-row">
        <span>Suggested models</span>
        <select
          className="model-select"
          value={selectValue}
          onChange={(event) => {
            if (event.target.value !== "__custom__") {
              onModelChange(stage.id, event.target.value);
            }
          }}
        >
          {stage.modelOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
          <option value="__custom__">Custom model ID...</option>
        </select>
      </label>
      <label className="model-custom-row">
        <span>Custom model ID</span>
        <input
          className="model-input"
          value={stage.model}
          placeholder={stage.id === "llm" ? "e.g. provider/model-name" : "Model ID"}
          onChange={(event) => onModelChange(stage.id, event.target.value)}
        />
      </label>
      <small className="model-helper">{customHint}</small>
    </div>
  );
}

function toggleMultiValue(setting: StageSetting, option: StageOption) {
  const optionValue = String(option.value);
  const values = selectedValues(setting.value);

  if (values.includes(optionValue)) {
    return values.filter((value) => value !== optionValue);
  }

  return [...values, optionValue];
}

type TextListSettingProps = {
  id: string;
  setting: StageSetting;
  onChange: (value: string[]) => void;
};

function TextListSetting({ id, setting, onChange }: TextListSettingProps) {
  const [draftValue, setDraftValue] = useState("");
  const values = selectedValues(setting.value);
  const maxItems = setting.maxItems ?? 4;
  const canAdd = values.length < maxItems;

  function addValue(value: string) {
    const nextValue = value.trim();
    if (!nextValue || values.includes(nextValue) || values.length >= maxItems) {
      return;
    }
    onChange([...values, nextValue]);
    setDraftValue("");
  }

  return (
    <div className="text-list-editor">
      <div className="setting-inline-meta">
        <span>
          {values.length}/{maxItems}
        </span>
      </div>
      {values.map((value, index) => (
        <div className="text-list-row" key={`${value}-${index}`}>
          <input
            aria-label={`${setting.label} ${index + 1}`}
            value={value}
            onChange={(event) => {
              const nextValues = [...values];
              nextValues[index] = event.target.value;
              onChange(nextValues);
            }}
          />
          <button
            aria-label={`Remove ${setting.label} ${index + 1}`}
            className="icon-button quiet setting-icon-button"
            type="button"
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {canAdd ? (
        <div className="text-list-row">
          <input
            id={id}
            placeholder={setting.placeholder}
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addValue(draftValue);
              }
            }}
          />
          <button
            aria-label={`Add ${setting.label}`}
            className="icon-button quiet setting-icon-button"
            type="button"
            onClick={() => addValue(draftValue)}
          >
            <Plus size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

type KeyValueSettingProps = {
  id: string;
  setting: StageSetting;
  onChange: (value: Record<string, string>) => void;
};

function KeyValueSetting({ id, setting, onChange }: KeyValueSettingProps) {
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const entries = Object.entries(keyValueMap(setting.value));

  function addEntry() {
    const key = draftKey.trim();
    if (!key) {
      return;
    }
    onChange({ ...keyValueMap(setting.value), [key]: draftValue });
    setDraftKey("");
    setDraftValue("");
  }

  function updateEntry(previousKey: string, nextKey: string, value: string) {
    const nextEntries = keyValueMap(setting.value);
    delete nextEntries[previousKey];
    const normalizedKey = nextKey.trim();
    if (normalizedKey) {
      nextEntries[normalizedKey] = value;
    }
    onChange(nextEntries);
  }

  return (
    <div className="key-value-editor">
      {entries.map(([key, value], index) => (
        <div className="key-value-row" key={`${key}-${index}`}>
          <input
            aria-label={`${setting.label} key ${index + 1}`}
            value={key}
            onChange={(event) => updateEntry(key, event.target.value, value)}
          />
          <input
            aria-label={`${setting.label} value ${index + 1}`}
            value={value}
            onChange={(event) => updateEntry(key, key, event.target.value)}
          />
          <button
            aria-label={`Remove ${setting.label} ${index + 1}`}
            className="icon-button quiet setting-icon-button"
            type="button"
            onClick={() => {
              const nextEntries = keyValueMap(setting.value);
              delete nextEntries[key];
              onChange(nextEntries);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="key-value-row">
        <input
          id={id}
          aria-label={`${setting.label} key`}
          placeholder="Key"
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEntry();
            }
          }}
        />
        <input
          aria-label={`${setting.label} value`}
          placeholder="Value"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEntry();
            }
          }}
        />
        <button
          aria-label={`Add ${setting.label}`}
          className="icon-button quiet setting-icon-button"
          type="button"
          onClick={addEntry}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function PipelineBuilder({
  agent,
  embedded = false,
  onModelChange,
  onSettingChange,
}: PipelineBuilderProps) {
  if (!agent) {
    return (
      <section
        className={`empty-workspace ${embedded ? "embedded-empty-workspace" : "panel"}`}
      >
        <Radio size={30} />
        <h2>No agent identity selected</h2>
        <p>Create an agent identity to configure its voice pipeline.</p>
      </section>
    );
  }

  return (
    <section
      className={`workspace ${embedded ? "embedded-workspace" : ""}`}
      aria-label={`${agent.name} sandwich pipeline`}
      role="tabpanel"
    >
      <div className="pipeline-flow">
        {agent.pipeline.map((stage, index) => {
          const Icon = stageIcons[stage.id];

          return (
            <details className="stage-accordion" key={stage.id}>
              <summary className="stage-summary">
                <div className="stage-summary-main">
                  <div className={`stage-icon ${stage.id}`}>
                    <Icon size={19} />
                  </div>
                  <div className="stage-summary-copy">
                    <span>
                      0{index + 1} / {stageRoles[stage.id]}
                    </span>
                    <h3>{stage.label}</h3>
                    <p>{stage.purpose}</p>
                  </div>
                </div>
                <div className="stage-summary-meta">
                  <span>{stage.provider}</span>
                  <strong>{stage.model}</strong>
                </div>
                <ChevronDown className="stage-summary-chevron" size={17} />
              </summary>
              <div className="stage-accordion-body">
                <div className="provider-row">
                  <strong>{stage.provider}</strong>
                  <div className="model-control">
                    <span className="sr-only">{stage.label} model</span>
                    <ModelPicker stage={stage} onModelChange={onModelChange} />
                  </div>
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
                              <option
                                key={String(option.value)}
                                value={String(option.value)}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {setting.control === "text" ? (
                          <input
                            id={controlId}
                            placeholder={setting.placeholder}
                            type="text"
                            value={String(setting.value)}
                            onChange={(event) =>
                              onSettingChange(stage.id, setting.key, event.target.value)
                            }
                          />
                        ) : null}

                        {setting.control === "number" ? (
                          <input
                            id={controlId}
                            max={setting.max}
                            min={setting.min}
                            step={setting.step}
                            type="number"
                            value={String(setting.value)}
                            onChange={(event) =>
                              onSettingChange(
                                stage.id,
                                setting.key,
                                event.target.valueAsNumber,
                              )
                            }
                          />
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

                        {setting.control === "multi-text" ? (
                          <TextListSetting
                            id={controlId}
                            setting={setting}
                            onChange={(value) =>
                              onSettingChange(stage.id, setting.key, value)
                            }
                          />
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

                        {setting.control === "key-value-list" ? (
                          <KeyValueSetting
                            id={controlId}
                            setting={setting}
                            onChange={(value) =>
                              onSettingChange(stage.id, setting.key, value)
                            }
                          />
                        ) : null}

                        {setting.control === "textarea" ? (
                          <textarea
                            id={controlId}
                            placeholder={setting.placeholder}
                            rows={5}
                            value={String(setting.value)}
                            onChange={(event) =>
                              onSettingChange(stage.id, setting.key, event.target.value)
                            }
                          />
                        ) : null}
                        {setting.unit && setting.value !== "false" ? (
                          <em>{setting.unit}</em>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="event-chips">
                  {stage.emits.map((eventName) => (
                    <span key={eventName}>{eventName}</span>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
