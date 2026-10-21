import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { OptionList } from "./design-check/v3/ui-app/components/OptionList";
import { OptionListCell } from "./design-check/v3/ui-app/components/OptionListCell";
import { PickerButton } from "./design-check/v3/ui-app/components/PickerButton";
import settingsStyles from "./design-check/v3/ui-app/components/TopSection.module.css";
import pickerStyles from "./design-check/v3/ui-app/components/PickerButton.module.css";

type PickerHandle = { close: (restoreFocus?: boolean) => void; isOpen: () => boolean };
type PickerProps = {
  select: HTMLSelectElement;
  label?: string;
  onOpen: () => void;
};

const SelectPicker = forwardRef<PickerHandle, PickerProps>(function SelectPicker({ select, label, onOpen }, ref) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = Array.from(select.options);
  const selected = options.find(option => option.value === select.value);
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) wrap.current?.querySelector('button')?.focus();
  };
  useImperativeHandle(ref, () => ({ close, isOpen: () => open }));
  useEffect(() => { if (select.disabled) setOpen(false); }, [select.disabled]);

  const focusOption = (last = false) => requestAnimationFrame(() => {
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    (last ? buttons.at(-1) : buttons.find(button => button.getAttribute('aria-pressed') === 'true') ?? buttons[0])?.focus();
  });

  return (
    <div ref={wrap} className="generation-select-picker" onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || select.disabled) return;
      event.preventDefault();
      if (!open) { onOpen(); setOpen(true); focusOption(event.key === 'ArrowUp' || event.key === 'End'); return; }
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }}>
      <PickerButton label={label ?? selected?.textContent ?? ''} open={open} disabled={select.disabled}
        className="generation-picker-button" onPress={() => {
          if (open) close(); else { onOpen(); setOpen(true); focusOption(); }
        }} />
      {open && !select.disabled ? (
        <div ref={menu} className="generation-select-menu" role="group" aria-label={label ?? select.getAttribute('aria-label') ?? 'Платформа'}>
          <OptionList className="generation-option-list">
            {options.map(option => (
              <OptionListCell key={option.value} label={option.textContent ?? ''} showLeadingIcon={false}
                selected={option.value === select.value} disabled={option.disabled}
                onPress={() => {
                  if (select.disabled || option.disabled) return;
                  // Keep the original controls and their existing generation handlers.
                  select.value = option.value;
                  select.dispatchEvent(new Event('input', { bubbles: true }));
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  close();
                }} />
            ))}
          </OptionList>
        </div>
      ) : null}
    </div>
  );
});

export function mountGenerationSelect({ host, select, label, onOpen }: PickerProps & { host: HTMLElement }) {
  select.hidden = true;
  select.tabIndex = -1;
  const slot = document.createElement('div');
  host.append(slot);
  const root = createRoot(slot), ref = React.createRef<PickerHandle>();
  const refresh = () => root.render(<SelectPicker ref={ref} select={select} label={label} onOpen={onOpen} />);
  flushSync(refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
  select.addEventListener('change', refresh);
  return {
    refresh,
    close: (restoreFocus = true) => ref.current?.close(restoreFocus),
    isOpen: () => ref.current?.isOpen() ?? false,
  };
}

export function styleGenerationSettings(panel: HTMLElement, toggle: HTMLElement) {
  panel.classList.add(settingsStyles.settingsPanel);
  toggle.classList.add(pickerStyles.button, 'generation-picker-button');
  panel.querySelectorAll<HTMLElement>('.generation-prompt-fields > div').forEach(field => {
    field.classList.add(settingsStyles.settingsField);
    field.querySelector('label')?.classList.add(settingsStyles.settingsLabel);
  });
}
