import { Bot, Clock3 } from "lucide-react";
import type { VoiceAgent } from "../types";

type AgentListProps = {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AgentList({ agents, selectedAgentId, onSelect }: AgentListProps) {
  return (
    <section className="panel agent-list-panel" aria-labelledby="agents-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="agents-title">Draft agents</h2>
        </div>
        <span className="count-pill">{agents.length}</span>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <Bot size={22} />
          <p>No draft agents yet.</p>
        </div>
      ) : (
        <div className="agent-list">
          {agents.map((agent) => {
            const active = agent.id === selectedAgentId;

            return (
              <button
                key={agent.id}
                className={`agent-row ${active ? "active" : ""}`}
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
            );
          })}
        </div>
      )}
    </section>
  );
}
