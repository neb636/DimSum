import { useState } from "react";
import { Button } from "../../ui/controls";
import { Button as AriaButton, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from "react-aria-components";
import { services } from "../../core/services";
import { useContributions } from "../../core/registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { ChevronDownIcon, LockIcon, SparkIcon } from "../../ui/icons";
import { SettingsCard, SettingsRow } from "./settings-ui";
import { relistWorkspaceExtensions } from "../../extensions/workspace-extensions";
import { useDefaultCli } from "./default-cli";

export function GeneralSettings() {
  useContributions();
  const [storageNotice, setStorageNotice] = useState("");
  const { agents, current } = useDefaultCli();
  const setDefaultAgentProvider = useWorkbenchStore((state) => state.setDefaultAgentProvider);
  // Settings are app-wide; a workspace extension's section shows while its workspace is the active one.
  const activeWorkspaceId = useWorkbenchStore((state) => state.activeWorkspaceId ?? state.workspaces[0]?.id);
  return <div className="settings-stack general-settings">
    <SettingsCard title="Built-in AI" description="Runs built-in AI actions, such as writing commit messages. Agent sessions are chosen when you start them." icon={<SparkIcon size={16} />}>
      <SettingsRow label="Default CLI">
      <Select className="settings-select" placeholder="No CLI installed" selectedKey={current?.id ?? null} onSelectionChange={(key) => { if (key !== null) setDefaultAgentProvider(String(key)); }}>
        <Label className="visually-hidden">Default CLI</Label>
        <AriaButton className="select-trigger"><SelectValue /><ChevronDownIcon size={14} /></AriaButton>
        <Popover className="wb-popover">
          <ListBox items={agents}>
            {(agent) => <ListBoxItem id={agent.id} textValue={agent.label} isDisabled={!agent.available}>
              <div><span>{agent.label}</span>{!agent.available && <small>Not installed</small>}</div>
            </ListBoxItem>}
          </ListBox>
        </Popover>
      </Select>
      </SettingsRow>
    </SettingsCard>
    <SettingsCard title="Storage and trust" description="Drafts and attachments stay on this computer. Attachments remain available to saved conversations while their view exists. CLI conversation storage is managed by the CLI." icon={<LockIcon size={16} />}>
      <SettingsRow label="Attachments" help="Frees the space used by views you have closed.">
      <Button onPress={() => { void window.workbench.app.storageMaintenance(true).then((bytes) => setStorageNotice(`${Math.ceil(bytes / 1024 / 1024)} MB of attachments retained for open views.`)).catch(() => setStorageNotice("Could not clean attachment storage.")); }}>Remove attachments for closed views</Button>
      </SettingsRow>
      <SettingsRow label="Execution trust" help="Each workspace asks again before running its own extensions.">
      <Button onPress={() => { void window.workbench.app.revokeExecutionTrust().then(() => relistWorkspaceExtensions()).then(() => setStorageNotice("Workspace execution trust cleared. Workspace extensions stopped; running sessions keep their native permissions.")).catch(() => setStorageNotice("Could not clear execution trust.")); }}>Reset workspace execution trust</Button>
      </SettingsRow>
      {storageNotice && <p role="status" className="settings-notice">{storageNotice}</p>}
    </SettingsCard>
    {services.widgets.forSlot("settings.general", activeWorkspaceId).map(({ id, component: Section }) => <section key={id} className="settings-card settings-card-widget"><Section workspaceId={activeWorkspaceId} /></section>)}
  </div>;
}
