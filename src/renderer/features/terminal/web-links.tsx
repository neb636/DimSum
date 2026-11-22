import { useWorkbenchStore } from "../../state/workbench-store";
import { confirmDestructive } from "../../ui/confirm";
import { GlobeIcon } from "../../ui/icons";

/**
 * Opens a web link clicked in a terminal in the default browser. The first one in a workspace asks; saying yes is
 * remembered for that workspace, and cancelling asks again next time.
 */
export async function openWebLink(workspaceId: string, uri: string): Promise<void> {
  let url: URL;
  try { url = new URL(uri); } catch { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const store = useWorkbenchStore.getState();
  if (!store.workspaces.find((workspace) => workspace.id === workspaceId)?.opensWebLinks) {
    const confirmed = await confirmDestructive({
      title: "Open link",
      message: "Open this link in your browser?",
      warning: <>Links in terminal output can point anywhere. Once you open one, <strong>links in this workspace open without asking</strong>.</>,
      subject: { icon: <GlobeIcon size={20} />, name: url.host, meta: url.href },
      confirmLabel: "Open Link",
      tone: "caution",
    });
    if (!confirmed) return;
    store.allowWebLinks(workspaceId);
  }
  // The main process's window-open handler hands http(s) URLs to the default browser and opens no window.
  window.open(url.href, "_blank");
}
