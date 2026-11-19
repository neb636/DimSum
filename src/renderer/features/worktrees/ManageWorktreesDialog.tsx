import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Checkbox, Dialog, GridList, GridListItem, Heading, Modal, ModalOverlay, ToggleButton, ToggleButtonGroup, type Selection,
} from "react-aria-components";
import type { Workspace, WorktreeDetails } from "../../../shared/models";
import { isFilesWorkspace } from "../../../shared/files-workspace";
import { errorMessage } from "../../core/errors";
import { services } from "../../core/services";
import { confirmDestructive } from "../../ui/confirm";
import { IconButton } from "../../ui/controls";
import { BranchIcon, CheckIcon, CloseIcon, LockIcon, MinusIcon, RefreshIcon, SparkIcon, TrashIcon } from "../../ui/icons";
import { useWorkbenchStore } from "../../state/workbench-store";
import { relativeTime } from "../source-control/source-control-store";
import { removeWorktree, useWorktreeManager, workspaceAt } from "./worktrees";

const DAY = 86_400_000;
const AGES = [
  { id: "7", label: "1 week", span: "week", days: 7 },
  { id: "14", label: "2 weeks", span: "2 weeks", days: 14 },
  { id: "30", label: "1 month", span: "month", days: 30 },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const nameOf = (worktree: WorktreeDetails) => worktree.branch ?? worktree.path.split(/[\\/]/).at(-1) ?? worktree.path;
const listNames = (names: string[]) => names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;

/** Mounted once by the shell; opened with the `worktree.manage` command. */
export function ManageWorktreesDialog() {
  const repositoryId = useWorktreeManager((state) => state.repositoryId);
  const repository = useWorkbenchStore((state) => state.workspaces.find((item) => item.id === repositoryId && !isFilesWorkspace(item)));
  if (!repository) return null;
  const close = () => useWorktreeManager.setState({ repositoryId: undefined });
  return <ModalOverlay className="wb-modal-overlay confirm-overlay" isOpen isDismissable onOpenChange={(open) => { if (!open) close(); }}>
    <Modal className="wb-modal worktree-manager-modal confirm-modal">
      <Dialog className="wb-dialog worktree-manager" aria-label={`Worktrees of ${repository.name}`}>
        <WorktreeManager key={repository.id} repository={repository} close={close} />
      </Dialog>
    </Modal>
  </ModalOverlay>;
}

type Load = { status: "loading" } | { status: "ready"; worktrees: WorktreeDetails[] } | { status: "error"; error: string };
type Outcome = { tone: "done" | "error"; text: string };

function WorktreeManager({ repository, close }: { repository: Workspace; close: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ageId, setAgeId] = useState("14");
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>();
  const [previewStale, setPreviewStale] = useState(false);
  // Re-rendered as workspaces open and close, so the Open badges stay right.
  useWorkbenchStore((state) => state.workspaces);

  const refresh = useCallback(async () => {
    setLoad((current) => current.status === "ready" ? current : { status: "loading" });
    try {
      const worktrees = await window.workbench.sourceControl.worktreeDetails(repository.path);
      setLoad({ status: "ready", worktrees: [...worktrees].sort((a, b) => a.lastActivityAt - b.lastActivityAt) });
      setSelected((current) => new Set([...current].filter((path) => worktrees.some((item) => item.path === path))));
    } catch (failure) {
      setLoad({ status: "error", error: errorMessage(failure) });
    }
  }, [repository.path]);
  useEffect(() => { void refresh(); }, [refresh]);

  const worktrees = useMemo(() => load.status === "ready" ? load.worktrees : [], [load]);
  const age = AGES.find((item) => item.id === ageId) ?? AGES[1];
  const openPaths = new Set(worktrees.filter((item) => workspaceAt(repository.id, item.path)).map((item) => item.path));
  const idle = worktrees.filter((item) => !item.locked && item.lastActivityAt < Date.now() - age.days * DAY);
  // The quick clean-up leaves alone anything that would lose work or is in use: uncommitted changes, or open in the sidebar.
  const stale = idle.filter((item) => item.changes === 0 && !openPaths.has(item.path));
  const kept = idle.length - stale.length;
  const staleKeys = new Set(stale.map((item) => item.path));
  const selectable = worktrees.filter((item) => !item.locked && !removing.has(item.path));
  const busy = removing.size > 0;

  const remove = async (targets: WorktreeDetails[]) => {
    if (!targets.length || busy) return;
    const dirty = targets.filter((item) => item.changes > 0);
    const open = targets.filter((item) => openPaths.has(item.path));
    const single = targets.length === 1 ? targets[0] : undefined;
    const confirmed = await confirmDestructive({
      title: single ? "Delete worktree" : `Delete ${plural(targets.length, "worktree")}`,
      message: single ? "Are you sure you want to delete the following worktree?" : "Are you sure you want to delete the following worktrees?",
      warning: <><strong>Warning:</strong> This <strong>deletes {single ? "its folder" : "their folders"} from disk</strong> and cannot be undone. {single ? "Its branch is" : "Their branches are"} kept.
        {dirty.length > 0 && <> <strong>{single ? "Its uncommitted changes will be lost." : `${dirty.length} of them ${dirty.length === 1 ? "has" : "have"} uncommitted changes, which will be lost.`}</strong></>}
        {open.length > 0 && <> {single ? "It is" : `${open.length} ${open.length === 1 ? "is" : "are"}`} open in the sidebar: {single ? "its" : "their"} tabs close, stopping any running sessions and terminals.</>}</>,
      subject: single
        ? { icon: <BranchIcon size={20} />, name: nameOf(single), detail: describe(single, openPaths.has(single.path)), meta: single.path }
        : { icon: <BranchIcon size={20} />, name: plural(targets.length, "worktree"), detail: listNames(targets.map(nameOf)) },
      confirmLabel: single ? "Yes, Delete Worktree" : `Yes, Delete ${targets.length}`,
    });
    if (!confirmed) return;
    setOutcome(undefined);
    setRemoving(new Set(targets.map((item) => item.path)));
    const failures: string[] = [];
    // One at a time: git keeps the list of worktrees in one place, and parallel removals contend for it.
    for (const target of targets) {
      try {
        await removeWorktree(repository.id, target.path, target.changes > 0);
        setLoad((current) => current.status === "ready" ? { ...current, worktrees: current.worktrees.filter((item) => item.path !== target.path) } : current);
      } catch (failure) { failures.push(`${nameOf(target)}: ${errorMessage(failure)}`); }
      setRemoving((current) => { const next = new Set(current); next.delete(target.path); return next; });
    }
    const removed = targets.length - failures.length;
    setSelected(new Set());
    await refresh();
    setOutcome(failures.length
      ? { tone: "error", text: `${removed ? `Deleted ${plural(removed, "worktree")}. ` : ""}Couldn’t delete ${failures.join("; ")}` }
      : { tone: "done", text: `Deleted ${plural(removed, "worktree")}. ${removed === 1 ? "Its branch was" : "Their branches were"} kept.` });
  };

  const selectedItems = worktrees.filter((item) => selected.has(item.path));
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.path));
  const someSelected = selectedItems.length > 0 && !allSelected;
  const onSelectionChange = (keys: Selection) => setSelected(keys === "all" ? new Set(selectable.map((item) => item.path)) : new Set([...keys].map(String)));

  return <div className="worktree-manager-body">
    <div className="confirm-header">
      <div>
        <Heading slot="title">Worktrees</Heading>
        <p>Every other checkout of <strong>{repository.name}</strong>. Deleting one removes its folder from disk; its branch stays.</p>
      </div>
      <div className="worktree-manager-header-actions">
        <IconButton label="Refresh" isDisabled={busy || load.status === "loading"} onPress={() => void refresh()}><RefreshIcon size={14} /></IconButton>
        <IconButton label="Close" className="confirm-close" onPress={close}><CloseIcon size={14} /></IconButton>
      </div>
    </div>

    <section className={`worktree-cleanup ${stale.length ? "has-stale" : ""}`} aria-labelledby="worktree-cleanup-title">
      <span className="worktree-cleanup-icon" aria-hidden="true"><SparkIcon size={16} /></span>
      <div className="worktree-cleanup-copy">
        <h3 id="worktree-cleanup-title">Clean up idle worktrees</h3>
        <p>{load.status !== "ready"
          ? "Checking when each worktree was last used…"
          : stale.length
            ? <><strong>{plural(stale.length, "worktree")}</strong> {stale.length === 1 ? "has" : "have"} had no commits or file changes in the last {age.span}.{kept > 0 && <> {kept} more {kept === 1 ? "is" : "are"} left alone for having uncommitted changes or being open in the sidebar.</>}</>
            : kept
              ? <>{plural(kept, "idle worktree")} {kept === 1 ? "has" : "have"} uncommitted changes or {kept === 1 ? "is" : "are"} open in the sidebar, so {kept === 1 ? "it is" : "they are"} left alone. Select {kept === 1 ? "it" : "them"} below to delete anyway.</>
              : worktrees.length ? `Every ${worktrees.some((item) => item.locked) ? "unlocked " : ""}worktree has been used in the last ${age.span}.` : "There are no worktrees to clean up."}</p>
        <div className="worktree-cleanup-controls">
          <span className="worktree-cleanup-label" id="worktree-age-label">Idle for</span>
          <ToggleButtonGroup aria-labelledby="worktree-age-label" className="segmented worktree-age" selectionMode="single" disallowEmptySelection isDisabled={busy}
            selectedKeys={[ageId]} onSelectionChange={(keys) => { const key = [...keys][0]; if (key !== undefined) setAgeId(String(key)); }}>
            {AGES.map((item) => <ToggleButton key={item.id} id={item.id} className="segment">{item.label}</ToggleButton>)}
          </ToggleButtonGroup>
        </div>
      </div>
      <Button className="wb-button danger-button worktree-cleanup-button" isDisabled={!stale.length || busy}
        onHoverChange={setPreviewStale} onFocusChange={setPreviewStale} onPress={() => void remove(stale)}>
        <TrashIcon size={14} />{stale.length ? `Delete ${stale.length} idle` : "Nothing idle"}
      </Button>
    </section>

    <section className="worktree-list-section" aria-labelledby="worktree-list-title">
      <header className="worktree-list-header">
        {selectable.length > 0 && <Checkbox className="wb-checkbox" aria-label="Select all worktrees" isSelected={allSelected} isIndeterminate={someSelected} isDisabled={busy}
          onChange={(on) => setSelected(on ? new Set(selectable.map((item) => item.path)) : new Set())}>
          <span className="checkbox-box">{someSelected ? <MinusIcon size={11} /> : <CheckIcon size={11} />}</span>
        </Checkbox>}
        <h3 id="worktree-list-title">{load.status === "ready" ? plural(worktrees.length, "worktree") : "Worktrees"}</h3>
        {worktrees.length > 1 && <small>Least recently used first</small>}
      </header>
      {load.status === "loading" && <ul className="worktree-skeleton" aria-label="Loading worktrees">{[0, 1, 2].map((key) => <li key={key}><span /><span /></li>)}</ul>}
      {load.status === "error" && <p role="alert" className="agent-error worktree-list-error">Couldn’t list worktrees: {load.error}</p>}
      {load.status === "ready" && <GridList aria-labelledby="worktree-list-title" className="worktree-list" items={worktrees.map((item) => ({ ...item, id: item.path }))}
        selectionMode="multiple" selectionBehavior="toggle" selectedKeys={selected} onSelectionChange={onSelectionChange}
        disabledKeys={worktrees.filter((item) => item.locked || removing.has(item.path)).map((item) => item.path)}
        renderEmptyState={() => <div className="worktree-empty">
          <span aria-hidden="true"><BranchIcon size={18} /></span>
          <strong>No other worktrees</strong>
          <p>Worktrees of {repository.name} appear here once you create one.</p>
          <Button className="wb-button" onPress={() => void services.commands.execute("worktree.new", { workspaceId: repository.id })}>New worktree…</Button>
        </div>}>
        {(item) => {
          const isOpen = openPaths.has(item.path);
          const isRemoving = removing.has(item.path);
          return <GridListItem id={item.id} textValue={nameOf(item)}
            className={`worktree-row ${previewStale && staleKeys.has(item.path) ? "is-previewed" : ""} ${isRemoving ? "is-removing" : ""}`}>
            <Checkbox slot="selection" className="wb-checkbox"><span className="checkbox-box"><CheckIcon size={11} /></span></Checkbox>
            <span className="worktree-row-icon" aria-hidden="true">{item.locked ? <LockIcon size={14} /> : <BranchIcon size={14} />}</span>
            <span className="worktree-row-copy">
              <span className="worktree-row-title">
                <strong className={item.branch ? "" : "is-detached"}>{nameOf(item)}</strong>
                {!item.branch && <span className="worktree-chip">Detached</span>}
                {isOpen && <span className="worktree-chip is-open">Open</span>}
                {item.changes > 0 && <span className="worktree-chip is-dirty">{plural(item.changes, "change")}</span>}
                {item.locked && <span className="worktree-chip">Locked</span>}
              </span>
              <small title={item.path}><bdi>{shortPath(item.path, repository.path)}</bdi></small>
            </span>
            <span className="worktree-row-age" title={new Date(item.lastActivityAt).toLocaleString()}>
              {isRemoving ? "Deleting…" : relativeTime(item.lastActivityAt / 1000)}
            </span>
            <IconButton label={item.locked ? "Locked worktrees can’t be deleted" : `Delete ${nameOf(item)}`} className="worktree-row-delete"
              isDisabled={busy || item.locked} onPress={() => void remove([item])}><TrashIcon size={14} /></IconButton>
          </GridListItem>;
        }}
      </GridList>}
    </section>

    {outcome && <p role="status" className={`worktree-outcome is-${outcome.tone}`}>{outcome.text}</p>}

    <div className="dialog-actions worktree-manager-actions">
      {selectedItems.length > 0
        ? <span className="worktree-selection">
          {selectedItems.length} selected
          <Button className="link-button" isDisabled={busy} onPress={() => setSelected(new Set())}>Clear</Button>
        </span>
        : <span className="worktree-selection is-hint">Select worktrees to delete several at once.</span>}
      <Button className="wb-button" onPress={close}>Done</Button>
      <Button className="wb-button danger-button" isDisabled={!selectedItems.length || busy} onPress={() => void remove(selectedItems)}>
        <TrashIcon size={14} />{busy ? "Deleting…" : selectedItems.length ? `Delete ${selectedItems.length}` : "Delete"}
      </Button>
    </div>
  </div>;
}

function describe(worktree: WorktreeDetails, open: boolean): string {
  return [
    worktree.changes ? plural(worktree.changes, "uncommitted change") : "No uncommitted changes",
    `last used ${relativeTime(worktree.lastActivityAt / 1000)}`,
    open ? "open in the sidebar" : "",
  ].filter(Boolean).join(" · ");
}

/** Beside the repository (where new worktrees go), shown from its parent folder; anywhere else, in full. */
function shortPath(path: string, repositoryPath: string): string {
  const parent = repositoryPath.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]+$/, "");
  return parent && path.startsWith(`${parent}/`) ? path.slice(parent.length + 1) : path;
}
