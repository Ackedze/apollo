const test = require('node:test'), assert = require('node:assert/strict');
const { createDesignCheckController } = require("../../src/design-check/controller");
test('rail navigation leaves inline chat without cancelling its pending reply or resetting history', async () => {
  let finish, signal;
  const controller = createDesignCheckController({ dialogue: { cancelScope: 'client-only', send: input => {
    signal = input.signal; return new Promise(resolve => { finish = resolve; });
  } } });
  controller.setMode('generation'); controller.openChat();
  const pending = controller.sendChat('Synthetic rail navigation question');
  controller.setMode('check');
  assert.equal(controller.getState().chat.open, false);
  assert.equal(controller.getState().mode, 'check');
  assert.equal(signal.aborted, false);
  finish({ text: 'Synthetic background reply' }); await pending;
  assert.equal(controller.getState().chat.unreadCount, 1);
  assert.equal(controller.getState().chat.messages.length, 2);
  controller.openChat(); assert.equal(controller.getState().chat.unreadCount, 0);
  controller.setMode('generation'); assert.equal(controller.getState().chat.open, false);
  assert.equal(controller.getState().chat.messages[1].text, 'Synthetic background reply');
  controller.openChat(); controller.closeChat();
  assert.equal(controller.getState().mode, 'generation');
});
