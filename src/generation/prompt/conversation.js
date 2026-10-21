function createPromptConversation(onMessage = () => {}) {
  let messages = [], draft = null;
  function append(message) { messages.push(message); onMessage(message); }
  return {
    submit(text) {
      const message = text.trim();
      if (!message) throw Error('PROMPT_MESSAGE_EMPTY');
      const requests = messages.filter(m => m.role === 'user').map(m => m.text);
      const prompt = requests.length || draft ? [
        'Продолжение уточнения экрана. Составь полный новый ScreenSpec, сохранив исходную задачу и применив уточнения пользователя по порядку; последнее уточнение имеет приоритет.',
        'Сохраняй id экрана и IDs неизменённых узлов/actions. Уточнение подписи не создаёт новый ID.',
        'ПРЕДЫДУЩИЕ ЗАПРОСЫ ПОЛЬЗОВАТЕЛЯ:', JSON.stringify(requests),
        'ПОСЛЕДНИЙ ЧЕРНОВОЙ SCREENSPEC (контекст, не подтверждение готовности):', JSON.stringify(draft),
        'НОВОЕ УТОЧНЕНИЕ ПОЛЬЗОВАТЕЛЯ:', message
      ].join('\n') : message;
      if (prompt.length > 12000) throw Error('PROMPT_CONVERSATION_TOO_LONG');
      append({ role: 'user', text: message });
      return prompt;
    },
    receive(result) {
      const snapshot = JSON.parse(JSON.stringify(result));
      draft = snapshot.spec;
      append({ role: 'assistant', text: draft.unresolved.length || draft.capabilityGaps?.length
        ? 'Черновик составлен. Остались вопросы и ограничения:'
        : 'Черновик готов. Можно создать экран или уточнить детали.', result: snapshot });
    },
    feedback(text) { append({ role: 'assistant', text }); },
    useSpec(spec) { draft = JSON.parse(JSON.stringify(spec)); },
    snapshot() {
      return JSON.parse(JSON.stringify({ messages: messages.map(m => {
        const value = { role: m.role, text: m.text };
        if (m.result) value.spec = m.result.spec;
        return value;
      }), draft }));
    },
    restore(value) {
      const snapshot = JSON.parse(JSON.stringify(value));
      messages = []; draft = snapshot.draft;
      for (const message of snapshot.messages) {
        const restored = { role: message.role, text: message.text };
        if (message.spec) restored.result = { spec: message.spec };
        append(restored);
      }
    },
    hasMessages() { return messages.length > 0; },
    reset() { messages = []; draft = null; }
  };
}

function appendPromptMessage(log, message) {
  const article = document.createElement('article'), heading = document.createElement('h3'), text = document.createElement('p');
  article.className = 'generation-chat-message generation-chat-' + message.role;
  heading.textContent = message.role === 'user' ? 'Вы' : 'Apollo';
  text.textContent = message.text;
  article.append(heading, text);
  if (message.result) {
    const result = message.result;
    if (result.spec.unresolved.length) {
      const list = document.createElement('ul');
      for (const gap of result.spec.unresolved) { const item = document.createElement('li'); item.textContent = gap; list.append(item); }
      const label = document.createElement('h4'); label.textContent = 'Вопросы к описанию экрана'; article.append(label,list);
    }
    if (result.spec.capabilityGaps?.length) {
      const label = document.createElement('h4'), list = document.createElement('ul'); label.textContent = 'Ограничения генератора';
      for (const gap of result.spec.capabilityGaps) { const item = document.createElement('li'); item.textContent = gap.message + ' (' + gap.code + ')'; list.append(item); }
      article.append(label,list);
    }
    const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
    summary.textContent = 'Подробности черновика';
    pre.textContent = JSON.stringify(result.spec, null, 2);
    details.append(summary, pre); article.append(details);
  }
  log.append(article);
}

module.exports = { createPromptConversation, appendPromptMessage };
