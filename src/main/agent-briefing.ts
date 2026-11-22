import type { AgentProviderAdapter } from "./agent-provider";
import type { LaunchArgsContributor } from "./agent-session-manager";
import { agentReferencePath } from "./dimsum-home";

/** The short note every agent session DimSum starts carries: the details stay in the reference until they are needed. */
function briefingNote(reference: string): string {
  return "You are running inside DimSum, a local agent workbench. When asked to change DimSum itself for this workspace or "
    + "for the person (appended instructions, DimSum settings, extensions), first read " + reference
    + " and follow it. Otherwise ignore this note.";
}

/** Points each new agent session at the agent reference, through its adapter's system note; nothing when the build has none. */
export function agentBriefing(providers: AgentProviderAdapter[], reference = agentReferencePath()): LaunchArgsContributor {
  const note = reference ? briefingNote(reference) : undefined;
  return (providerId) => {
    if (!note) return [];
    return providers.find((provider) => provider.id === providerId)?.systemNoteArgs?.(note) ?? [];
  };
}
