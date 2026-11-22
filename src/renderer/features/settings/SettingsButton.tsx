import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Modal, ModalOverlay, Tab, TabList, TabPanel, Tabs, type Key } from "react-aria-components";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Button } from "../../ui/controls";
import { ComposerIcon, ListChecksIcon, PaletteIcon, SettingsIcon, SlidersIcon, UserIcon } from "../../ui/icons";
import { InstructionsManager } from "../instructions/InstructionsManager";
import { PersonaManager } from "../personas/PersonaManager";
import { AppearanceSettings } from "./AppearanceSettings";
import { ComposerSettings } from "./ComposerSettings";
import { GeneralSettings } from "./GeneralSettings";

interface Section {
  id: string;
  label: string;
  description: string;
  icon: (props: { size?: number }) => ReactNode;
  content: (workspaceId: string) => ReactNode;
}

const sections: Section[] = [
  { id: "general", label: "General", description: "Built-in AI, storage and workspace trust.", icon: SlidersIcon, content: () => <GeneralSettings /> },
  { id: "appearance", label: "Appearance", description: "Theme, and the fonts of terminals and the file editor.", icon: PaletteIcon, content: () => <AppearanceSettings /> },
  { id: "composer", label: "Prompt composer", description: "Which menus the prompt composer shows.", icon: ComposerIcon, content: (workspaceId) => <ComposerSettings workspaceId={workspaceId} /> },
  { id: "personas", label: "Personas", description: "Ways of working an agent can take on for a prompt.", icon: UserIcon, content: (workspaceId) => <PersonaManager workspaceId={workspaceId} /> },
  { id: "instructions", label: "Instructions", description: "Reusable instructions added to prompts from the composer.", icon: ListChecksIcon, content: (workspaceId) => <InstructionsManager workspaceId={workspaceId} /> },
];

/** The sidebar's selection pill slides to the chosen section; it appears in place on open. */
function useSelectionPill(selected: Key) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number; animate: boolean }>();
  useLayoutEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>("[data-selected]");
    if (item) setPill((previous) => ({ top: item.offsetTop, height: item.offsetHeight, animate: previous !== undefined }));
  }, [selected]);
  return { listRef, pill };
}

export function SettingsButton() {
  const workspaceId = useWorkbenchStore((state) => state.activeWorkspaceId ?? state.workspaces[0]?.id ?? "");
  const [selected, setSelected] = useState<Key>("general");
  const { listRef, pill } = useSelectionPill(selected);
  const section = sections.find((item) => item.id === selected) ?? sections[0];
  return <DialogTrigger onOpenChange={(open) => { if (open) setSelected("general"); }}>
    <AriaButton className="sidebar-nav-item"><SettingsIcon size={15} /><span>Settings</span></AriaButton>
    <ModalOverlay className="settings-overlay" isDismissable>
      <Modal className="settings-window">
        <Dialog aria-label="Settings" className="settings-dialog">
          {({ close }) => <Tabs orientation="vertical" className="settings-layout" selectedKey={selected} onSelectionChange={setSelected}>
            <nav className="settings-nav" aria-label="Settings">
              <h2 className="settings-nav-title">Settings</h2>
              <div className="settings-nav-list" ref={listRef}>
                {pill && <span aria-hidden="true" className={`settings-nav-pill ${pill.animate ? "is-animated" : ""}`} style={{ transform: `translateY(${pill.top}px)`, height: pill.height }} />}
                <TabList aria-label="Settings sections" className="settings-tablist">
                  {sections.map((item, index) => {
                    const Icon = item.icon;
                    return <Tab key={item.id} id={item.id} className="settings-nav-item" style={{ "--settings-stagger": index } as CSSProperties}>
                      <Icon size={15} /><span>{item.label}</span>
                    </Tab>;
                  })}
                </TabList>
              </div>
            </nav>
            <section className="settings-main" aria-labelledby="settings-section-title">
              <header className="settings-main-header">
                {/* Keyed, so a new section's heading eases in with its content. */}
                <div key={section.id} className="settings-main-heading">
                  <h1 id="settings-section-title">{section.label}</h1>
                  <p>{section.description}</p>
                </div>
                <Button className="settings-done" onPress={close}>Done</Button>
              </header>
              <div className="settings-scroll">
                {sections.map((item) => <TabPanel key={item.id} id={item.id} className="settings-panel">{item.content(workspaceId)}</TabPanel>)}
              </div>
            </section>
          </Tabs>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  </DialogTrigger>;
}
