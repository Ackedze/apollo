const test = require('node:test');
const assert = require('node:assert/strict');
const { createDesignCheckController } = require("../../src/design-check/controller");
const tabs = ['current', 'changes'].map(id => ({ id, title: id }));
const audit = { auditId: 'synthetic-navigation-audit', result: { engine: { evaluations: [] }, coverage: { executionComplete: false } } };

test('workspace navigation preserves audit, selected category, subview and preferences', async () => {
  const saved = [];
  const controller = createDesignCheckController({ tabs, preferences: { save: async value => saved.push(value) } });
  controller.setAudit(audit); controller.selectTab('changes'); controller.setView('texts');
  controller.updateSetting('pageTypeId', 'form'); await controller.flushPreferences();
  const previous = controller.getState();
  assert.equal(previous.mode, 'check');
  assert.equal(controller.setMode('generation'), true);
  assert.equal(controller.getState().audit, previous.audit);
  assert.equal(controller.getState().settings, previous.settings);
  assert.equal(controller.getState().view, 'texts');
  assert.equal(controller.getState().selectedTab, 'changes');
  assert.equal(controller.setMode('check'), true);
  assert.equal(controller.getState().audit, previous.audit);
  assert.equal(controller.setMode('unsupported'), false);
  await controller.flushPreferences(); assert.equal(saved.length, 1);
  assert.equal(Object.hasOwn(saved[0], 'mode'), false);
  controller.destroy(); assert.equal(controller.setMode('generation'), false);
});

test('pending chat and audit finish while generation stays open; unread reply belongs to the rail chat', async () => {
  let completeReply, auditRequest;
  const controller = createDesignCheckController({ tabs, onAudit: request => { auditRequest = request; },
    dialogue: { cancelScope: 'client-only', send: () => new Promise(resolve => { completeReply = resolve; }) } });
  controller.setAuditReady(true); await controller.startAudit(); controller.openChat();
  const pending = controller.sendChat('Synthetic question'); controller.closeChat();
  const request = controller.getState().chat.messages[0].requestId;
  controller.setMode('generation');
  assert.equal(controller.acceptAuditResult(auditRequest.requestId, audit), true);
  assert.equal(controller.getState().mode, 'generation');
  completeReply({ text: 'Synthetic reply' }); await pending;
  assert.equal(controller.getState().chat.messages[1].requestId, request);
  assert.equal(controller.getState().chat.unreadCount, 1);
  assert.equal(controller.getState().mode, 'generation');
  controller.openChat(); assert.equal(controller.getState().chat.unreadCount, 0);
  assert.equal(controller.getState().mode, 'generation'); controller.closeChat(); controller.setMode('check');
  assert.equal(controller.getState().audit, audit);
  assert.equal(controller.getState().chat.messages.length, 2);
});
