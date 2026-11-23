'use strict';
// ReGlyph timings/easing; the host window is never resized.
const motions = new WeakMap();
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
function motion(element, frames, duration = 220, finish) {
  const previous = motions.get(element);
  if (previous) { motions.delete(element); previous.cancel(); }
  if (reducedMotion() || !element.animate) { finish?.(); return; }
  const animation = element.animate(frames, {duration,easing:'cubic-bezier(.2,.7,.2,1)'});
  motions.set(element,animation);
  animation.onfinish = () => {
    if (motions.get(element) !== animation) return;
    motions.delete(element); finish?.();
  };
}
const reveal = element => motion(element,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}]);
module.exports = {motion,reveal};
