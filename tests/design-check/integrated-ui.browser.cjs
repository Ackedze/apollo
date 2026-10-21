// Built Apollo UI → actual /analyze → owned synthetic providers. No live Figma or model.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os');
const path = require('node:path'), http = require('node:http');
const { pathToFileURL } = require('node:url');
const { createUiMainBridge, SOURCE_SCHEMA } = require('../../src/design-check/ui-protocol');
const repo = path.resolve(__dirname, '../..');
const proxy = process.env.APOLLO_DIALOGUE_TEST_PROXY_ROOT || path.resolve(repo, '../../services/apollo-proxy');
const output = process.env.DESIGN_CHECK_QA_ROOT;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
const close = server => { server.closeIdleConnections?.(); return new Promise(resolve => server.close(resolve)); };
async function until(check, label) {
  const deadline = Date.now() + 10000;
  while (!(await check())) { if (Date.now() > deadline) throw Error('Timed out: ' + label); await new Promise(resolve => setTimeout(resolve, 10)); }
}
const markdown = '# Паттерны\n\nВ базе **37 паттернов**, *пример* и `token`.\n\n- [Форма](products/ab/patterns/form.md)\n- [Документация](https://example.test/docs)\n\n1. Первый\n2. Второй\n\n> Цитата\n\n| Имя | Значение |\n| --- | --- |\n| Токен | 10% |\n\n```css\nbutton { color: red; }\n```\n\n<script>window.__markdownInjected = true</script>\n<img src=x onerror=attack()> [Unsafe](javascript:injected)';
function ownedCli() {
  const fs = require('node:fs');
  let text = '';
  process.stdin.on('data', value => { text += value; });
  process.stdin.on('end', async () => {
    const question = text.split('<question>').at(-1).split('</question>')[0].trim();
    fs.appendFileSync(fixture.invocations, JSON.stringify({ question }) + '\n');
    if (question === 'synthetic-delay') await new Promise(resolve => setTimeout(resolve, 300));
    const background = /^synthetic-background-(800|1024)$/.exec(question);
    if (background) {
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(fixture.releasePrefix + background[1]) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (question === 'synthetic-error') { process.stderr.write('Owned synthetic CLI failure'); process.exitCode = 1; return; }
    fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], question === 'markdown-proof' ? fixture.markdown : 'Синтетический ответ локального CLI: ' + question);
  });
}
async function run() {
  if (!output) throw Error('Set DESIGN_CHECK_QA_ROOT to a new private QA directory.');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw Error('DESIGN_CHECK_QA_ROOT must be new or empty.');
  fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apollo-ui-http-'));
  const write = (name, data) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); return file; };
  write('knowledge/design-system_ab/JSONS/apollo/indexes/componentContractIndex.json', JSON.stringify({ schemaVersion: 2, packages: [{ componentKey: 'fixture', packagePath: 'fixture', artifacts: { contract: 'contract.json' } }] }));
  write('knowledge/design-system_ab/JSONS/fixture/contract.json', '{"name":"OwnedFixture"}');
  write('knowledge/design-system_ab/JSONS/apollo/designPatternRules.json', '{"rules":[]}');
  write('knowledge/design-system_ab/redpolrules/dictionary.json', '{"rules":[]}');
  write('knowledge/design-system_ab/patterns/fixture.md', '# Owned fixture');
  fs.mkdirSync(path.join(root, 'knowledge/ds-ai-hub/core/web/components'), { recursive: true });
  write('knowledge/ds-ai-hub/products/ab/patterns/fixture.md', '# Owned fixture');
  write('knowledge/ds-ai-hub/products/ab/components/fixture/meta.json', '{"id":"OwnedFixture"}');
  write('knowledge/ds-ai-hub/products/ab/components/fixture/instructions.md', '# Owned synthetic component');
  const invocations = path.join(root, 'cli-invocations.jsonl'), releasePrefix = path.join(root, 'release-background-');
  const executable = write('fake-codex.cjs', '#!' + process.execPath + '\nconst fixture=' + JSON.stringify({ markdown, invocations, releasePrefix }) + ';\n(' + ownedCli.toString() + ')();\n');
  fs.chmodSync(executable, 0o700);
  const providerRequests = [], wire = [], finished = [], errors = [], blocked = [], checks = [], cases = [];
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    providerRequests.push(JSON.parse(raw)); res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result: 'Owned explicit Langflow compatibility fixture.' }));
  });
  const providerOrigin = await listen(provider);
  // Owned cwd and roots keep .env, accounts, knowledge and history of the author out of this test.
  const originalCwd = process.cwd(); process.chdir(root);
  Object.assign(process.env, { APOLLO_CLI_PROVIDER: 'codex', CODEX_BIN: executable, CODEX_WORKSPACE: path.join(root, 'workspace'),
    CODEX_DESIGN_SYSTEM: path.join(root, 'knowledge/design-system_ab'), CODEX_DS_AI_HUB: path.join(root, 'knowledge/ds-ai-hub'),
    APOLLO_CODEX_KNOWLEDGE_SOURCE: 'design-system_ab', APOLLO_PROXY_MANAGED: '0', APOLLO_CODEX_DEBUG_ENABLED: '0',
    APOLLO_AGENT_URL: providerOrigin + '/owned-fixture', APOLLO_AGENT_KEY: 'synthetic-only', APOLLO_AGENT_MAX_ATTEMPTS: '1',
    APOLLO_AGENT_MVP_CONFIG: '', APOLLO_AGENT_FIGMA_CONFIG: '', APOLLO_AGENT_MCP_CONFIG: '', APOLLO_KNOWLEDGE_CONTENT_VERSION: 'owned-ui-http' });
  delete process.env.APOLLO_DATA_ROOT; delete process.env.APOLLO_PROJECT_ROOT; delete process.env.APOLLO_RELEASE_ROOT;
  const express = require(path.join(proxy, 'node_modules/express')), actual = require(path.join(proxy, 'server.js'));
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.path === '/analyze') { const body = structuredClone(req.body); wire.push(body); res.on('finish', () => finished.push(body)); } next(); });
  app.use(actual.app);
  const server = http.createServer(app), origin = await listen(server);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const fixture = require('../fixtures'), runtime = require('../../dist/runtime.cjs');
  const document = fixture.contract(), snapshot = fixture.snapshot(); snapshot.nodes[0].appearance.opacity = .5;
  const audit = { auditId: 'a'.repeat(64), release: { channel: 'local-file' }, result: runtime.auditContractSnapshot(snapshot, document), snapshot, warnings: [] };
  const violation = audit.result.engine.evaluations.find(entry => entry.classification === 'violation');
  assert.equal(audit.result.engine.evaluations.filter(entry => entry.classification === 'violation').length, 1);
  const focusTargets = { schemaVersion: 'apollo.audit-focus-targets.v1', runId: audit.auditId, findings: [{ findingId: violation.evaluationId,
    targets: [{ id: 'owned-focus', nodeId: 'root', pageId: 'owned-page', reason: 'evaluation-focus' }] }] };
  const rules = document.rules.map(rule => ({ ruleId: rule.ruleId, title: rule.presentation.title }));
  const cliCalls = () => fs.existsSync(invocations) ? fs.readFileSync(invocations, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  try {
    // Apollo New has a fixed 800×860 shell; narrower historical rail layouts are not its current UI contract.
    for (const width of [800, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 860 } });
      page.on('pageerror', error => errors.push(error.message));
      let stored = width === 800 ? null : { schemaVersion: SOURCE_SCHEMA, source: 'langflow' }, releasePreference;
      const storageWrites = [], before = wire.length;
      const bridge = createUiMainBridge({ storage: {
        getAsync: async () => width === 800 ? new Promise(resolve => { releasePreference = resolve; }) : stored,
        setAsync: async (key, value) => { stored = value; storageWrites.push({ key, value }); }
      }, resize() {}, post: message => page.evaluate(value => window.emitPlugin(value), message) });
      await page.exposeFunction('__ownedUiBridge', message => bridge.accept(message));
      await page.addInitScript(() => {
        Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
        if (innerWidth === 1024) Object.defineProperty(crypto, 'getRandomValues', { value: undefined, configurable: true });
        window.bridgeMessages = [];
        window.emitPlugin = value => window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: value } }));
        parent.postMessage = value => { window.bridgeMessages.push(value.pluginMessage); if (value.pluginMessage?.type === 'design-check-ui-request') void window.__ownedUiBridge(value.pluginMessage); };
      });
      await page.route(/^https?:/, async route => {
        const request = route.request(), url = request.url();
        if (!['http://localhost:3001/analyze', 'http://localhost:3001/health', 'http://localhost:3001/agent/mcp/status'].includes(url)) { blocked.push(url); await route.abort(); return; }
        const response = await fetch(origin + new URL(url).pathname, { method: request.method(), headers: { 'Content-Type': 'application/json' }, body: request.postData() || undefined });
        try { await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }); } catch { /* cancelled client keeps the owned server request */ }
      });
      await page.goto(pathToFileURL(path.join(repo, 'dist/ui.html')).href);
      assert.equal(await page.getByRole('img', { name: 'Проверка ещё не запускалась', exact: true }).count(), 1);
      assert.equal(await page.locator('.apollo-finding-card').count(), 0); checks.push('unchecked overview ' + width);
      const question = async text => { await page.getByRole('textbox', { name: 'Вопрос Apollo', exact: true }).fill(text); await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click(); };
      const openChat = async () => { await page.getByRole('button', { name: 'Открыть чат с Apollo', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.agent-proxy-version')?.textContent.includes('Proxy v')); };
      const emit = value => page.evaluate(message => window.emitPlugin(message), value);
      const selection = (id, valid = true) => emit({ type: 'selection', valid, name: id, id, invalidated: true });
      const acceptAudit = request => emit({ type: 'audit-result', requestId: request.requestId, audit, rules, focusTargets });
      await openChat(); await question('first-question'); await page.locator('.assistant-copy').waitFor();
      if (releasePreference) { releasePreference({ schemaVersion: SOURCE_SCHEMA, source: 'langflow' }); await bridge.flush(); }
      await question('follow-up'); await page.waitForFunction(() => document.querySelectorAll('.assistant-copy').length === 2);
      const initial = wire.slice(before); assert.equal(initial.length, 2); assert.deepEqual(initial.map(value => value.source), ['codex', 'codex']);
      assert.equal(initial[0].session_id, initial[1].session_id); assert.equal(initial[1].dialogue.length, 2); assert.equal(providerRequests.length, 0);
      assert.match(await page.locator('.design-check-provenance').last().innerText(), /Codex.*owned-ui-http/);
      await bridge.flush(); if (width === 1024) { assert.equal(stored.source, 'codex'); assert.equal(storageWrites.length, 1); }
      checks.push('local routing, history and legacy preference ' + width);
      await page.evaluate(() => { const modal = document.createElement('div'); modal.id = 'owned-visible-dialog'; modal.setAttribute('role', 'dialog'); modal.textContent = 'Owned visible modal'; document.body.appendChild(modal); });
      await page.keyboard.press('Escape'); assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).count(), 1);
      await page.evaluate(() => document.getElementById('owned-visible-dialog').remove());
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.classList.contains('apollo-chat-launcher'));
      assert.equal(await page.getByRole('button', { name: 'Открыть чат с Apollo', exact: true }).evaluate(node => node === document.activeElement), true);
      checks.push('visible modal owns Escape; hidden modal allows chat focus restoration ' + width);
      await selection('owned-component'); await page.getByRole('button', { name: 'Проверить', exact: true }).click();
      const requests = await page.evaluate(() => window.bridgeMessages.filter(message => message.type === 'audit'));
      assert.equal(requests.length, 1); assert.deepEqual(Object.keys(requests[0]).sort(), ['platform', 'requestId', 'type']); assert.equal(requests[0].platform, 'desktop');
      await acceptAudit(requests[0]);
      await page.getByRole('button', { name: /^Компоненты:/ }).click();
      await page.getByRole('navigation', { name: 'Категории проверки' }).getByRole('button', { name: /^Кастомы/ }).click();
      await page.locator('.apollo-finding-card').waitFor(); assert.equal(await page.locator('.apollo-finding-card').count(), 1);
      await emit({ type: 'audit-result', requestId: requests[0].requestId, audit: { ...audit, auditId: 'b'.repeat(64), result: { engine: { evaluations: [] }, coverage: {} } }, rules: [] });
      assert.equal(await page.getByRole('img', { name: 'Нарушение', exact: true }).count(), 1); checks.push('one opacity violation and duplicate terminal refusal ' + width);
      await page.getByRole('button', { name: /^Найти в макете:/ }).click();
      const focus = await page.evaluate(() => window.bridgeMessages.filter(message => message.type === 'audit-focus').at(-1));
      assert.equal(focus.auditId, audit.auditId); assert.equal(focus.targetId, 'owned-focus'); assert.equal(focus.evaluationId, violation.evaluationId);
      await emit({ type: 'audit-focus-result', requestId: focus.requestId, auditId: audit.auditId, targetId: focus.targetId, success: true });
      await page.getByText('Источники проверки', { exact: true }).click(); assert.match(await page.locator('#coverage').innerText(), /завершены/);
      const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /^apollo-summary-/); const saved = path.join(output, 'summary-' + width + '.json'); await download.saveAs(saved);
      assert.equal(JSON.parse(fs.readFileSync(saved, 'utf8')).auditId, audit.auditId); checks.push('correlated focus and export ' + width);
      await page.getByRole('button', { name: 'Генерация', exact: true }).click(); await page.getByRole('textbox', { name: 'Описание экрана', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Генерация', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Проверка', exact: true }).click();
      await page.getByRole('button', { name: /^Компоненты:/ }).click();
      await page.getByRole('navigation', { name: 'Категории проверки' }).getByRole('button', { name: /^Кастомы/ }).click();
      assert.equal(await page.locator('.apollo-finding-card').count(), 1);
      await page.getByRole('button', { name: 'Открыть настройки Apollo', exact: true }).click();
      assert.equal(await page.getByRole('dialog', { name: 'Настройки Apollo', exact: true }).isVisible(), true); await page.keyboard.press('Escape');
      await openChat(); await question('markdown-proof'); await page.waitForFunction(() => document.querySelectorAll('.assistant-copy').length === 3);
      const answer = page.locator('.assistant-copy').last();
      assert.equal(await answer.locator('strong').innerText(), '37 паттернов'); assert.equal(await answer.locator('em').innerText(), 'пример');
      assert.equal(await answer.locator('h1').innerText(), 'Паттерны'); assert.equal(await answer.locator('ul li').count(), 2); assert.equal(await answer.locator('ol li').count(), 2);
      assert.equal(await answer.locator('table tbody td').count(), 2); assert.match(await answer.locator('pre code').innerText(), /button \{ color: red; \}/);
      assert.equal(await answer.locator('a').getAttribute('href'), 'https://example.test/docs'); assert.equal(await answer.locator('script,img,a[href^="javascript:"]').count(), 0);
      assert.equal(await page.evaluate(() => window.__markdownInjected), undefined); checks.push('Markdown and safe links ' + width);
      await question('synthetic-delay'); await page.getByRole('button', { name: 'Остановить ожидание ответа', exact: true }).click();
      assert.match(await page.locator('.design-check-error').innerText(), /на сервере может продолжаться/);
      await until(() => finished.some(value => JSON.parse(value.text).question === 'synthetic-delay'), 'cancelled request finishes');
      await until(async () => (await (await fetch(origin + '/health')).json()).agent.busy === false, 'owned CLI releases its server lease');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.assistant-copy').count(), 3); checks.push('cancelled reply cannot replace the conversation ' + width);
      await question('synthetic-error'); await page.getByRole('alert').filter({ hasText: /CODEX|CLI|500|502/i }).waitFor(); checks.push('CLI error is visible ' + width);
      const background = 'synthetic-background-' + width; await question(background);
      await until(() => cliCalls().some(value => value.question === background), 'background CLI starts');
      await page.getByRole('button', { name: 'Проверка', exact: true }).click(); await selection('background-component');
      await page.getByRole('button', { name: 'Проверить', exact: true }).click();
      const backgroundAudit = await page.evaluate(() => window.bridgeMessages.filter(message => message.type === 'audit').at(-1)); await acceptAudit(backgroundAudit);
      fs.writeFileSync(releasePrefix + width, 'release'); await page.locator('.design-check-chat-unread').waitFor();
      assert.equal(await page.locator('.design-check-chat-unread').innerText(), '1'); assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Генерация', exact: true }).click(); assert.equal(await page.locator('.design-check-chat-unread').isVisible(), true);
      await openChat(); assert.equal(await page.locator('.design-check-chat-unread').count(), 0); assert.equal(await page.locator('.assistant-copy').count(), 4);
      await page.keyboard.press('Escape'); assert.equal(await page.getByRole('button', { name: 'Генерация', exact: true }).getAttribute('aria-pressed'), 'true');
      checks.push('background answer, unread count and navigation ' + width);
      await page.getByRole('button', { name: 'Проверка', exact: true }).click(); await page.getByRole('button', { name: /^Компоненты:/ }).click();
      await selection('', false); await acceptAudit(requests[0]); assert.equal(await page.getByRole('button', { name: 'Проверить', exact: true }).isDisabled(), true);
      assert.equal(await page.locator('.apollo-finding-card').count(), 1);
      await selection('first'); await page.getByRole('button', { name: 'Проверить', exact: true }).click();
      const capture = await page.evaluate(() => window.bridgeMessages.filter(message => message.type === 'audit').at(-1)); await selection('second');
      assert.equal(await page.getByRole('button', { name: 'Проверяем', exact: true }).isDisabled(), true); await acceptAudit(capture);
      assert.equal(await page.getByRole('button', { name: 'Проверить', exact: true }).isDisabled(), false); assert.equal(await page.locator('.apollo-finding-card').count(), 1);
      checks.push('selection movement keeps capture correlation ' + width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'screenshots', 'integrated-current-' + width + '.png') });
      cases.push({ width, preference: width === 800 ? 'late legacy response' : 'saved legacy preference', storageWrites }); await page.close();
    }
    // Explicit legacy API remains compatible; the current plugin has no hidden remote default.
    const legacy = { ...wire[0], source: 'langflow', dialogue: [], session_id: 'owned-legacy-api' };
    const response = await fetch(origin + '/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(legacy) });
    assert.equal(response.status, 200); assert.match((await response.json()).result, /explicit Langflow/); assert.equal(providerRequests.length, 1);
    assert.ok(wire.slice(0, -1).every(value => value.source === 'codex'));
    for (const request of wire) { assert.deepEqual(JSON.parse(request.text).context, { selection: null, finding: null, auditReport: null, componentContext: null }); assert.ok(request.dialogue.length <= 12); assert.ok(request.dialogue.every(value => value.text.length <= 8000)); }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []); checks.push('legacy API compatibility and request boundaries');
    const result = { status: 'PASS', checks, cases, wire, syntheticCliCalls: cliCalls(), explicitLangflowCalls: providerRequests.length, errors, blocked,
      actualBuiltUiAndProxy: true, realModelCalls: 0, liveFigma: false, supportedShell: '800×860; wider host1024' };
    fs.writeFileSync(path.join(output, 'browser-summary.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ status: result.status, checks: checks.length, wireRequests: wire.length, realModelCalls: 0, liveFigma: false }));
  } catch (error) {
    const page = browser.pages ? browser.pages()[0] : browser.contexts().flatMap(context => context.pages())[0];
    if (page) {
      await page.screenshot({ path: path.join(output, 'screenshots', 'failure.png') });
      const state = await page.evaluate(() => ({ active: { tag: document.activeElement?.tagName, id: document.activeElement?.id, className: document.activeElement?.className },
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => ({ html: node.outerHTML.slice(0, 1200), visible: node.getClientRects().length > 0 })),
        chat: window.designCheckController?.getState().chat.open,
        alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent?.slice(0, 1000)),
        findings: document.querySelectorAll('.apollo-finding-card').length }));
      fs.writeFileSync(path.join(output, 'failure-state.json'), JSON.stringify(state, null, 2) + '\n');
    }
    throw error;
  } finally {
    for (const width of [800, 1024]) fs.writeFileSync(releasePrefix + width, 'release');
    await browser.close(); await close(server); await close(provider); process.chdir(originalCwd); fs.rmSync(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
