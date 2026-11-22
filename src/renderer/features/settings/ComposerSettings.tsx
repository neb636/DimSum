import { Switch } from "react-aria-components";
import { services } from "../../core/services";
import { useContributions } from "../../core/registry";
import { updatePreferences, usePreferences } from "../../state/preferences";
import { ComposerIcon } from "../../ui/icons";
import { SettingsCard } from "./settings-ui";

/** One switch per prompt menu (built-in or from an extension): a hidden menu is left out of the composer and its prompts. */
export function ComposerSettings({ workspaceId }: { workspaceId: string }) {
  useContributions();
  const { composer } = usePreferences();
  const menus = services.promptMenus.ordered(workspaceId);
  const setShown = (id: string, shown: boolean) => updatePreferences({
    composer: { ...composer, hiddenMenus: shown ? composer.hiddenMenus.filter((item) => item !== id) : [...composer.hiddenMenus, id] },
  });
  return <div className="settings-stack">
    <SettingsCard title="Menus" description="Dropdowns under the prompt. A hidden menu adds nothing to prompts until it's shown again." icon={<ComposerIcon size={16} />}>
      {menus.length === 0 && <p className="settings-row-help">No prompt menus are registered.</p>}
      {menus.map((menu) => {
        const Icon = menu.icon;
        return <Switch key={menu.id} className="settings-switch-row" isSelected={!composer.hiddenMenus.includes(menu.id)} onChange={(shown) => setShown(menu.id, shown)}>
          <span className="settings-switch-icon" aria-hidden="true"><Icon size={15} /></span>
          <span className="settings-row-copy"><span className="settings-row-label">Show {menu.label.toLowerCase()} dropdown</span>{menu.description && <span className="settings-row-help">{menu.description}</span>}</span>
          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        </Switch>;
      })}
    </SettingsCard>
  </div>;
}
