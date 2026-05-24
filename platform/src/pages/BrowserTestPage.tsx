import { TestAgentPanel } from "../components/TestAgentPanel";
import { PageHeader } from "../layout/PageHeader";
import type { VoiceAgent } from "../types";

type BrowserTestPageProps = {
  agent: VoiceAgent | null;
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

export function BrowserTestPage({
  agent,
  agents,
  selectedAgentId,
  onSelectAgent,
}: BrowserTestPageProps) {
  return (
    <section className="page-section" aria-labelledby="browser-test-title">
      <PageHeader
        agents={agents}
        eyebrow="Browser Test"
        selectedAgentId={selectedAgentId}
        title="Live session"
        titleId="browser-test-title"
        onSelectAgent={onSelectAgent}
      />

      <div className="page-body">
        <TestAgentPanel agent={agent} />
      </div>
    </section>
  );
}
