'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const schemaVersion = 'apollo.v3-audit-bridge.v1';
const layer = { id: 'same-layer', name: 'Слой' };
const shadow = { ...layer, reason: 'effect:Тень (Drop shadow)', resource: { type: 'raw-value' } };
const unboundFill = { ...layer, reason: 'fill', resource: { type: 'raw-value' } };
const localFill = { ...layer, reason: 'fill', resource: { type: 'style', name: 'Локальная заливка A' } };
const obsoleteFill = { ...layer, reason: 'fill', styleKey: 'obsolete-a', styleLabel: 'Старый стиль A' };
const typography = { ...layer, channels: ['iOS'], selectedChannel: 'Desktop', focusActionId:'focus-type' };
const gradientLayer = { id:'gradient', name:'Rectangle 240664082', reason:'stroke', actualColor:'#FF000080', focusActionId:'focus-gradient' };
const gradientStop = (stopIndex, position) => ({ paintIndex:0, stopIndex, position });
const gradientRaw = { ...gradientLayer, gradientStop:gradientStop(1,.65), resource:{type:'raw-value'},
  actions:[{id:'bind-gradient',kind:'bind-variable',label:'Привязать',targetName:'Токен для точки',targetColor:'#FF000080',scope:'customStyles'}] };
const styleRows = {
  customStyles: [
    shadow, shadow, shadow,
    gradientRaw,
    { ...gradientRaw, actions:[], gradientStop:gradientStop(2,.65) },
    { ...gradientRaw, actions:[], status:'incomplete', gradientStop:gradientStop(3,.85) },
    { ...gradientLayer, reason:'fill', gradientStop:gradientStop(0,0), resource:{type:'token',name:'Local gradient red'} },
    unboundFill,
    { ...layer, reason: 'stroke', resource: { type: 'raw-value' } },
    { ...layer, reason: 'typography', resource: { type: 'raw-value' } },
    localFill,
    { ...localFill, resource: { type: 'style', name: 'Локальная заливка B' } },
    { ...layer, reason: 'stroke', resource: { type: 'token', name: 'Локальный токен обводки' } },
  ],
  deprecatedStyles: [
    obsoleteFill,
    { ...gradientLayer, token:true, styleKey:'old-gradient', styleLabel:'Старый токен градиента', gradientStop:gradientStop(0,0) },
    { ...obsoleteFill, styleKey: 'obsolete-b', styleLabel: 'Старый стиль B' },
    { ...layer, reason: 'stroke', token: true, styleKey: 'obsolete-token', styleLabel: 'Старый токен' },
  ],
  themization: [{id:'old-theme',name:'[D][Corporate] Tag',recommendation:'[D] Tag'}],
  wrongChannel: [{ id: "other-channel-component", name: "Компонент iOS" }],
  wrongChannelTypography: [
    { ...typography, resource: { type: 'style', key: 'ios-style', name: 'Стиль iOS' } },
    { ...typography, resource: { type: 'token', key: 'ios-token', name: 'Токен iOS' } },
  ],
};

function installBridge() {
  window.deliver = message => window.postMessage({ pluginMessage: message }, '*');
  window.addEventListener('message', ({ data }) => {
    const message = data?.pluginMessage;
    if (message?.type === 'ready') window.deliver({ type: 'selection', pageId: 'page', id: null, name: '', valid: false });
    if (message?.type === 'v3-audit-run') {
      window.auditRunId = message.requestId;
      window.deliver({type:'v3-audit-progress',schemaVersion:message.schemaVersion,requestId:message.requestId,progress:{stage:'tokens',message:'Подготавливаем индексы…'}});
    }
    if (message?.type === 'v3-audit-cancel') window.deliver({type:'v3-audit-cancelled',schemaVersion:message.schemaVersion,requestId:message.requestId,code:'AUDIT_CANCELLED'});
    if (message?.type === 'v3-audit-action') {
      window.bindingRequest = message;
      window.deliver({ type:'v3-audit-operation-result', schemaVersion:message.schemaVersion, requestId:message.requestId, runId:message.runId,
        paintFix:{nodeId:'gradient',field:'stroke',gradientStop:{paintIndex:0,stopIndex:1,position:.65}} });
    }
    if (message?.type === 'v3-audit-focus') {
      window.focusRequest = message;
      window.deliver({ type:'v3-audit-operation-result', schemaVersion:message.schemaVersion, requestId:message.requestId, runId:message.runId });
    }
  });
}

async function assertOverviewCards(page, titles) {
  const tiles = page.locator('.apollo-overview-tiles');
  await tiles.getByRole('button', { name:/^Токены:/ }).waitFor();
  const boxes = await tiles.evaluate(row => ({
    gap:parseFloat(getComputedStyle(row).columnGap),
    cards:Array.from(row.children, button => {
      const box = button.getBoundingClientRect();
      return {title:button.lastElementChild.textContent,left:box.left,right:box.right,width:box.width,height:box.height,top:box.top};
    }),
  }));
  assert.deepEqual(boxes.cards.map(card => card.title), titles);
  assert.equal(boxes.gap, 10);
  assert.equal((boxes.cards[0].left + boxes.cards.at(-1).right) / 2, 400);
  for (const [index, card] of boxes.cards.entries()) {
    assert.equal(card.width, 144);
    assert.equal(card.height, 144);
    assert.equal(card.top, boxes.cards[0].top);
    if (index) assert.equal(card.left - boxes.cards[index-1].right, boxes.gap);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 860 }, reducedMotion:'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    const html = fs.readFileSync(path.join(__dirname, '../dist/ui.html'), 'utf8');
    await page.setContent(html.replace('<body>', '<body><script>(' + installBridge.toString() + ')();</script>'));
    const start = page.getByRole('button',{name:'Проверить',exact:true});
    await start.waitFor();
    assert(await start.isDisabled());
    assert.equal(await page.locator('.apollo-overview-tile').count(),0);
    await page.getByText('Выбери область и запусти проверку',{exact:true}).waitFor();
    if (process.env.APOLLO_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.APOLLO_TEST_SCREENSHOTS,'idle.png')});
    await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
    const settings = page.getByRole('dialog',{name:'Настройки Apollo',exact:true});
    await settings.getByRole('button',{name:'Тип страницы',exact:true}).click();
    await settings.getByRole('button',{name:'Форма',exact:true}).click();
    await settings.getByRole('button',{name:'Форма',exact:true}).waitFor();
    await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
    await page.evaluate(()=>window.deliver({type:'selection',pageId:'page',id:'root',name:'Область',valid:true}));
    await start.click();
    await page.getByRole('button',{name:'Остановить',exact:true}).waitFor();
    await page.getByText('Подготавливаем индексы…',{exact:true}).waitFor();
    await page.waitForFunction(() => Boolean(window.auditRunId));
    await page.evaluate(({ schemaVersion, styleRows }) => {
      const runId = window.auditRunId;
      const result = { runId, dataId: 'a'.repeat(64), mutationAvailable:true, visibleViews: styleRows,
        baseChecks:[{id:'theme',classification:'violation',message:'На текущей странице не выбран явный режим Corp'}],
        report:{scan:{selection:[{name:'Проверенная область 01'}]}}, textReport: { facts: { texts: [] } } };
      window.deliver({ type: 'v3-audit-result', schemaVersion, kind: 'components', requestId: runId, result });
    }, { schemaVersion, styleRows });

    await assertOverviewCards(page, ['База', 'Токены', 'Компоненты']);
    const newAudit = page.getByRole('button',{name:'Новая проверка',exact:true});
    await newAudit.and(page.locator(':enabled')).waitFor();
    await page.getByText('Проверенная область 01',{exact:true}).waitFor();
    if (process.env.APOLLO_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.APOLLO_TEST_SCREENSHOTS,'overview.png')});
    const base = page.getByRole('button',{name:/^База:/});
    await base.click();
    const baseDialog = page.getByRole('dialog',{name:'База',exact:true});
    await baseDialog.getByText('На текущей странице не выбран явный режим Corp',{exact:true}).waitFor();
    await baseDialog.getByRole('button',{name:'Компоненты · 1',exact:true}).click();
    await baseDialog.getByText('[D][Corporate] Tag',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await baseDialog.waitFor({state:'detached'});
    assert(await base.evaluate(node=>document.activeElement===node));
    await page.getByRole('button', { name: /^Токены:/ }).click();
    const tokens = page.getByRole('dialog',{name:'Токены',exact:true});
    assert.deepEqual(await tokens.boundingBox(), {x:8,y:8,width:784,height:844});
    if (process.env.APOLLO_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.APOLLO_TEST_SCREENSHOTS,'tokens.png')});
    const findings = page.locator('.apollo-v3-findings');
    const tabs = {
      unbound: { name: /^Без токена/, titles: {
        'Эффект без стиля.': 3,
        'Заливка без стиля или токена.': 1,
        'Обводка без стиля или токена.': 1,
        'Типографика без стиля.': 1,
        'Цвет точки градиента без токена.': 2,
        'Не удалось проверить цвет точки градиента.': 1,
      } },
      deprecated: { name: /^Устаревшие/, titles: {
        'Используется устаревший стиль.': 2,
        'Используется устаревший токен.': 2,
      } },
      local: { name: /^Локальные/, titles: {
        'Стиль или токен вне подключённой библиотеки.': 3,
        'Токен точки градиента вне подключённой библиотеки.': 1,
      } },
    };

    const channel = tokens.getByRole('button',{name:'Не тот канал · 2',exact:true});
    await channel.click();
    await findings.getByText('Стиль типографики не соответствует выбранному каналу.',{exact:true}).waitFor();
    await findings.getByText('Токен типографики не соответствует выбранному каналу.',{exact:true}).waitFor();
    assert.equal(await findings.getByText('Каналы: iOS. Выбран: Desktop.',{exact:true}).count(),2);
    const titles = Object.values(tabs).flatMap(tab => Object.keys(tab.titles));
    for (const tabId of ['unbound', 'deprecated', 'local', 'unbound', 'deprecated', 'unbound']) {
      const { name, titles: expected } = tabs[tabId];
      const button = page.getByRole('button', { name });
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      for (const title of titles) {
        assert.equal(await findings.getByText(title, { exact: true }).count(), expected[title] ?? 0, tabId + ' — ' + title);
      }
      const cardCount = Object.values(expected).reduce((total, count) => total + count, 0);
      assert.equal(await findings.locator(':scope > *').count(), cardCount, tabId + ' — total cards');
    }
    const gradientCard = findings.locator(':scope > *').filter({ hasText:'Обводка 1 · градиент · точка 2 (65%)' });
    assert.equal(await gradientCard.count(), 1);
    assert.equal(await gradientCard.getByRole('img', { name:'Фактический цвет #FF000080' }).count(), 1);
    await gradientCard.getByRole('button', { name:'Показать в макете', exact:true }).click();
    await page.waitForFunction(() => Boolean(window.focusRequest));
    assert.deepEqual(await page.evaluate(() => ({
      runId:window.focusRequest.runId, activeRunId:window.auditRunId, focusActionId:window.focusRequest.focusActionId,
    })), { runId:await page.evaluate(() => window.auditRunId), activeRunId:await page.evaluate(() => window.auditRunId), focusActionId:'focus-gradient' });
    await gradientCard.getByRole('button', { name:'Привязать', exact:true }).click();
    await page.getByRole('button', { name:/^Токен для точки/ }).click();
    await page.waitForFunction(() => window.bindingRequest?.actionId === 'bind-gradient');
    await gradientCard.waitFor({state:'detached'});
    assert.equal(await findings.getByText('Обводка 1 · градиент · точка 3 (65%)', {exact:true}).count(), 1);
    assert.equal(await findings.getByText('Обводка без стиля или токена.', {exact:true}).count(), 1);
    await tokens.getByRole('button', { name:'Закрыть результаты проверки', exact:true }).click();
    await page.getByRole('button', { name:/^Компоненты:/ }).click();
    await page.getByRole('button', { name:/^Не тот канал/ }).click();
    assert.equal(await findings.getByText('Компонент не соответствует выбранной платформе.', {exact:true}).count(), 1);
    await page.getByRole('button', { name:'Закрыть результаты проверки', exact:true }).click();
    await page.getByRole('button', { name:'Desktop', exact:true }).click();
    await page.getByRole('button', { name:'iOS', exact:true }).click();
    await page.getByRole('button', { name:/^Иконки:/ }).waitFor();
    await assertOverviewCards(page, ['Токены', 'Компоненты', 'Иконки']);
    const previousRun = await page.evaluate(()=>window.auditRunId);
    await newAudit.click();
    await page.waitForFunction(prior=>window.auditRunId!==prior,previousRun);
    const stop = page.getByRole('button',{name:'Остановить',exact:true});
    await stop.waitFor();
    assert.equal(await stop.count(),1);
    await stop.click();
    await stop.waitFor({state:'hidden'});
    assert.deepEqual(errors, []);
    console.log('PASS: 800×860 overview, Base and Tokens navigation, platform findings and gradient actions.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
