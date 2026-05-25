import { FormEvent, useState } from "react";
import { Bot, Check, Clock3, PencilLine, Trash2, X } from "lucide-react";
import type { CreateAgentInput, VoiceAgent } from "../types";

type AgentListProps = {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onDelete: (agentId: string) => void;
  onSelect: (agentId: string) => void;
  onUpdate: (agentId: string, input: CreateAgentInput) => void;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AgentList({
  agents,
  selectedAgentId,
  onDelete,
  onSelect,
  onUpdate,
}: AgentListProps) {
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  function startEditing(agent: VoiceAgent) {
    setEditingAgentId(agent.id);
    setEditName(agent.name);
    setEditDescription(agent.description);
    onSelect(agent.id);
  }

  function cancelEditing() {
    setEditingAgentId(null);
    setEditName("");
    setEditDescription("");
  }

  function saveEditing(event: FormEvent<HTMLFormElement>, agentId: string) {
    event.preventDefault();
    const name = editName.trim();
    const description = editDescription.trim();

    if (!name || !description) {
      return;
    }

    onUpdate(agentId, { name, description });
    cancelEditing();
  }

  function requestDelete(agent: VoiceAgent) {
    const confirmed = window.confirm(`Delete "${agent.name}"?`);
    if (!confirmed) {
      return;
    }

    if (editingAgentId === agent.id) {
      cancelEditing();
    }
    onDelete(agent.id);
  }

  return (
    <section className="panel agent-list-panel" aria-labelledby="agents-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="agents-title">Agent identities</h2>
        </div>
        <span className="count-pill">{agents.length}</span>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <Bot size={22} />
          <p>No agent identities yet.</p>
        </div>
      ) : (
        <div className="agent-list">
          {agents.map((agent) => {
            const active = agent.id === selectedAgentId;
            const editing = agent.id === editingAgentId;

            return (
              <article
                key={agent.id}
                className={`agent-row ${active ? "active" : ""} ${editing ? "editing" : ""}`}
              >
                <button
                  className="agent-row-select"
                  type="button"
                  onClick={() => onSelect(agent.id)}
                >
                  <span className="agent-row-mark">
                    <Bot size={17} />
                  </span>
                  <span className="agent-row-copy">
                    <strong>{agent.name}</strong>
                    <small>{agent.description}</small>
                    <em>
                      <Clock3 size={12} />
                      {formatTime(agent.updatedAt)}
                    </em>
                  </span>
                </button>

                <div className="agent-row-actions">
                  <button
                    aria-label={`Edit ${agent.name}`}
                    className="icon-button quiet agent-row-edit"
                    title={editing ? "Cancel edit" : "Edit identity"}
                    type="button"
                    onClick={() => (editing ? cancelEditing() : startEditing(agent))}
                  >
                    {editing ? <X size={15} /> : <PencilLine size={15} />}
                  </button>
                  <button
                    aria-label={`Delete ${agent.name}`}
                    className="icon-button quiet danger agent-row-delete"
                    title="Delete identity"
                    type="button"
                    onClick={() => requestDelete(agent)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {editing ? (
                  <form
                    className="agent-edit-form"
                    onSubmit={(event) => saveEditing(event, agent.id)}
                  >
                    <label>
                      Identity name
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Lobby guide"
                        required
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        placeholder="What this identity should do"
                        rows={3}
                        required
                      />
                    </label>
                    <div className="agent-edit-actions">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={cancelEditing}
                      >
                        <X size={15} />
                        Cancel
                      </button>
                      <button className="primary-button" type="submit">
                        <Check size={16} />
                        Save identity
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
