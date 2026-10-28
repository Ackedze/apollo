// Built plugin, synthetic preferences bridge, all HTTP blocked. No Figma or model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const output = process.env.DESIGN_CHECK_QA_ROOT;
  if (!output) throw Error('Set DESIGN_CHECK_QA_ROOT to an explicit test output directory.');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const errors = [], metrics = [];
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 860 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.addInitScript(() => {
      parent.postMessage = ({ pluginMessage: request }) => {
        if (request?.type !== 'design-check-ui-request') return;
        queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
          source: window, data: { pluginMessage: { type: 'design-check-ui-result', schemaVersion: request.schemaVersion,
            requestId: request.requestId, operation: request.operation, result: null } },
        })));
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../dist/ui.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const host = page.locator('.apollo-settings-host');
    const picker = host.locator('[title="Платформа"] > button');
    const settings = page.getByRole('button', { name: 'Открыть настройки Apollo', exact: true });
    const menu = page.getByRole('group', { name: 'Платформа', exact: true });
    await picker.waitFor();
    assert.equal(await picker.innerText(), 'Desktop');
    assert.equal(await page.locator('#apollo-settings').count(), 0);

    async function geometry(width) {
      const value = await picker.evaluate(button => {
        const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        return { header: rect(button.closest('header')), picker: rect(button),
          nav: rect(document.querySelector('.apollo-navigation')), settings: rect(document.querySelector('[aria-label="Открыть настройки Apollo"]')),
          leadingSlot: rect(button.firstElementChild), glyph: rect(button.querySelector('svg')), chevron: rect(button.lastElementChild),
          fontSize: getComputedStyle(button).fontSize };
      });
      assert.ok(value.header.right <= width + 1);
      assert.ok(value.picker.x >= 12 && value.picker.right <= width - 12);
      assert.equal(value.picker.height, 40);
      assert.equal(value.fontSize, '14px');
      assert.equal(value.leadingSlot.width, 20); assert.equal(value.leadingSlot.height, 20);
      assert.equal(value.glyph.width, 16); assert.equal(value.glyph.height, 16);
      assert.equal(value.chevron.width, 20); assert.equal(value.chevron.height, 20);
      assert.ok(Math.abs(value.settings.x - value.picker.right - 10) < 1);
      assert.ok(value.nav.right <= value.picker.x || value.nav.y >= value.picker.bottom + 4, 'navigation and selector must not overlap');
      if (width === 800) assert.ok(Math.abs(value.nav.x + value.nav.width / 2 - width / 2) < 1);
      metrics.push({ width, ...value });
    }

    await geometry(800);
    await page.screenshot({ path: path.join(output, 'header-800.png'), clip: { x: 0, y: 0, width: 800, height: 80 } });
    await picker.click();
    assert.deepEqual(await menu.getByRole('button').allTextContents(), ['Desktop', 'MobileWeb', 'iOS', 'Android']);
    assert.match(await menu.innerText(), /Web[\s\S]*ABM/);
    assert.equal(await menu.getByRole('button', { pressed: true }).innerText(), 'Desktop');
    assert.equal(await menu.getByRole('button', { pressed: true }).evaluate(node => node.lastElementChild.getBoundingClientRect().width), 16);
    assert.equal(await menu.getByRole('button').evaluateAll(nodes => nodes.every(node => node.querySelector('svg'))), true);
    await page.screenshot({ path: path.join(output, 'menu-800.png'), clip: { x: 0, y: 0, width: 800, height: 360 } });
    await menu.getByRole('button', { name: 'MobileWeb', exact: true }).click();
    assert.equal(await picker.innerText(), 'MobileWeb');
    assert.equal(await picker.locator('svg').first().getAttribute('viewBox'), '0 0 12.1006 16.1006');
    await geometry(800);

    // The channel selector remains in settings; platform is no longer duplicated there.
    await settings.click();
    const panel = page.getByRole('dialog', { name: 'Настройки Apollo', exact: true });
    assert.equal(await panel.getByRole('button', { name: 'MobileWeb', exact: true }).count(), 0);
    await panel.getByRole('button', { name: 'b2b', exact: true }).click();
    await page.getByRole('group', { name: 'Канал', exact: true }).getByRole('button', { name: 'b2c', exact: true }).click();
    assert.equal(await panel.getByRole('button', { name: 'b2c', exact: true }).count(), 1);
    await picker.click(); assert.equal(await panel.count(), 0);
    await page.keyboard.press('End');
    assert.equal(await menu.getByRole('button', { name: 'Android', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter'); assert.equal(await picker.innerText(), 'Android');
    assert.equal(await picker.locator('svg').first().getAttribute('viewBox'), '0 0 14.9004 16');
    await picker.focus(); await page.keyboard.press('Enter'); await menu.waitFor();
    await page.keyboard.press('Escape'); assert.equal(await menu.count(), 0);
    assert.equal(await picker.evaluate(node => node === document.activeElement), true);
    await picker.click(); await page.keyboard.press('Tab'); assert.equal(await menu.count(), 0);
    assert.equal(await settings.evaluate(node => node === document.activeElement), true);

    for (const name of ['Тексты', 'Генерация', 'Открыть чат с Apollo', 'Навыки', 'Проверка']) {
      await page.getByRole('navigation', { name: 'Разделы Apollo' }).getByRole('button', { name, exact: true }).click();
      assert.equal(await picker.isVisible(), true); assert.equal(await picker.innerText(), 'Android');
      await geometry(800);
    }
    for (const width of [440, 400]) {
      await page.setViewportSize({ width, height: 860 });
      await geometry(width);
      await picker.click(); await menu.waitFor();
      const bounds = await menu.boundingBox(); assert.ok(bounds.x >= 8 && bounds.x + bounds.width <= width - 8);
      await page.screenshot({ path: path.join(output, `menu-${width}.png`), clip: { x: 0, y: 0, width, height: 360 } });
      await menu.getByRole('button', { name: 'iOS', exact: true }).click();
      assert.equal(await picker.innerText(), 'iOS');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify({ status: 'PASS', metrics, errors,
      http: 'blocked', figmaCalls: 0, modelCalls: 0 }, null, 2) + '\n');
    console.log('PASS: header/platform icons, grouping, selection, settings, keyboard, five modes and 800/440/400 bounds.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
