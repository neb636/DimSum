import { z } from "zod";
import type { PromptCondition } from "./prompt-options";
import { MAX_ATTACHMENT_BYTES } from "./prompt-attachments";
import { defaultInstructions } from "./default-instructions";
import type { SourceControlAction } from "./models";
import { worktreeNameIn } from "./workspace-tree";

export const workbenchViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  state: z.unknown().optional(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  kind: z.enum(["folder", "files"]).optional(),
  parentId: z.string().optional(),
  // A bad icon falls back to the folder rather than failing validation, which would discard the whole saved state.
  icon: z.string().max(64 * 1024).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/).optional().catch(undefined),
  disabledInstructionIds: z.array(z.string()).optional(),
  views: z.array(workbenchViewSchema).max(1000),
  activeViewId: z.string().optional(),
});

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  scope: z.enum(["global", "workspace"]),
  workspaceId: z.string().optional(),
});

export const promptConditionSchema: z.ZodType<PromptCondition> = z.lazy(() => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all"), conditions: z.array(promptConditionSchema) }),
  z.object({ kind: z.literal("any"), conditions: z.array(promptConditionSchema) }),
  z.object({ kind: z.literal("not"), condition: promptConditionSchema }),
  z.object({ kind: z.literal("isOn"), option: z.string() }),
  z.object({ kind: z.literal("isChoice"), option: z.string(), choice: z.string() }),
  z.object({ kind: z.literal("harness"), harness: z.string() }),
]));

const promptOptionChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  text: z.string(),
  description: z.string().optional(),
});

const optionFieldsSchema = {
  id: z.string().min(1),
  label: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  when: promptConditionSchema.optional(),
  display: z.enum(["list", "segmented", "dropdown"]).optional(),
  resetAfterSend: z.boolean().optional(),
};

export const promptOptionDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({ ...optionFieldsSchema, kind: z.literal("toggle"), defaultOn: z.boolean(), text: z.string() }),
  z.object({ ...optionFieldsSchema, kind: z.literal("select"), defaultChoice: z.string(), choices: z.array(promptOptionChoiceSchema) }),
  z.object({ ...optionFieldsSchema, kind: z.literal("multiSelect"), defaultChoices: z.array(z.string()), choices: z.array(promptOptionChoiceSchema) }),
  z.object({ ...optionFieldsSchema, kind: z.literal("text"), placeholder: z.string(), defaultValue: z.string(),
    maxLength: z.number().int().min(1).max(10_000), template: z.string() }),
]);

export const storedPromptOptionSchema = z.object({
  scope: z.enum(["global", "workspace"]),
  workspaceId: z.string().optional(),
  option: promptOptionDefinitionSchema,
});

/** `.workbench/instructions.json`: instructions checked into a workspace and shared with everyone who works there. */
export const repoInstructionsFileSchema = z.object({
  version: z.literal(1),
  instructions: z.array(promptOptionDefinitionSchema),
});

export const layoutStateSchema = z.object({
  leftSize: z.number().min(0).max(100).optional(),
  rightSize: z.number().min(0).max(100).optional(),
  leftCollapsed: z.boolean().default(false),
  rightCollapsed: z.boolean().default(false),
  rightPanel: z.string().optional(),
});

export const persistedStateSchema = z.object({
  workspaces: z.array(workspaceSchema).max(1000).default([]),
  activeWorkspaceId: z.string().optional(),
  personas: z.array(personaSchema).default([]),
  instructionOptions: z.array(storedPromptOptionSchema).default([]),
  seededInstructionIds: z.array(z.string()).optional(),
  layout: layoutStateSchema.default({ leftCollapsed: false, rightCollapsed: false }),
  defaultAgentProviderId: z.string().optional(),
  featureSettings: z.record(z.string(), z.unknown()).optional(),
});

const legacyInstructionSchema = z.object({ id: z.string(), workspaceId: z.string(), content: z.string(), enabled: z.boolean() });

/** Converts state written before prompt options existed, then seeds default instructions not added before. */
export function migratePersistedState(input: unknown): unknown {
  return adoptWorktrees(seedDefaultInstructions(migrateLegacyInstructions(input)));
}

type LooseView = { id?: unknown; workspaceId?: unknown; state?: unknown; [key: string]: unknown };
type LooseWorkspace = { id?: unknown; path?: unknown; kind?: unknown; parentId?: unknown; views?: unknown; activeViewId?: unknown; disabledInstructionIds?: unknown; [key: string]: unknown };

/**
 * Before worktrees were listed in the sidebar, a session that ran in a new worktree stayed a tab of its repository's
 * workspace (only its `cwd` named the worktree), and "Open worktree" added the worktree as an unrelated workspace.
 * Both become worktrees of their repository: the workspace gains `parentId`, and each such tab moves into the
 * worktree it works in, keeping its `cwd` so its conversation still resumes. Running it again changes nothing.
 */
function adoptWorktrees(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.workspaces)) return input;
  const isFolder = (item: LooseWorkspace) => item.kind !== "files" && typeof item.id === "string" && typeof item.path === "string" && item.path !== "";
  let workspaces = (source.workspaces as LooseWorkspace[]).map((item) => ({ ...item }));
  const byId = new Map(workspaces.map((item) => [item.id, item]));
  let changed = false;
  // Worktrees opened as workspaces of their own. A parent that is gone, or not a folder, leaves a workspace on its own.
  const parents = new Map<LooseWorkspace, LooseWorkspace | undefined>();
  for (const item of workspaces) {
    if (!isFolder(item)) continue;
    const parent = item.parentId !== undefined
      ? byId.get(item.parentId)
      : workspaces.find((other) => other !== item && isFolder(other) && worktreeNameIn(other.path as string, item.path as string));
    parents.set(item, parent && parent !== item && isFolder(parent) ? parent : undefined);
  }
  // A worktree of a worktree belongs to the repository at the top; a loop has no top, so its members stand alone.
  const adopted = new Map<unknown, unknown>();
  for (const item of workspaces) {
    if (!isFolder(item)) continue;
    const seen = new Set([item]);
    let parent = parents.get(item);
    while (parent && parents.get(parent) && !seen.has(parent)) { seen.add(parent); parent = parents.get(parent); }
    const parentId = parent && !seen.has(parent) ? parent.id : undefined;
    if (item.parentId !== parentId) {
      if (parentId !== undefined) adopted.set(item.id, parentId);
      item.parentId = parentId;
      changed = true;
    }
  }
  // A worktree shares its repository's personas and instructions, so what was kept for it on its own goes to the
  // repository, and what it had turned off stays off.
  let { personas, instructionOptions } = source;
  if (adopted.size) {
    const repoint = (item: unknown) => {
      const keyed = item as { workspaceId?: unknown } | null;
      return keyed && adopted.has(keyed.workspaceId) ? { ...keyed, workspaceId: adopted.get(keyed.workspaceId) } : item;
    };
    if (Array.isArray(personas)) personas = personas.map(repoint);
    if (Array.isArray(instructionOptions)) instructionOptions = instructionOptions.map(repoint);
    for (const [childId, parentId] of adopted) {
      const child = byId.get(childId);
      const parent = byId.get(parentId);
      const off = Array.isArray(child?.disabledInstructionIds) ? child.disabledInstructionIds : [];
      if (parent && off.length) parent.disabledInstructionIds = [...new Set([...(Array.isArray(parent.disabledInstructionIds) ? parent.disabledInstructionIds : []), ...off])];
    }
  }
  let activeWorkspaceId = source.activeWorkspaceId;
  // Tabs working in a worktree of their workspace move into that worktree.
  const added: LooseWorkspace[] = [];
  for (const repository of workspaces) {
    if (!isFolder(repository) || repository.parentId !== undefined || !Array.isArray(repository.views)) continue;
    const staying: LooseView[] = [];
    for (const view of repository.views as LooseView[]) {
      const cwd = typeof view.state === "object" && view.state !== null ? (view.state as { cwd?: unknown }).cwd : undefined;
      const name = typeof cwd === "string" ? worktreeNameIn(repository.path as string, cwd) : undefined;
      if (!name) { staying.push(view); continue; }
      let worktree = [...workspaces, ...added].find((item) => isFolder(item) && worktreeNameIn(repository.path as string, item.path as string) === name);
      if (!worktree) {
        worktree = { id: `${repository.id as string}-wt-${name}`, name, path: cwd, parentId: repository.id, views: [] };
        added.push(worktree);
      }
      const views = Array.isArray(worktree.views) ? worktree.views as LooseView[] : [];
      worktree.views = [...views, { ...view, workspaceId: worktree.id }];
      if (repository.activeViewId === view.id) {
        worktree.activeViewId = view.id;
        if (activeWorkspaceId === repository.id) activeWorkspaceId = worktree.id;
      } else if (worktree.activeViewId === undefined) worktree.activeViewId = view.id;
      changed = true;
    }
    if (staying.length !== repository.views.length) {
      if (!staying.some((view) => view.id === repository.activeViewId)) repository.activeViewId = staying.at(-1)?.id;
      repository.views = staying;
    }
  }
  if (!changed) return input;
  workspaces = [...workspaces, ...added];
  return { ...source, workspaces, activeWorkspaceId, ...(adopted.size ? { personas, instructionOptions } : {}) };
}

function migrateLegacyInstructions(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const source = input as Record<string, unknown>;
  if (source.instructionOptions !== undefined || !Array.isArray(source.appendedInstructions)) return input;
  const instructionOptions = source.appendedInstructions.flatMap((item) => {
    const legacy = legacyInstructionSchema.safeParse(item);
    if (!legacy.success || !legacy.data.content.trim()) return [];
    const { id, workspaceId, content, enabled } = legacy.data;
    const label = content.trim().split("\n")[0].slice(0, 60);
    return [{ scope: "workspace", workspaceId, option: { id, kind: "toggle", label, category: "Custom", defaultOn: enabled, text: content } }];
  });
  return { ...source, instructionOptions };
}

/**
 * Defaults are ordinary global instructions the person may edit or delete. Each is added once: its id is recorded
 * in `seededInstructionIds`, and an id already in use (such as an edited default) is never replaced.
 */
export function seedDefaultInstructions(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const source = input as Record<string, unknown>;
  const seeded = Array.isArray(source.seededInstructionIds) ? source.seededInstructionIds.filter((id): id is string => typeof id === "string") : [];
  const existing = Array.isArray(source.instructionOptions) ? source.instructionOptions : [];
  const usedIds = new Set(existing.map((item) => (item as { option?: { id?: unknown } } | null)?.option?.id));
  const added = defaultInstructions.filter((option) => !seeded.includes(option.id) && !usedIds.has(option.id));
  if (!added.length && defaultInstructions.every((option) => seeded.includes(option.id))) return input;
  return {
    ...source,
    instructionOptions: [...added.map((option) => ({ scope: "global", option })), ...existing],
    seededInstructionIds: [...new Set([...seeded, ...defaultInstructions.map((option) => option.id)])],
  };
}

export const ptyCreateOptionsSchema = z.object({
  cwd: z.string().min(1),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
  viewId: z.string().min(1).max(200).optional(),
});

export const ptyInputSchema = z.object({
  sessionId: z.string(),
  data: z.string().max(1024 * 1024),
});

export const ptyResizeSchema = z.object({
  sessionId: z.string(),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
});

export const ptyTerminateSchema = z.object({ sessionId: z.string() });

export const agentSessionCreateOptionsSchema = z.object({
  providerId: z.string().min(1),
  workspacePath: z.string().min(1),
  viewId: z.string().min(1),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
  resume: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("id"), id: z.uuid() }),
    z.object({ kind: z.literal("latest") }),
    z.object({ kind: z.literal("pick") }),
  ]).optional(),
  settings: z.object({ model: z.string().min(1).max(100), effort: z.string().min(1).max(20).optional() }).optional(),
});

export const agentPromptSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1).max(500_000),
  intent: z.enum(["default", "plan"]),
});

export const agentSessionActionSchema = z.object({ sessionId: z.string().min(1) });

export const attachmentSaveSchema = z.object({
  viewId: z.string().min(1).max(200),
  name: z.string().min(1).max(1024),
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= MAX_ATTACHMENT_BYTES, "That file is too large to attach."),
});
export const attachmentLocationSchema = z.object({ viewId: z.string().min(1).max(200), id: z.uuid() });

export const fileLocationSchema = z.object({ root: z.string().min(1), path: z.string().max(4096) });
export const fileFindSchema = z.object({ root: z.string().min(1), query: z.string().max(256) });
export const workspaceRootSchema = z.object({ root: z.string().min(1) });
export const commitSchema = z.object({ root: z.string().min(1), message: z.string().trim().min(1).max(10_000), stagedOnly: z.boolean().optional(), amend: z.boolean().optional() });
export const generateCommitMessageSchema = z.object({ root: z.string().min(1), providerId: z.string().min(1).max(100).optional(), stagedOnly: z.boolean().optional() });
const commitIdSchema = z.string().regex(/^[0-9a-f]{7,64}$/);
export const sourceControlActionSchema = z.object({ root: z.string().min(1), action: z.enum(["sync", "pull", "pullRebase", "push", "fetch", "fetchPrune", "stageAll", "unstageAll", "discardAll", "undoLastCommit", "stash", "stashIncludeUntracked", "continueOperation", "abortOperation"] satisfies SourceControlAction[]) });
export const sourceControlPathsSchema = z.object({ root: z.string().min(1), paths: z.array(z.string().min(1).max(4096)).min(1).max(5000) });
export const sourceControlBranchActionSchema = z.object({ root: z.string().min(1), action: z.enum(["create", "delete", "merge", "rebase"]), target: z.string().min(1).max(500) });
export const sourceControlHistorySchema = z.object({ root: z.string().min(1), skip: z.number().int().min(0), limit: z.number().int().min(1).max(500) });
export const sourceControlCommitSchema = z.object({ root: z.string().min(1), id: commitIdSchema });
export const sourceControlCommitFileSchema = z.object({ root: z.string().min(1), id: z.union([commitIdSchema, z.literal("index")]), path: z.string().min(1).max(4096), originalPath: z.string().min(1).max(4096).optional() });
export const sourceControlStashActionSchema = z.object({ root: z.string().min(1), action: z.enum(["apply", "pop", "drop"]), id: commitIdSchema });
export const createWorktreeSchema = z.object({ root: z.string().min(1), branch: z.string().min(1).max(200), base: z.string().min(1).max(500).optional() });
export const openWorktreeSchema = z.object({ root: z.string().min(1), path: z.string().min(1).max(4096), adopting: z.boolean().optional() });
export const removeWorktreeSchema = z.object({ root: z.string().min(1), path: z.string().min(1).max(4096), force: z.boolean().optional() });
export const baseBranchesSchema = z.object({ root: z.string().min(1), refresh: z.boolean().optional() });
export const checkoutSchema = z.object({ root: z.string().min(1), branch: z.string().min(1).max(200) });
export const fileWriteSchema = z.object({ root: z.string().min(1), path: z.string().min(1).max(4096), content: z.string().max(2 * 1024 * 1024), expectedHash: z.string().max(64).nullable() });
export const fileSearchSchema = z.object({ root: z.string().min(1), query: z.string().min(1).max(256), caseSensitive: z.boolean().optional(), regex: z.boolean().optional(), directory: z.string().max(4096).optional() });
export const fileExistsSchema = z.object({ root: z.string().min(1), paths: z.array(z.string().min(1).max(1024)).max(200) });
export const fileCreateSchema = z.object({ root: z.string().min(1), path: z.string().min(1).max(4096), kind: z.enum(["file", "directory"]) });
export const fileRenameSchema = z.object({ root: z.string().min(1), from: z.string().min(1).max(4096), to: z.string().min(1).max(4096) });
export const fileAtSchema = z.object({ root: z.string().min(1), path: z.string().min(1).max(4096), base: z.enum(["head", "default"]) });

const operationLocation = fileLocationSchema;
export const fileOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), target: operationLocation, entryKind: z.enum(["file", "directory"]) }),
  z.object({ kind: z.literal("rename"), source: operationLocation, target: operationLocation }),
  z.object({ kind: z.literal("transfer"), sources: z.array(operationLocation).min(1).max(5000), destination: operationLocation, move: z.boolean(), collision: z.enum(["error", "keep-both", "skip"]) }),
  z.object({ kind: z.literal("duplicate"), sources: z.array(operationLocation).min(1).max(5000) }),
  z.object({ kind: z.literal("trash"), sources: z.array(operationLocation).min(1).max(5000) }),
  z.object({ kind: z.enum(["undo", "redo", "status"]) }),
]);
