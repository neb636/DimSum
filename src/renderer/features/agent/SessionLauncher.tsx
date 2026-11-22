import { useEffect, useState } from "react";
import { Input, Label, Radio, RadioGroup, TextField, ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { AgentProviderInfo, AgentViewState, Workspace } from "../../../shared/models";
import { services } from "../../core/services";
import { AgentIcon, BranchIcon, CheckIcon, FolderIcon } from "../../ui/icons";
import { Button } from "../../ui/controls";
import { CreateFromPicker } from "./CreateFromPicker";
import { useBaseBranches } from "./use-base-branches";
import { useWorkbenchStore } from "../../state/workbench-store";
import { repositoryOf, suggestedBranch, worktreeFolderName, worktreeFolderPreview } from "../../../shared/workspace-tree";
import { useWorktreeContainer } from "../worktrees/worktrees";

export function SessionLauncher({ workspace, state, providers, selected, busy, needsModel, error, onChange, onStart }: {
  workspace: Workspace;
  state: AgentViewState;
  providers: AgentProviderInfo[];
  selected?: string;
  busy: boolean;
  /** No model is chosen yet, so a new conversation can't start. Resuming keeps the conversation's own model. */
  needsModel: boolean;
  error: string;
  onChange: (patch: Partial<AgentViewState>) => void;
  onStart: (resume: boolean) => void;
}) {
  const [canWorktree, setCanWorktree] = useState(false);
  useEffect(() => {
    let active = true;
    void window.workbench.sourceControl.detect(workspace.path).then((value) => { if (active) setCanWorktree(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [workspace.path]);
  // A new worktree is always made from the repository, even when this session is in one of its worktrees.
  const repository = useWorkbenchStore((store) => repositoryOf(store.workspaces, workspace));
  // A session runs in the checkout it was opened in unless the person asks for a new worktree.
  const runIn = state.runIn ?? { kind: "checkout" };
  const bases = useBaseBranches(repository.path, canWorktree && !state.cwd && runIn.kind === "worktree");
  const branchTaken = runIn.kind === "worktree" && Boolean(bases.data?.branches.some((b) => b.kind === "local" && b.name === runIn.branch));
  const available = Boolean(providers.find((p) => p.id === selected)?.available);
  const agents = providers.filter((p) => services.sessions.get(p.id)?.kind === "agent");
  const container = useWorktreeContainer(runIn.kind === "worktree" && !state.cwd ? repository.path : "");
  const location = state.cwd ?? (runIn.kind === "worktree" ? (container ? worktreeFolderPreview(container, runIn.branch) : worktreeFolderName(runIn.branch)) : workspace.path);

  return <section className="session-launcher" aria-label="New agent session">
    <div className="launcher-heading">
      <h2>Start a new session</h2>
      <p>Choose a harness, then start the session or send your first prompt.</p>
    </div>
    <RadioGroup aria-label="Coding harness" value={selected ?? ""} onChange={(providerId) => onChange({ providerId })} className="harness-options" orientation="horizontal">
      {agents.map((p) => {
        const provider = services.sessions.get(p.id);
        const Mark = provider?.icon ?? AgentIcon;
        return <Radio key={p.id} value={p.id} isDisabled={!p.available || busy} className="harness-option">
          {({ isSelected }) => <>
            <span className="harness-icon"><Mark size={22} /></span>
            <span className="harness-copy">
              <strong>{p.label}</strong>
              <small>{provider?.description && `${provider.description} · `}<span className={p.available ? "is-ready" : "is-missing"}>{p.available ? "Ready" : "Not installed"}</span></small>
            </span>
            <span className={`harness-check ${isSelected ? "is-selected" : ""}`} aria-hidden="true">{isSelected && <CheckIcon size={12} />}</span>
          </>}
        </Radio>;
      })}
    </RadioGroup>
    {providers.length === 0 && !error && <p className="launcher-note">Checking installed harnesses…</p>}
    {agents.some((p) => !p.available) && <p className="launcher-note">{agents.find((p) => !p.available)?.reason}</p>}
    <dl className="launcher-fields">
      <dt>Run in</dt>
      <dd>
        <ToggleButtonGroup aria-label="Run in" className="segmented" selectionMode="single" disallowEmptySelection isDisabled={Boolean(state.cwd)}
          selectedKeys={[runIn.kind]} onSelectionChange={(keys) => {
            const kind = [...keys][0];
            onChange({ runIn: kind === "worktree" ? { kind: "worktree", branch: suggestedBranch() } : { kind: "checkout" } });
          }}>
          <ToggleButton id="checkout" className="segment">{workspace.parentId ? <BranchIcon size={13} /> : <FolderIcon size={13} />}{workspace.parentId ? "This worktree" : "Local checkout"}</ToggleButton>
          <ToggleButton id="worktree" className="segment" isDisabled={!canWorktree}><BranchIcon size={13} />New worktree</ToggleButton>
        </ToggleButtonGroup>
      </dd>
      {runIn.kind === "worktree" && !state.cwd && <>
        <dt>Create from</dt>
        <dd><CreateFromPicker {...bases} onOpen={bases.refresh} value={runIn.base} isDisabled={busy} onChange={(base) => onChange({ runIn: { ...runIn, base } })} /></dd>
        <dt>Branch</dt>
        <dd>
          <TextField aria-label="Branch" className="launcher-text" isInvalid={branchTaken} value={runIn.branch} onChange={(branch) => onChange({ runIn: { ...runIn, branch } })}>
            <Label className="visually-hidden">Branch</Label><Input />
          </TextField>
          {branchTaken && <p role="alert" className="launcher-field-error">A branch with this name already exists.</p>}
        </dd>
      </>}
      <dt>Location</dt>
      <dd>
        <code className="launcher-location">{location}</code>
        {runIn.kind === "worktree" && !state.cwd && <p className="launcher-note">The worktree is listed under {repository.name} in the sidebar, and this session moves into it when it starts.</p>}
      </dd>
    </dl>
    {error && <p role="alert" className="agent-error">{error}</p>}
    <div className="launcher-actions">
      <Button isDisabled={busy || !available} onPress={() => onStart(true)}>Resume previous…</Button>
      {/* Shown only when a new conversation can start: the harness is installed and a model is chosen. */}
      {available && !needsModel && <Button className="primary-button" isDisabled={busy} onPress={() => onStart(false)}>{busy ? "Starting…" : "Start session"}</Button>}
    </div>
  </section>;
}
