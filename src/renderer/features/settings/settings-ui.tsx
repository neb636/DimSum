import { useMemo, type ReactNode } from "react";
import { Button as AriaButton, Group, Input, Label, ListBox, ListBoxItem, NumberField, Popover, Select, SelectValue } from "react-aria-components";
import { FONT_SIZE_RANGE, isFontInstalled, monoFontStack, monoFonts } from "../../state/preferences";
import { ChevronDownIcon, MinusIcon, PlusIcon } from "../../ui/icons";

/** One bento card of settings: a title, a line on what it covers, then its rows. */
export function SettingsCard({ title, description, icon, children }: { title: string; description?: string; icon?: ReactNode; children: ReactNode }) {
  const id = `settings-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <section className="settings-card" aria-labelledby={id}>
    <header className="settings-card-header">
      {icon && <span className="settings-card-icon" aria-hidden="true">{icon}</span>}
      <div><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
    </header>
    <div className="settings-card-body">{children}</div>
  </section>;
}

/** A labelled control on the right of a card's row. `label` names the control for assistive technology too. */
export function SettingsRow({ label, help, children }: { label: string; help?: string; children?: ReactNode }) {
  return <div className="settings-row">
    <div className="settings-row-copy"><span className="settings-row-label">{label}</span>{help && <span className="settings-row-help">{help}</span>}</div>
    {children && <div className="settings-row-control">{children}</div>}
  </div>;
}

/** The monospace fonts installed on this computer, each shown in itself; the chosen one stays listed even when missing. */
export function FontSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const fonts = useMemo(() => monoFonts.filter((font) => font.id === value || isFontInstalled(font.family)).map((font) => ({ ...font, missing: !isFontInstalled(font.family) })), [value]);
  return <Select className="settings-select" selectedKey={value} onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
    <Label className="visually-hidden">{label}</Label>
    <AriaButton className="select-trigger"><SelectValue /><ChevronDownIcon size={14} /></AriaButton>
    <Popover className="wb-popover settings-font-popover">
      <ListBox items={fonts}>
        {(font) => <ListBoxItem id={font.id} textValue={font.label}>
          <div><span style={{ fontFamily: monoFontStack(font.id) }}>{font.label}</span>{font.missing && <small>Not installed</small>}</div>
        </ListBoxItem>}
      </ListBox>
    </Popover>
  </Select>;
}

/** A point size with − and + steppers; arrow keys and typing work too. */
export function FontSizeField({ label, value, onChange }: { label: string; value: number; onChange: (size: number) => void }) {
  return <NumberField aria-label={label} className="settings-stepper" value={value} minValue={FONT_SIZE_RANGE.min} maxValue={FONT_SIZE_RANGE.max} step={1}
    onChange={(size) => { if (Number.isFinite(size)) onChange(size); }}>
    <Group className="settings-stepper-group">
      <AriaButton slot="decrement" className="settings-stepper-button"><MinusIcon size={13} /></AriaButton>
      <Input className="settings-stepper-input" />
      <span className="settings-stepper-unit" aria-hidden="true">pt</span>
      <AriaButton slot="increment" className="settings-stepper-button"><PlusIcon size={13} /></AriaButton>
    </Group>
  </NumberField>;
}
