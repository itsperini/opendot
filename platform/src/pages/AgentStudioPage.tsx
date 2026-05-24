import { AgentList } from "../components/AgentList";
import { CreateAgentPanel } from "../components/CreateAgentPanel";
import { PageHeader } from "../layout/PageHeader";
import type { CreateAgentInput, VoiceAgent } from "../types";

type AgentStudioPageProps = {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onCreateAgent: (input: CreateAgentInput) => void;
  onSelectAgent: (agentId: string) => void;
  onUpdateAgent: (agentId: string, input: CreateAgentInput) => void;
};

export function AgentStudioPage({
  agents,
  selectedAgentId,
  onCreateAgent,
  onSelectAgent,
  onUpdateAgent,
}: AgentStudioPageProps) {
  return (
    <section className="page-section" aria-labelledby="agent-studio-title">
      <PageHeader
        agents={agents}
        eyebrow="Agent Studio"
        selectedAgentId={selectedAgentId}
        title="Agent identities"
        titleId="agent-studio-title"
        onSelectAgent={onSelectAgent}
      />

      <div className="page-body studio-grid">
        <CreateAgentPanel onCreate={onCreateAgent} />
        <AgentList
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelect={onSelectAgent}
          onUpdate={onUpdateAgent}
        />
      </div>
    </section>
  );
}
