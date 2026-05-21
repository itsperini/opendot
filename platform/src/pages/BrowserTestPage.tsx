import { TestAgentPanel } from "../components/TestAgentPanel";
import type { VoiceAgent } from "../types";

type BrowserTestPageProps = {
  agent: VoiceAgent | null;
};

export function BrowserTestPage({ agent }: BrowserTestPageProps) {
  return (
    <section className="page-section" aria-label="Browser Test">
      <TestAgentPanel agent={agent} />
    </section>
  );
}
