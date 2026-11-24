import { useEffect, useState } from "react";
import type { AgentProviderInfo } from "../../../shared/models";
import { services } from "../../core/services";
import { useWorkbenchStore } from "../../state/workbench-store";

/** CLIs capable of running built-in AI actions, with the user's choice or the first installed. */
export function useDefaultCli(): { agents: AgentProviderInfo[]; current?: AgentProviderInfo } {
  const chosen = useWorkbenchStore((state) => state.defaultAgentProviderId);
  const [agents, setAgents] = useState<AgentProviderInfo[]>([]);
  useEffect(() => {
    let active = true;
    window.workbench.agent.providers()
      .then((providers) => { if (active) setAgents(providers.filter((provider) => provider.supportsInternalAi && services.sessions.get(provider.id)?.kind === "agent")); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return { agents, current: agents.find((agent) => agent.id === chosen) ?? agents.find((agent) => agent.available) };
}
