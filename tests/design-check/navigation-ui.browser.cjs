// Actual built Apollo UI, owned synthetic data, no real Figma or agent calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const fixtures = require("../fixtures"), runtime = require("../../dist/runtime.cjs");
const { fixture } = require("../../packages/generation-core/tests/planning-fixtures.cjs");
async function run() {
  const output = process.env.DESIGN_CHECK_QA_ROOT;
  if (!output) throw Error('Set DESIGN_CHECK_QA_ROOT to a private output directory.');
  const screenshots = path.join(output, 'screenshots'); fs.mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  let checks = 0;
  try {
    const page = await browser.newPage(), errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
    await page.addInitScript(() => {
      window.bridgeMessages = [];
      parent.postMessage = value => window.bridgeMessages.push(value.pluginMessage);
      window.emitPlugin = data => window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: data } }));
    });
    const document = fixtures.contract(), snapshot = fixtures.snapshot(); snapshot.nodes[0].appearance.opacity = .5;
    const audit = { auditId: 'a'.repeat(64), release: { channel: 'local-file' },
      result: runtime.auditContractSnapshot(snapshot, document), snapshot, warnings: [] };
    for (const width of [800]) {
      const headerControlsVisible = () => page.locator('header [data-product] button[aria-label="Проверить"], header [data-product] button[aria-label="Проверяем"], header [data-product] .design-check-page-picker').evaluateAll(nodes => nodes.length === 2 && nodes.every(node => {
        const r = node.getBoundingClientRect(); return r.x >= 56 && r.right <= innerWidth;
      }));
      await page.setViewportSize({ width, height: 860 });
      await page.goto(pathToFileURL(path.resolve(__dirname, "../../dist/ui.html")).href);
      const navigation = page.getByRole('navigation', { name: 'Разделы Apollo' });
      assert.equal(await navigation.count(), 1);
      assert.equal(await navigation.getByRole('button').count(), 4);
      assert.equal(await navigation.evaluate(node => node.getBoundingClientRect().width), 56);
      assert.equal(await page.getByRole('button', { name: 'Проверка', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#generation-panel').isHidden(), true); checks += 5;
      const railVisible = await navigation.getByRole('button').evaluateAll(nodes => nodes.every(node => {
        const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && (hit === node || node.contains(hit));
      }));
      assert.equal(railVisible, true); checks++;
      await page.screenshot({ path: path.join(screenshots, 'navigation-check-' + width + '.png') });
      await page.getByRole('button', { name: 'Тип страницы', exact: true }).click();
      await page.getByRole('button', { name: 'Страница с таблицей', exact: true }).click();
      assert.equal(await headerControlsVisible(), true); checks++;
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      assert.equal(await page.getByRole('region', { name: 'Проверка макета', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Проверить', exact: true }).isHidden(), true);
      assert.equal(await page.locator('#generation-panel').isVisible(), true);
      assert.equal(await page.locator('#generation-review').isVisible(), false);
      await page.locator('#generation-settings-toggle').click();await page.locator('#generation-tools > summary').click();
      assert.equal(await page.locator('#generation-panel').count(), 1); checks += 5;
      await page.locator('#generation-spec-file').setInputFiles({ name: 'synthetic-navigation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture().spec)) });
      await page.waitForFunction(() => !document.getElementById('generation-prepare').disabled);
      await page.locator('#generation-target').selectOption('frontend');await page.keyboard.press('Escape');
      // Reuse the same settings popover, including its capability gates, from generation.
      await page.getByRole('button', { name: 'Открыть настройки Apollo' }).click();
      assert.equal(await page.getByRole('dialog', { name: 'Настройки Apollo' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Открыть настройки Apollo' }).getAttribute('aria-expanded'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Проверять шаред', exact: true }).isDisabled(), true); checks += 3;
      const panel = await page.getByRole('dialog', { name: 'Настройки Apollo' }).boundingBox();
      assert.ok(panel.x >= 56 && panel.y >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= 860); checks++;
      await page.screenshot({ path: path.join(screenshots, 'navigation-settings-' + width + '.png') });
      await page.getByRole('button', { name: 'Desktop', exact: true }).focus(); await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Открыть настройки Apollo' }).evaluate(node => node === document.activeElement), true); checks++;
      await page.getByRole('button', { name: 'Открыть чат с Apollo' }).focus(); await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).isVisible(), true); checks++;
      assert.equal(await page.locator('.agent-chat-overlay,[aria-modal="true"],[inert]').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Открыть чат с Apollo' }).getAttribute('aria-pressed'), 'true');
      const chatBox = await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).boundingBox();
      assert.equal(chatBox.x, 56); assert.equal(chatBox.width, width - 56); checks += 4;
      await page.getByRole('textbox', { name: 'Вопрос Apollo' }).fill('Синтетический черновик');
      await page.getByRole('button', { name: 'Открыть настройки Apollo' }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).isVisible(), true); checks++;
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      await page.getByRole('button', { name: 'Открыть чат с Apollo' }).click();
      assert.equal(await page.getByRole('textbox', { name: 'Вопрос Apollo' }).inputValue(), 'Синтетический черновик'); checks++;
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      assert.equal(await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).getAttribute('aria-pressed'), 'true'); checks++;
      await page.getByRole('button', { name: 'Проверка', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Страница с таблицей', exact: true }).isVisible(), true); checks++;
      await page.evaluate(() => window.emitPlugin({ type: 'selection', valid: true, id: 'synthetic', name: 'Synthetic component', invalidated: true }));
      await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', { name: 'Проверить', exact: true }).click();
      assert.equal(await headerControlsVisible(), true); checks++;
      const request = await page.evaluate(() => window.bridgeMessages.find(message => message.type === 'audit'));
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      await page.evaluate(message => window.emitPlugin(message), { type: 'audit-result', requestId: request.requestId, audit,
        rules: document.rules.map(rule => ({ ruleId: rule.ruleId, title: rule.presentation.title })) });
      assert.equal(await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#generation-name').innerText(), 'synthetic-navigation.json');
      assert.equal(await page.locator('#generation-target').inputValue(), 'frontend'); checks += 3;
      await page.screenshot({ path: path.join(screenshots, 'navigation-generation-' + width + '.png') });
      await page.getByRole('button', { name: 'Проверка', exact: true }).click();
      assert.equal(await page.locator('.finding').count(), 1);
      assert.equal(await page.locator('#result').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); checks += 3;
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      await page.locator('#generation-settings-toggle').click();
      await page.getByRole('button', { name: 'Проверка', exact: true }).click();
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name: 'Генерация', exact: true }).click();
      assert.equal(await page.locator('#generation-settings').isHidden(), true); checks++;
      await page.reload(); assert.equal(await page.getByRole('button', { name: 'Проверка', exact: true }).getAttribute('aria-pressed'), 'true'); checks++;
    }
    assert.deepEqual(errors, []); checks++;
    fs.writeFileSync(path.join(output, 'navigation-summary.json'), JSON.stringify({ checks, widths: [800], errors, network, liveFigma: false, realAgent: false }, null, 2) + '\n');
    console.log(JSON.stringify({ navigationChecks: checks, widths: [800], errors, liveFigma: false, realAgent: false }));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
