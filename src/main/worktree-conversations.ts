import type { AgentProviderAdapter } from "./agent-provider";
import type { ExistingWorktree } from "../shared/models";

// Enough to recognize a worktree by; the rest are older detours.
const TITLES = 3;

/**
 * Adds to each worktree what the agents' conversations there were called, from every provider that can tell. Only
 * reads the CLIs' own files; a provider that fails adds nothing.
 */
export async function withConversations<T extends ExistingWorktree>(providers: readonly AgentProviderAdapter[], worktrees: T[]): Promise<T[]> {
  return Promise.all(worktrees.map(async (worktree) => {
    const found = (await Promise.all(providers.map((provider) => provider.conversationTitles?.(worktree.path).catch(() => []) ?? []))).flat();
    const titles = [...new Set(found.sort((a, b) => b.at - a.at).map((item) => item.title))].slice(0, TITLES);
    return titles.length ? { ...worktree, conversations: titles } : worktree;
  }));
}
