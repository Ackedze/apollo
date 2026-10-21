const {mountGenerationSelect,styleGenerationSettings}=require("../../GenerationSelect");
require("../menu.css");
function mountGenerationChat({ root, controller }) {
  const input = root.querySelector('#generation-prompt');
  const form = input.form;
  const toggle = root.querySelector('#generation-settings-toggle');
  const settings = root.querySelector('#generation-settings');
  const conversation = root.querySelector('#generation-conversation');
  const target = root.querySelector('#agent-generation-target');
  const targetHolder = root.querySelector('#generation-target-holder');
  if (target && targetHolder) {
    root.querySelector('label[for="agent-generation-target"]')?.remove();
    target.setAttribute('aria-label', 'Где собирать');
    targetHolder.append(target);
  }
  styleGenerationSettings(settings,toggle);
  const pickers=[];
  function close(restoreFocus = true) {
    pickers.forEach(picker=>picker.close(false));
    if (settings.hidden) return;
    settings.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  }
  if(target&&targetHolder)pickers.push(mountGenerationSelect({host:targetHolder,select:target,onOpen:()=>close(false)}));
  const platform=root.querySelector('#generation-platform');
  if(platform)pickers.push(mountGenerationSelect({host:platform.parentElement,select:platform,onOpen:()=>pickers.forEach(picker=>picker.close(false))}));
  toggle.onclick = () => {
    if (!settings.hidden) { close(); return; }
    pickers.forEach(picker=>picker.close(false));
    settings.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    settings.querySelector('button').focus();
  };
  root.querySelector('#generation-settings-close').onclick = () => close();
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const openPicker=pickers.find(picker=>picker.isOpen());
    if(openPicker){event.preventDefault();openPicker.close();return;}
    if(settings.hidden)return;
    event.preventDefault(); close();
  });
  document.addEventListener('pointerdown', event => {
    if(!targetHolder?.contains(event.target))pickers[0]?.close(false);
    if(!platform?.parentElement.contains(event.target))pickers[1]?.close(false);
    if (!settings.hidden && !settings.contains(event.target) && !toggle.contains(event.target)) close(false);
  });
  controller.subscribe(() => {
    const state = controller.getState();
    if (state.mode !== 'generation' || state.chat.open) close(false);
    else refresh();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); form.requestSubmit();
    }
  });
  function refresh() {
    pickers.forEach(picker=>picker.refresh());
    input.style.height = 'auto';
    input.style.height = Math.max(48, Math.min(144, input.scrollHeight)) + 'px';
    if (form.offsetHeight) root.style.setProperty('--generation-composer-height', form.offsetHeight + 'px');
  }
  input.addEventListener('input', refresh);
  let followEnd = true;
  conversation.addEventListener('scroll', () => { followEnd = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 64; });
  new MutationObserver(() => { if (followEnd) conversation.scrollTop = conversation.scrollHeight; })
    .observe(conversation, { childList: true, subtree: true, characterData: true });
  function focusComposer() {
    const state = controller.getState();
    if (state.mode === 'generation' && !state.chat.open && settings.hidden && !pickers.some(picker=>picker.isOpen()) && document.activeElement === document.body && !input.disabled) input.focus();
  }
  return { close, refresh, focusComposer };
}
module.exports = { mountGenerationChat };
