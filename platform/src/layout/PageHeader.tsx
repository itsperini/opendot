import type { ReactNode } from "react";
import { Bot, ChevronDown } from "lucide-react";
import type { VoiceAgent } from "../types";

type PageHeaderProps = {
  actions?: ReactNode;
  agents: VoiceAgent[];
  eyebrow: string;
  selectedAgentId: string | null;
  title: string;
  titleId: string;
  onSelectAgent: (agentId: string) => void;
};

type AgentIdentitySwitcherProps = {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

function AgentIdentitySwitcher({
  agents,
  selectedAgentId,
  onSelectAgent,
}: AgentIdentitySwitcherProps) {
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const hasAgents = agents.length > 0;
  const emptyLabel = hasAgents ? "Select identity" : "No agent identities";

  return (
    <label
      className={`agent-identity-switcher ${hasAgents ? "" : "empty"}`}
      title={selectedAgent?.name ?? emptyLabel}
    >
      <span className="agent-identity-icon" aria-hidden="true">
        <Bot size={16} />
      </span>
      <span className="agent-identity-copy">
        <small>Active identity</small>
        <strong>{selectedAgent?.name ?? emptyLabel}</strong>
      </span>
      <ChevronDown className="agent-identity-chevron" size={15} aria-hidden="true" />
      <select
        aria-label="Active agent identity"
        disabled={!hasAgents}
        value={selectedAgent?.id ?? ""}
        onChange={(event) => {
          if (event.target.value) {
            onSelectAgent(event.target.value);
          }
        }}
      >
        {hasAgents && !selectedAgent ? <option value="">Select identity</option> : null}
        {!hasAgents ? <option value="">No agent identities</option> : null}
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PageHeader({
  actions,
  agents,
  eyebrow,
  selectedAgentId,
  title,
  titleId,
  onSelectAgent,
}: PageHeaderProps) {
  return (
    <div className="section-heading">
      <div className="section-heading-title">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="section-heading-actions">
        <AgentIdentitySwitcher
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
