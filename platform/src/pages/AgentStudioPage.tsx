import { AgentList } from "../components/AgentList";
import { CreateAgentPanel } from "../components/CreateAgentPanel";
import type { CreateAgentInput, VoiceAgent } from "../types";

type AgentStudioPageProps = {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onCreateAgent: (input: CreateAgentInput) => void;
  onSelectAgent: (agentId: string) => void;
};

export function AgentStudioPage({
  agents,
  selectedAgentId,
  onCreateAgent,
  onSelectAgent,
}: AgentStudioPageProps) {
  return (
    <section className="page-section" aria-label="Agent Studio">
      <div className="studio-grid">
        <CreateAgentPanel onCreate={onCreateAgent} />
        <AgentList
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelect={onSelectAgent}
        />
      </div>
    </section>
  );
}
