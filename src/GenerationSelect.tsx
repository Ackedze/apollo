import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { OptionList } from "./design-check/v3/ui-app/components/OptionList";
import { OptionListCell } from "./design-check/v3/ui-app/components/OptionListCell";
import { PickerButton } from "./design-check/v3/ui-app/components/PickerButton";
import settingsStyles from "./design-check/v3/ui-app/components/TopSection.module.css";
import pickerStyles from "./design-check/v3/ui-app/components/PickerButton.module.css";

type PickerHandle = { close: (restoreFocus?: boolean) => void; focus: () => void; isOpen: () => boolean };
type PickerProps = {
  select: HTMLSelectElement;
  label?: string;
  onOpen: () => void;
  onRemove?: (option: HTMLOptionElement) => void;
};

const SelectPicker = forwardRef<PickerHandle, PickerProps>(function SelectPicker({ select, label, onOpen, onRemove }, ref) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = Array.from(select.options);
  const selected = options.find(option => option.value === select.value);
  const focus = () => wrap.current?.querySelector('button')?.focus();
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) focus(); };
  useImperativeHandle(ref, () => ({ close, focus, isOpen: () => open }));
  useEffect(() => { if (select.disabled) setOpen(false); }, [select.disabled]);
  useLayoutEffect(() => {
    const popup = menu.current, trigger = wrap.current?.querySelector('button');
    if (!open || !popup || !trigger) return;
    const bounds = trigger.getBoundingClientRect();
    popup.style.width = `${Math.min(onRemove ? 360 : 195, window.innerWidth - 16)}px`;
    const size = popup.getBoundingClientRect(), below = Math.max(0, innerHeight - bounds.bottom - 12), above = Math.max(0, bounds.top - 12);
    const flipped = size.height > below && above > below, height = Math.min(size.height, flipped ? above : below);
    popup.style.left = `${Math.max(8, Math.min(onRemove ? bounds.left : bounds.right - size.width, innerWidth - size.width - 8))}px`;
    popup.style.top = `${flipped ? bounds.top - height - 4 : bounds.bottom + 4}px`;
    popup.style.maxHeight = `${flipped ? above : below}px`;
    const outside = (event: Event) => { if (event.target instanceof Node && !popup.contains(event.target) && !wrap.current?.contains(event.target)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('scroll', outside, true); window.removeEventListener('resize', resize); };
  }, [open, onRemove]);

  const focusOption = (last = false) => requestAnimationFrame(() => {
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    (last ? buttons.at(-1) : buttons.find(button => button.getAttribute('aria-pressed') === 'true') ?? buttons[0])?.focus({ preventScroll: true });
  });

  return (
    <div ref={wrap} className="generation-select-picker" onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (event.key === 'Tab' && open && (event.shiftKey ? document.activeElement === buttons[0] : document.activeElement === buttons.at(-1))) { close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || select.disabled) return;
      event.preventDefault();
      if (!open) { onOpen(); setOpen(true); focusOption(event.key === 'ArrowUp' || event.key === 'End'); return; }
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    }}>
      <PickerButton label={label ?? selected?.textContent ?? ''} open={open} disabled={select.disabled}
        className="generation-picker-button" onPress={() => {
          if (open) close(); else { onOpen(); setOpen(true); focusOption(); }
        }} />
      {open && !select.disabled ? createPortal(
        <div ref={menu} className={settingsStyles.pickerOverlay + ' generation-select-menu'} role="group" aria-label={select.getAttribute('aria-label') ?? label ?? 'Платформа'}>
          <OptionList className={settingsStyles.pickerMenu + ' generation-option-list'}>
            {options.map(option => (
              <div key={option.value} className="generation-select-row">
                <OptionListCell label={option.textContent ?? ''} showLeadingIcon={false}
                  selected={option.value === select.value} disabled={option.disabled}
                  onPress={() => {
                    if (select.disabled || option.disabled) return;
                    select.value = option.value;
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    close();
                  }} />
                {onRemove && option.dataset.removable === 'true' ? <button type="button" className="generation-history-remove"
                  aria-label={'Удалить чат из истории: ' + option.textContent} title="Удалить чат из истории"
                  disabled={option.dataset.removeDisabled === 'true'} onClick={() => { close(false); onRemove(option); }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 2h6v2h4v2h-1l-1 12H5L4 6H3V4h4V2Zm2 2h2V3H9v1ZM6 6l.8 10h6.4L14 6H6Zm2 2h1v6H8V8Zm3 0h1v6h-1V8Z" /></svg>
                </button> : null}
              </div>
            ))}
          </OptionList>
        </div>, document.body
      ) : null}
    </div>
  );
});

export function mountGenerationSelect({ host, select, label, onOpen, onRemove }: PickerProps & { host: HTMLElement }) {
  select.hidden = true;
  select.tabIndex = -1;
  const slot = document.createElement('div');
  host.append(slot);
  const root = createRoot(slot), ref = React.createRef<PickerHandle>();
  const refresh = () => root.render(<SelectPicker ref={ref} select={select} label={label} onOpen={onOpen} onRemove={onRemove} />);
  flushSync(refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
  select.addEventListener('change', refresh);
  return {
    refresh,
    close: (restoreFocus = true) => ref.current?.close(restoreFocus),
    focus: () => { flushSync(refresh); ref.current?.focus(); },
    isOpen: () => ref.current?.isOpen() ?? false,
    destroy() { observer.disconnect(); select.removeEventListener('change', refresh); root.unmount(); slot.remove(); },
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
