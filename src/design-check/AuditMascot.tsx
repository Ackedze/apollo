import React, { useEffect, useRef, useState } from 'react';

export type AuditQuality = 'unchecked' | 'clean' | 'warning' | 'violation';
const labels = { unchecked: 'Проверка ещё не запускалась', clean: 'Нарушений не найдено', warning: 'Есть замечания, требующие проверки', violation: 'Найдены нарушения' };
export function AuditMascot({ checking, quality = 'unchecked', label }: { checking: boolean; quality?: AuditQuality; label?: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const node = body.current;
    if (!node || !visible) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0, x = 0, y = 0;
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0;
      node.style.setProperty('--gaze-x', '0px'); node.style.setProperty('--gaze-y', '0px');
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reduced?.matches || node.closest('[hidden]')) return;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = node.getBoundingClientRect();
        if (!bounds.width || node.closest('[hidden]') || reduced?.matches) { reset(); return; }
        const dx = x - bounds.left - bounds.width / 2, dy = y - bounds.top - bounds.height / 2;
        const distance = Math.max(160, Math.hypot(dx, dy));
        node.style.setProperty('--gaze-x', `${dx / distance * 8}px`);
        node.style.setProperty('--gaze-y', `${dy / distance * 6}px`);
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset); window.addEventListener('blur', reset);
    reduced?.addEventListener('change', reset);
    return () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset); reduced?.removeEventListener('change', reset); reset();
    };
  }, [visible]);
  return <div className={`apollo-mascot quality-${quality}${checking ? ' is-checking' : ''}${visible ? '' : ' is-paused'}`} role="img" aria-label={label || (checking ? 'Проверка выполняется' : labels[quality])}>
    <div ref={body} className="apollo-mascot-body" aria-hidden="true">
      <div className="apollo-mascot-gaze"><div className="apollo-mascot-eyes"><span /><span /></div></div>
    </div>
  </div>;
}
