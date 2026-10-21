import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import assets from "./assets/finding-assets.json";

export function FindingCard({ title, tone = 'violation', location, library, actions, children, information }: {
  title: string; tone?: 'violation' | 'warning' | 'current'; location: React.ReactNode;
  library?: string | null;
  actions?: React.ReactNode; children?: React.ReactNode; information: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false), informationId = useId();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded || !dialog.current) return;
    const modal = dialog.current, opener = trigger.current;
    modal.showModal();
    return () => { modal.close(); if (opener?.isConnected) opener.focus(); };
  }, [expanded]);
  function focusObject(event: React.MouseEvent<HTMLElement>) {
    const target = event.target;
    if (event.defaultPrevented || event.button !== 0 || !(target instanceof Element)
      || target.closest('button, a, input, select, textarea, summary, [contenteditable="true"], [role="button"], [role="link"]')
      || document.getSelection()?.isCollapsed === false) return;
    event.currentTarget.querySelector<HTMLButtonElement>('[data-finding-focus]:enabled')?.click();
  }
  // The existing focus button supplies keyboard access; avoid nesting other actions in a button role.
  return <article className="apollo-finding-card" onClick={focusObject}>
    <div className="apollo-finding-row">
      <span className={`apollo-finding-status ${tone}`} role="img" aria-label={tone === 'violation' ? 'Нарушение' : tone === 'current' ? 'Актуально' : 'Нужна проверка'}>
        {tone === 'current' ? <span /> : <img src={tone === 'warning' ? assets.imgStatusWarning : assets.imgStatusCircle} width={36} height={36} alt="" />}
      </span>
      <div className="apollo-finding-content">
        <div className="apollo-finding-main"><h3>{title}</h3>{children}</div>
        <div className="apollo-finding-location">{location}{library && <>
          <span aria-hidden="true">/</span><span className="apollo-finding-library" title={library} aria-label={`Дизайн-система: ${library}`}>{library}</span>
        </>}</div>
      </div>
      <div className="apollo-finding-controls">{actions}
        <button ref={trigger} className="apollo-finding-info-toggle" type="button" aria-label="Сведения проверки" title="Сведения проверки"
          aria-haspopup="dialog" aria-controls={expanded ? informationId : undefined} onClick={() => setExpanded(true)}>
          <img src={assets.imgFixer} width={16} height={16} alt="" />
        </button>
      </div>
    </div>
    {expanded && createPortal(<dialog ref={dialog} className="apollo-finding-dialog" id={informationId} role="dialog" aria-modal="true" aria-labelledby={`${informationId}-title`}
      onCancel={event => { event.preventDefault(); setExpanded(false); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setExpanded(false); }}>
      <div className="apollo-finding-dialog-content">
        <header><h2 id={`${informationId}-title`}>Сведения проверки</h2><button type="button" aria-label="Закрыть сведения проверки" onClick={() => setExpanded(false)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button></header>
        <section className="apollo-finding-information-body">{information}</section>
      </div>
    </dialog>, document.body)}
  </article>;
}

export function FindingComparison({ property, before, after, beforeLabel, afterLabel, separator = ':' }: {
  property: string; before: string; after?: string; beforeLabel?: string; afterLabel?: string; separator?: string;
}) {
  return <div className="apollo-finding-comparison">
    <span>{property}{separator}</span>
    <strong title={beforeLabel ? `${beforeLabel}: ${before}` : before}><span className="design-check-sr-only">{beforeLabel ? `${beforeLabel}: ` : ''}</span>{before}</strong>
    {after !== undefined && <><span className="apollo-finding-arrow" aria-hidden="true">→</span>
      <strong title={afterLabel ? `${afterLabel}: ${after}` : after}><span className="design-check-sr-only">{afterLabel ? `${afterLabel}: ` : ''}</span>{after}</strong></>}
  </div>;
}
