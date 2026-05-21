import { FormEvent, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { CreateAgentInput } from "../types";

type CreateAgentPanelProps = {
  onCreate: (input: CreateAgentInput) => void;
};

export function CreateAgentPanel({ onCreate }: CreateAgentPanelProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName || !trimmedDescription) {
      return;
    }

    onCreate({
      name: trimmedName,
      description: trimmedDescription,
    });
    setName("");
    setDescription("");
  }

  return (
    <section className="panel create-panel" aria-labelledby="create-agent-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Agent Studio</p>
          <h2 id="create-agent-title">Create voice agent</h2>
        </div>
        <div className="icon-badge">
          <Sparkles size={18} />
        </div>
      </div>

      <form className="agent-form" onSubmit={handleSubmit}>
        <label>
          Agent name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Lobby guide"
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Greets visitors, answers building questions, and routes people to the right room."
            rows={5}
            required
          />
        </label>

        <div className="pipeline-strip" aria-label="Default voice pipeline">
          {["VAD", "STT", "LLM", "TTS"].map((stage) => (
            <span key={stage}>{stage}</span>
          ))}
        </div>

        <button className="primary-button" type="submit">
          <Plus size={17} />
          Create draft agent
        </button>
      </form>
    </section>
  );
}
