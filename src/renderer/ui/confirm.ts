/** A destructive action the person confirms: what goes, what is lost, and what the button says. */
import type { DestructiveConfirmation } from "@dimsum/sdk";
export type { DestructiveConfirmation } from "@dimsum/sdk";

/** Something more the person may choose to do along with the action, shown as a checkbox above the buttons. */
export interface ConfirmationOption {
  label: string;
  /** A line under the label: what choosing it does and doesn't do. */
  detail?: string;
  selected: boolean;
}

export type ConfirmationRequest = DestructiveConfirmation & { option?: ConfirmationOption };
/** Cancelled, or confirmed with the option's final state (false without one). */
type Answer = { confirmed: false } | { confirmed: true; option: boolean };

type Pending = ConfirmationRequest & { resolve: (answer: Answer) => void };
let pending: Pending | undefined;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

function ask(request: ConfirmationRequest): Promise<Answer> {
  pending?.resolve({ confirmed: false });
  return new Promise((resolve) => { pending = { ...request, resolve }; emit(); });
}

/** Asks before something is removed; resolves false when cancelled or dismissed. One question at a time: a new one cancels the last. */
export async function confirmDestructive(request: DestructiveConfirmation): Promise<boolean> {
  return (await ask(request)).confirmed;
}

/** `confirmDestructive` with an extra choice; resolves undefined when cancelled, else whether the option was chosen. */
export async function confirmDestructiveWithOption(request: DestructiveConfirmation, option: ConfirmationOption): Promise<boolean | undefined> {
  const answer = await ask({ ...request, option });
  return answer.confirmed ? answer.option : undefined;
}

export function answerConfirmation(confirmed: boolean, option = false): void {
  const current = pending;
  pending = undefined;
  current?.resolve(confirmed ? { confirmed, option } : { confirmed: false });
  emit();
}

export const pendingConfirmation = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: (): ConfirmationRequest | undefined => pending,
};
