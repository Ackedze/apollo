// Actual built UI/main with synthetic HTTP and Figma API; no installed app or live file.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { actionScene } = require('./focus-actions.fixture.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read) { for (let i = 0; i < 400; i++) { if (read()) return; await pause(20); } assert.fail('synthetic bridge did not settle'); }
const healthy = () => ({ ok: true, proxy: { version: '1.4.12' }, compatibility: { protocolVersion: 1,
  data: { state: 'ready', version: 'a'.repeat(64), schemaVersion: 'apollo.proxy-data-release.v1', profileVersion: '0.4.1', deliveryProfile: 'checking-ask-figma-mcp', generatedAt: '2026-11-02T12:13:09.774Z' } } });
(async () => {
  const out = process.env.COMPATIBILITY_QA_ROOT; assert.ok(out); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } }), f = actionScene(), host = [], errors = [];
  let current = healthy(), offline = false, ready = false, queue = [], landingPosts = 0;
  try {
    f.api.ui.postMessage = m => { f.messages.push(JSON.parse(JSON.stringify(m))); if (ready) void page.evaluate(m => window.emitPlugin(m), m).catch(() => {}); else queue.push(m); };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/code.js'), 'utf8'), { figma: f.api, __html__: '', TextEncoder, setTimeout, clearTimeout });
    await page.exposeFunction('nativeHost', m => { host.push(m); return f.api.ui.onmessage(m); });
    await page.addInitScript(() => { parent.postMessage = m => void window.nativeHost(m.pluginMessage); window.emitPlugin = m => window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: m } })); });
    await page.route(/^https?:/, async route => {
      const req = route.request(), url = new URL(req.url());
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Private-Network': 'true', 'Content-Type': 'application/json' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
      const reply = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
      if (url.pathname === '/health') return offline ? route.abort() : reply(current);
      if (url.pathname === '/v2/contracts/resolve') { const body = req.postDataJSON(); return reply({ releaseId: 'synthetic-release', contracts: [], resolutions: body.components.map(c => Object.assign({}, c, { status: 'not-found' })) }); }
      if (url.pathname === '/landing/status') return reply({ success: true, available: true, placementModes: ['new-section', 'section'] });
      if (url.pathname === '/landing/chats') { if (req.method() === 'POST') landingPosts++; return reply({ success: true, chats: [] }); }
      return route.abort();
    });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/ui.html')).href);
    ready = true; for (const m of queue) await page.evaluate(m => window.emitPlugin(m), m); queue = [];
    await f.api.ui.onmessage({ type: 'use-proxy' });
    const check = () => page.getByRole('button', { name: 'Проверить', exact: true });
    await check().click(); await until(() => f.messages.some(m => m.type === 'audit-result')); await check().waitFor();
    const starts = () => host.filter(m => ['audit', 'document-audit-request'].includes(m.type)).length;
    const count = starts(), previousScope = await page.locator('.apollo-scope').innerText();
    current = healthy(); current.proxy.version = '1.4.10';
    await page.getByRole('button', { name: 'Открыть настройки Apollo', exact: true }).click();
    const banner = page.getByRole('status', { name: 'Совместимость Apollo' });
    await banner.getByText(/Установлен Proxy 1\.4\.10/).waitFor();
    assert.equal(await page.locator('[data-state="connected"]').count(), 0);
    assert.equal(await page.locator('[data-state="update-required"]').count(), 1);
    await page.getByRole('button', { name: 'Открыть настройки Apollo', exact: true }).click();
    await check().click(); assert.equal(starts(), count); assert.equal(await page.locator('.apollo-scope').innerText(), previousScope);
    for (const width of [800, 540, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await banner.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({ path: path.join(out, `compatibility-${width}.png`) });
    }
    await page.setViewportSize({ width: 800, height: 900 });
    current = healthy(); current.compatibility.data.state = 'missing';
    await banner.getByRole('button', { name: 'Проверить снова' }).click(); await banner.getByText(/Пакет данных не установлен/).waitFor();
    await check().click(); assert.equal(starts(), count);
    await page.getByRole('button', { name: 'Генерация', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Бриф или уточнение' }); await input.fill('Сохранить этот бриф');
    await input.press('Enter'); await page.getByText('Пакет данных не установлен или его версии не согласованы. В меню AP откройте «Проверить обновления» и обновите знания.', { exact: true }).first().waitFor();
    assert.equal(await input.inputValue(), 'Сохранить этот бриф'); assert.equal(landingPosts, 0);
    offline = true; await banner.getByRole('button', { name: 'Проверить снова' }).click(); await banner.getByText(/Нет связи с Apollo Proxy/).waitFor();
    offline = false; current = healthy(); await banner.getByRole('button', { name: 'Проверить снова' }).focus(); await page.keyboard.press('Enter'); await banner.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: 'PASS', actualBuiltUI: true, actualBuiltMain: true, syntheticHTTP: true, liveFigma: false, widths: [800, 540, 360], oldProxyBlocked: true, missingDataBlocked: true, previousResultsPreserved: true, landingBriefPreserved: true, noLandingRequestOnMismatch: true, keyboardRecovery: true, offlineSeparate: true, errors }, null, 2) + '\n');
    console.log('Compatibility browser PASS');
  } finally { f.emit('close'); await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
