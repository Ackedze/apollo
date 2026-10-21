const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildPreview } = require("../../src/design-check/build-preview.cjs");

async function run() {
  const output = process.env.DESIGN_CHECK_QA_ROOT;
  if (!output) throw Error('Set DESIGN_CHECK_QA_ROOT to a private output directory.');
  await buildPreview(path.join(output, 'preview'));
  const screenshots = path.join(output, 'screenshots'); fs.mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  let checks = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 860 } }), errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
    await page.goto(pathToFileURL(path.join(output, 'preview/preview.html')).href);
    await page.getByRole('button', { name: 'Тип страницы', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Проверить', exact: true }).isDisabled(), true); checks++;
    assert.equal(await page.locator('[aria-label="Не проверено"]').count(), 13); checks++;
    await page.screenshot({ path: path.join(screenshots, 'shell-800.png'), fullPage: true });
    await page.getByRole('button', { name: 'Тип страницы', exact: true }).click();
    await page.getByRole('button', { name: 'Форма', exact: true }).click();
    assert.equal(await page.evaluate(() => designCheckController.getState().settings.pageTypeId), 'form'); checks++;
    await page.getByRole('button', { name: 'Открыть настройки Apollo' }).click();
    assert.equal(await page.getByRole('button', { name: 'Проверять шаред', exact: true }).isDisabled(), true); checks++;
    for (const name of ['Компактный вид', 'Тестировать Contract v2', 'Показывать Expected', 'Скрыть кастомизации']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0); checks++;
    }
    await page.getByRole('button', { name: 'Подготовить пример Собрать JSON из выделенного макета' }).waitFor();
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();
    await page.getByRole('button', { name: 'MobileWeb', exact: true }).click();
    await page.getByRole('button', { name: 'b2b', exact: true }).click(); await page.getByRole('button', { name: 'b2c', exact: true }).click();
    await page.screenshot({ path: path.join(screenshots, 'settings-800.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.evaluate(() => designCheckController.flushPreferences()); await page.reload();
    await page.waitForFunction(() => designCheckController.getState().preferenceStatus === 'ready');
    const restored = await page.evaluate(() => designCheckController.getState().settings);
    assert.equal(restored.pageTypeId, 'form'); assert.equal(restored.pickerLabel, 'MobileWeb'); assert.equal(restored.channelId, 'b2c'); checks += 3;
    await page.getByRole('button', { name: 'Технические Не проверено', exact: true }).click();
    assert.equal(await page.locator('.design-check-category-heading h2').innerText(), 'Технические'); checks++;
    assert.match(await page.locator('.design-check-category-heading p').innerText(), /не подключена/); checks++;
    await page.evaluate(() => designCheckController.updateSetting('compact', true));
    assert.equal(await page.locator('.design-check-shell').evaluate(element => element.classList.contains('compact')), true); checks++;
    await page.getByRole('button', { name: 'Актуальные компоненты Не проверено', exact: true }).click();
    assert.equal(await page.locator('.design-check-shell').evaluate(element => element.classList.contains('compact')), false); checks++;
    await page.evaluate(() => designCheckController.updateSetting('hideCustomizations', true)); assert.equal(await page.getByRole('button', { name: 'Кастомизации Не проверено', exact: true }).count(), 0); checks++;
    await page.getByRole('button', { name: 'Паттерны', exact: true }).click();
    assert.match(await page.getByRole('region', { name: 'Паттерны', exact: true }).innerText(), /Draft/); checks++;
    await page.getByRole('button', { name: 'Тексты', exact: true }).click();
    assert.match(await page.getByRole('region', { name: 'Тексты', exact: true }).innerText(), /не подключена/); checks++;
    await page.getByRole('button', { name: 'Компоненты', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть чат с Apollo' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Вопрос Apollo' }).isDisabled(), true); checks++;
    assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).count(), 1); checks++;
    assert.equal(await page.getByRole('region', { name: 'Чат с Apollo', exact: true }).evaluate(element => element.contains(document.activeElement)), true); checks++;
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Открыть настройки Apollo' }).evaluate(element => element === document.activeElement), true); checks++;
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Langflow', exact: true }).evaluate(element => element === document.activeElement), true); checks++;
    await page.screenshot({ path: path.join(screenshots, 'chat-unconnected-800.png'), fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Открыть чат с Apollo' }).evaluate(element => element === document.activeElement), true); checks++;
    for (const width of [440, 360]) {
      await page.setViewportSize({ width, height: 860 });
      await page.getByRole('button', { name: 'Форма', exact: true }).click(); await page.getByRole('button', { name: 'Страница с таблицей', exact: true }).click();
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(geometry.width <= geometry.viewport, `No horizontal overflow at ${width}`); checks++;
      const controls = await page.locator('header [data-product] > div > button, header [data-product] > div > div > button').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }));
      assert.ok(controls.every(rect => rect.left >= 0 && rect.right <= width), `Header controls remain visible at ${width}`); checks++;
      await page.getByRole('button', { name: 'Открыть настройки Apollo' }).click();
      const menu = await page.getByRole('dialog', { name: 'Настройки Apollo', exact: true }).boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= 860, `Settings panel remains within ${width}px viewport`); checks++;
      await page.screenshot({ path: path.join(screenshots, `settings-${width}.png`), fullPage: true }); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Открыть чат с Apollo' }).click();
      await page.screenshot({ path: path.join(screenshots, `chat-unconnected-${width}.png`), fullPage: true }); await page.keyboard.press('Escape');
      await page.evaluate(() => designCheckController.updateSetting('pageTypeId', 'form'));
    }
    // Explicit synthetic callback port; no mock response is promoted to connected v4/Proxy acceptance.
    await page.evaluate(() => {
      designCheckView.unmount(); designCheckController.destroy();
      let calls = 0;
      window.designCheckController = ApolloDesignCheck.createDesignCheckController({ tabs: ApolloDesignCheck.tabDefinitions,
        dialogue: { cancelScope: 'client-only', send: async () => { if (++calls === 1) return new Promise(resolve => { window.resolveOldReply = resolve; }); return { text: 'Synthetic browser response' }; } } });
      window.designCheckView = ApolloDesignCheck.mountDesignCheck(document.getElementById('app'), designCheckController);
    });
    await page.getByRole('button', { name: 'Открыть чат с Apollo' }).click();
    await page.getByRole('textbox', { name: 'Вопрос Apollo' }).fill('Old synthetic question'); await page.getByRole('button', { name: 'Отправить вопрос' }).click();
    assert.equal(await page.getByRole('button', { name: 'Codex', exact: true }).isDisabled(), true); checks++;
    await page.getByRole('button', { name: 'Остановить ожидание ответа' }).click();
    assert.match(await page.getByRole('alert').innerText(), /сервере может продолжаться/); checks++;
    await page.getByRole('textbox', { name: 'Вопрос Apollo' }).fill('New synthetic question'); await page.getByRole('button', { name: 'Отправить вопрос' }).click();
    await page.locator('.assistant-copy').filter({ hasText: 'Synthetic browser response' }).waitFor();
    await page.evaluate(() => resolveOldReply({ text: 'Stale response' }));
    assert.equal(await page.getByText('Stale response', { exact: true }).count(), 0); checks++;
    await page.screenshot({ path: path.join(screenshots, 'chat-synthetic-360.png'), fullPage: true });
    await page.keyboard.press('Escape');
    // The integration slot must keep the existing export/focus/generation DOM nodes and listeners intact.
    await page.evaluate(() => {
      designCheckView.unmount(); designCheckController.destroy();
      const original = document.createElement('div'); original.id = 'original-v4-host'; document.body.appendChild(original);
      window.slotClicks = 0;
      const nodes = {};
      for (const key of ['setup', 'audit', 'generation']) {
        const node = document.createElement('button'); node.id = `preserved-${key}`; node.textContent = `Existing ${key} action`;
        node.addEventListener('click', () => slotClicks++); original.appendChild(node); nodes[key] = node;
      }
      designCheckController = ApolloDesignCheck.createDesignCheckController({ tabs: ApolloDesignCheck.tabDefinitions });
      designCheckController.selectTab('changes');
      designCheckView = ApolloDesignCheck.mountDesignCheck(document.getElementById('app'), designCheckController, nodes);
    });
    await page.locator('#preserved-setup').click(); await page.locator('#preserved-audit').click();
    assert.equal(await page.locator('#preserved-generation').isHidden(), true); checks++;
    await page.getByRole('button', { name: 'Генерация', exact: true }).click();
    await page.locator('#preserved-generation').click();
    assert.equal(await page.evaluate(() => slotClicks), 3); checks++;
    await page.getByRole('button', { name: 'Проверка', exact: true }).click();
    await page.getByRole('button', { name: 'Технические Не проверено', exact: true }).click(); assert.equal(await page.locator('#preserved-audit').isHidden(), true); checks++;
    await page.evaluate(() => designCheckView.unmount());
    assert.equal(await page.locator('#original-v4-host > button').count(), 3); checks++;
    assert.deepEqual(errors, []); assert.deepEqual(network, []); checks += 2;
    const summary = { scope: 'isolated-synthetic-browser-only', checks, browserErrors: errors, externalRequests: network,
      widths: [800, 440, 360], liveFigma: 'not-run', proxyAgent: 'not-called' };
    fs.writeFileSync(path.join(output, 'browser-summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
