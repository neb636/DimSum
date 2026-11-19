import { useEffect, useState, type FormEvent } from "react";
import { Button, Dialog, Heading, Input, Label, Modal, ModalOverlay, TextField, ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { ExistingWorktree, Workspace } from "../../../shared/models";
import { isFilesWorkspace } from "../../../shared/files-workspace";
import { suggestedBranch, worktreeFolderPreview } from "../../../shared/workspace-tree";
import { errorMessage } from "../../core/errors";
import { services } from "../../core/services";
import { useWorkbenchStore } from "../../state/workbench-store";
import { AgentIcon, BranchIcon, CloseIcon, MinusIcon, TerminalIcon } from "../../ui/icons";
import { IconButton } from "../../ui/controls";
import { CreateFromPicker, type BaseChoice } from "../agent/CreateFromPicker";
import { useBaseBranches } from "../agent/use-base-branches";
import { createWorktree, openWorktree, useWorktreeDialog, type WorktreeOpening } from "./worktrees";

const OPENINGS: { id: string; label: string; icon: typeof AgentIcon; value: WorktreeOpening }[] = [
  { id: "agent", label: "Agent session", icon: AgentIcon, value: "agent" },
  { id: "terminal", label: "Terminal", icon: TerminalIcon, value: "terminal" },
  { id: "none", label: "Nothing", icon: MinusIcon, value: null },
];

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, "") === b.replace(/[\\/]+$/, "");

/** Mounted once by the shell; opened with the `worktree.new` command. */
export function NewWorktreeDialog() {
  const repositoryId = useWorktreeDialog((state) => state.repositoryId);
  const repository = useWorkbenchStore((state) => state.workspaces.find((item) => item.id === repositoryId && !isFilesWorkspace(item)));
  if (!repository) return null;
  const close = () => useWorktreeDialog.setState({ repositoryId: undefined });
  return <ModalOverlay className="wb-modal-overlay confirm-overlay" isOpen isDismissable onOpenChange={(open) => { if (!open) close(); }}>
    <Modal className="wb-modal worktree-modal confirm-modal">
      <Dialog className="wb-dialog worktree-dialog" aria-label={`New worktree of ${repository.name}`}>
        <WorktreeForm key={repository.id} repository={repository} close={close} />
      </Dialog>
    </Modal>
  </ModalOverlay>;
}

function WorktreeForm({ repository, close }: { repository: Workspace; close: () => void }) {
  const [branch, setBranch] = useState(suggestedBranch);
  const [base, setBase] = useState<BaseChoice>();
  const [opening, setOpening] = useState("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bases = useBaseBranches(repository.path, true);
  const workspaces = useWorkbenchStore((state) => state.workspaces);
  const open = workspaces.filter((item) => item.parentId === repository.id || item.id === repository.id).map((item) => item.path);
  const [existing, setExisting] = useState<ExistingWorktree[]>([]);
  useEffect(() => {
    let active = true;
    void window.workbench.sourceControl.worktrees(repository.path).then((found) => { if (active) setExisting(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [repository.path]);
  const closed = existing.filter((entry) => !open.some((path) => samePath(path, entry.path)));
  const name = branch.trim();
  const taken = Boolean(bases.data?.branches.some((item) => item.kind === "local" && item.name === name));

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await work(); close(); }
    catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name || taken || busy) return;
    const value = OPENINGS.find((item) => item.id === opening)?.value ?? null;
    void run(() => createWorktree({ workspaceId: repository.id, branch: name, base: base?.ref, open: value }));
  };

  return <form className="worktree-form" onSubmit={submit}>
    <div className="confirm-header">
      <div>
        <Heading slot="title">New worktree</Heading>
        <p>A separate checkout of <strong>{repository.name}</strong> on its own branch, with its own tabs, terminals and sessions.</p>
      </div>
      <IconButton label="Cancel" className="confirm-close" onPress={close}><CloseIcon size={14} /></IconButton>
    </div>
    <dl className="launcher-fields worktree-fields">
      <dt>Branch</dt>
      <dd>
        <TextField aria-label="Branch" className="launcher-text" isInvalid={taken} value={branch} onChange={setBranch} isDisabled={busy} autoFocus>
          <Label className="visually-hidden">Branch</Label>
          <Input onFocus={(event) => event.currentTarget.select()} />
        </TextField>
        {taken && <p role="alert" className="launcher-field-error">A branch with this name already exists.</p>}
      </dd>
      <dt>Create from</dt>
      <dd><CreateFromPicker {...bases} onOpen={bases.refresh} value={base} isDisabled={busy} onChange={setBase} /></dd>
      <dt>Open with</dt>
      <dd>
        <ToggleButtonGroup aria-label="Open with" className="segmented" selectionMode="single" disallowEmptySelection isDisabled={busy}
          selectedKeys={[opening]} onSelectionChange={(keys) => { const key = [...keys][0]; if (key !== undefined) setOpening(String(key)); }}>
          {OPENINGS.map(({ id, label, icon: Icon }) => <ToggleButton key={id} id={id} className="segment"><Icon size={13} />{label}</ToggleButton>)}
        </ToggleButtonGroup>
      </dd>
      <dt>Location</dt>
      <dd><code className="launcher-location">{worktreeFolderPreview(repository.path, name || "…")}</code></dd>
    </dl>
    {error && <p role="alert" className="agent-error">{error}</p>}
    {closed.length > 0 && <section className="worktree-existing" aria-labelledby="worktree-existing-title">
      <h3 id="worktree-existing-title">Existing worktrees</h3>
      <ul>
        {closed.map((entry) => <li key={entry.path}>
          <span className="base-option-icon"><BranchIcon size={13} /></span>
          <span className="worktree-existing-copy">
            <strong>{entry.branch ?? "Detached"}</strong>
            <small title={entry.path}><bdi>{entry.path}</bdi></small>
          </span>
          <Button className="wb-button" isDisabled={busy} aria-label={`Open ${entry.branch ?? entry.path}`}
            onPress={() => void run(() => openWorktree(repository.id, entry.path, entry.branch))}>Open</Button>
        </li>)}
      </ul>
    </section>}
    <div className="dialog-actions">
      <Button className="link-button worktree-manage-link" isDisabled={busy}
        onPress={() => void services.commands.execute("worktree.manage", { workspaceId: repository.id })}>Manage worktrees…</Button>
      <Button className="wb-button" onPress={close}>Cancel</Button>
      <Button type="submit" className="wb-button primary-button" isDisabled={!name || taken || busy}>{busy ? "Creating…" : "Create worktree"}</Button>
    </div>
  </form>;
}
