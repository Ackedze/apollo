const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const requirements = require('../src/compatibility-requirements.json');
const wire = 'apollo.task-passport.v1';
const id = 'run_a33681d8-e5b6-41c1-a499-e40a54186d57';
const brief = 'Доработка платежей.';
const runPath = '/skills/task-passport/runs';
const item = (value,source='none',screen=null,quote=null) => ({value,source,screen,quote});
const section = (title,rows) => ({title,rows:rows.map(([label,...items]) => ({label,items}))});
const draft = {status:'draft',sections:[
  section('Паспорт', [
    ['Флоу',item('Оплата счёта','layout')], ['Платформа',item('Альфа-Бизнес','hypothesis')],
    ['Статус',item('Черновик: дизайнер дополняет и подтверждает')],
  ]),
  section('Контекст', [
    ['Тип задачи',item('Нужно заполнить','missing')], ['Откуда приходит пользователь',item('Нужно заполнить','missing')],
    ['Другие решения',item('Не указано')],
  ]),
  section('Задача', [
    ['Цель бизнеса',item('Нужно заполнить','missing')],
    ['Джоба пользователя',item('Пользователь хочет оплатить счёт и узнать комиссию до подтверждения платежа.','hypothesis')],
    ['Как работает фича',item('Нужно заполнить','missing')],
  ]),
  section('Флоу', [
    ['Точка входа',item('Переход к оплате счёта','layout','Подтверждение','Комиссия 3 ₽')],
    ['Целевое действие',item('Подтвердить платёж','layout','Подтверждение')],
    ['Сценарий по экранам',item('Пользователь открывает счёт и подтверждает платёж.','hypothesis')],
    ['Корнер-кейсы',item('Нужно заполнить','missing')],
  ]),
  section('Для редактора', [['Что тексты обязаны донести',item('Комиссия 3 ₽','layout','Подтверждение','Комиссия 3 ₽')]]),
  section('Для оценки задачи', [['Факты для оценки',item('Экранов в выделении: 1.')]]),
  section('Вопросы дизайнеру',[['Что уточнить',item('Когда отображается комиссия?'),item('Какие ограничения действуют для платежа?')]]),
]};

function nativeMock() {
  window.testNamingCaptures = 0;
  window.addEventListener('message', ({data}) => {
    const request = data?.pluginMessage;
    const emit = message => setTimeout(() => {
      window.postMessage({pluginMessage:message},'*');
    },0);
    if (request?.type === 'ready') emit({type:'selection',id:'sel1',pageId:'page',name:'Оплата счёта',valid:true});
    if (request?.type === 'layer-names-request' && request.operation === 'capture') {
      window.testNamingCaptures++;
      window.releaseNamingCapture = () => emit({type:'layer-names-result',schemaVersion:request.schemaVersion,
        requestId:request.requestId,operation:'capture',error:'Synthetic cancelled read'});
      return;
    }
    if (request?.type !== 'task-passport-request') return;
    const {requestId,operation,payload} = request;
    if (operation === 'save') window.testPassportSaved = payload;
    emit({type:'task-passport-reply',requestId,result:operation === 'save' ? {frameId:'12:1'} : {
      captureId:'synthetic-capture',snapshot:{name:'Оплата счёта',screens:[
        {id:'s1',name:'Подтверждение',box:[0,0,400,800],texts:['Комиссия 3 ₽'],buttons:[],components:[]},
      ],notes:[],links:[]},
    }});
  });
}

async function run() {
  const bundle = process.env.APOLLO_V3_UI_BUNDLE_ROOT || path.join(__dirname,'../dist');
  const built = await fs.readFile(path.join(bundle,'ui.html'),'utf8');
  const html = built.replace('</head>','<script>('+nativeMock.toString()+')();</script></head>');
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({viewport:{width:800,height:860}});
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    let launches = 0, key, issueDraft = false;
    await page.route('http://localhost:3001/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST'};
      if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers});
      const send = (value,status=200) => route.fulfill({json:value,status,headers});
      if (pathname === '/health') return send({ok:true,proxy:{version:requirements.minProxyVersion},compatibility:{
        protocolVersion:requirements.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:requirements.dataSchemaVersion,
          profileVersion:requirements.dataProfiles.at(-1),deliveryProfile:requirements.deliveryProfile,generatedAt:'2026-11-25T00:00:00Z'},
      }});
      if (pathname === runPath) {
        launches++;
        assert.equal(request.postDataJSON().brief,launches === 1 ? '' : brief);
        assert.equal(request.postDataJSON().snapshot.screens[0].texts[0],'Комиссия 3 ₽');
        key = request.headers()['x-apollo-task-passport-key'];
        assert.match(key,/^[a-f0-9]{64}$/);
        return send({schemaVersion:wire,id,status:'awaiting_approval'},202);
      }
      if (pathname === runPath+'/'+id) {
        assert.equal(request.headers()['x-apollo-task-passport-key'],key);
        return send(issueDraft ? {schemaVersion:wire,id,status:'completed',result:draft} : {schemaVersion:wire,id,status:'awaiting_approval'});
      }
      return send({error:'SYNTHETIC_ROUTE_UNAVAILABLE'},503);
    });
    await page.setContent(html);
    await page.getByRole('navigation',{name:'Разделы Apollo'}).getByRole('button',{name:'Тулзы',exact:true}).click();
    const namesCard = page.getByRole('button',{name:'Переназвать слои',exact:true});
    const namesDialog = page.getByRole('dialog',{name:'Переназвать слои',exact:true});
    await namesCard.click();
    await namesDialog.getByRole('button',{name:'Проверить названия',exact:true}).click();
    await namesDialog.getByRole('button',{name:'Остановить',exact:true}).waitFor();
    await namesDialog.getByRole('button',{name:'Закрыть навык',exact:true}).click();
    const card = page.getByRole('button',{name:'Паспорт задачи',exact:true});
    await card.click();
    const dialog = page.getByRole('dialog',{name:'Паспорт задачи',exact:true});
    const evidence = process.env.APOLLO_TASK_PASSPORT_EVIDENCE;
    const screenshot = async name => {
      if (evidence) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({path:path.join(evidence,'UI-REDESIGN-'+name+'.png'),animations:'disabled'});
      }
    };
    const start = dialog.getByRole('button',{name:'Собрать паспорт'});
    const textarea = dialog.getByLabel('Бриф дизайнера (необязательно)');
    const fileMenu = dialog.getByRole('button',{name:'Открыть действия с паспортом'});
    await dialog.getByText('С брифом паспорт будет точнее.',{exact:true}).waitFor();
    assert.equal(await textarea.count(),0);
    assert.equal(await fileMenu.isDisabled(),true);
    await screenshot('INTRO');
    await start.click();
    await dialog.getByRole('button',{name:'Остановить'}).waitFor();
    await dialog.getByText('Подтвердите отправку данных флоу в Apollo Proxy.',{exact:true}).filter({visible:true}).last().waitFor();
    await dialog.getByRole('status',{name:''}).filter({hasText:'Подтвердите отправку'}).waitFor({state:'attached'});
    await screenshot('PROGRESS');
    assert.equal(await page.evaluate(() => window.testPassportSaved),undefined);
    await dialog.getByRole('button',{name:'Закрыть паспорт задачи'}).click();
    await namesCard.click();
    await namesDialog.getByRole('button',{name:'Остановить',exact:true}).click();
    await page.evaluate(() => window.releaseNamingCapture());
    await namesDialog.getByRole('button',{name:'Проверить названия',exact:true}).click();
    await page.waitForFunction(() => window.testNamingCaptures === 2);
    await namesDialog.getByRole('button',{name:'Закрыть навык',exact:true}).click();
    await card.click();
    issueDraft = true;
    const tab = name => dialog.getByRole('tab',{name,exact:true});
    const panel = dialog.getByRole('tabpanel');
    await panel.getByRole('heading',{name:'Паспорт',exact:true}).waitFor();
    assert.equal(await tab('Основное').getAttribute('aria-selected'),'true');
    assert.equal(await dialog.getByRole('tab').count(),5);

    await fileMenu.click();
    assert.equal(await dialog.getByRole('button',{name:'Сохранить в Figma'}).isDisabled(),true);
    await page.keyboard.press('Escape');
    assert.equal(await fileMenu.evaluate(node => node === document.activeElement),true);
    await fileMenu.click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button',{name:'Скачать CSV'}).click();
    assert.match((await download).suggestedFilename(),/\.csv$/);
    await dialog.getByText('Сохранить паспорт в Figma можно после завершения другой операции Apollo.',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Закрыть паспорт задачи'}).click();
    await namesCard.click();
    await namesDialog.getByRole('button',{name:'Остановить',exact:true}).click();
    await page.evaluate(() => window.releaseNamingCapture());
    await namesDialog.getByRole('button',{name:'Закрыть навык',exact:true}).click();
    await card.click();

    await panel.getByText('Черновик',{exact:true}).waitFor();
    const firstPanel = await panel.locator('.apollo-passport-panel').first().boundingBox();
    assert.deepEqual([firstPanel.x,firstPanel.y,firstPanel.width],[36,156,728]);
    await screenshot('MAIN');
    await tab('Основное').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Флоу').getAttribute('aria-selected'),'true');
    await panel.getByText('Целевое действие').waitFor();
    await screenshot('FLOW');
    await panel.getByText('Цитата из источника',{exact:true}).click();
    await panel.getByText('Комиссия 3 ₽',{exact:true}).waitFor();
    await tab('Для редактора').click();
    await panel.getByText('Комиссия 3 ₽',{exact:true}).waitFor();
    await screenshot('EDITOR');
    await tab('Для оценки').click();
    await panel.getByText('Экранов в выделении: 1.',{exact:true}).waitFor();
    await screenshot('ASSESSMENT');
    await page.keyboard.press('End');
    assert.equal(await tab('Вопросы дизайнеру').getAttribute('aria-selected'),'true');
    assert.equal(await panel.getByRole('listitem').count(),2);
    await panel.getByText('Когда отображается комиссия?').waitFor();
    await tab('Вопросы дизайнеру').click();
    await screenshot('QUESTIONS');
    await fileMenu.click();
    await screenshot('FILES');
    await dialog.getByRole('button',{name:'Сохранить в Figma'}).click();
    await dialog.getByText('Паспорт сохранён рядом с флоу.').waitFor();
    assert.equal(await page.evaluate(() => window.testPassportSaved.captureId),'synthetic-capture');
    await dialog.getByRole('button',{name:'Создать новый паспорт'}).click();
    await page.evaluate(() => window.postMessage({pluginMessage:{type:'selection',id:'empty',pageId:'page',name:'',valid:false}},'*'));
    await dialog.getByText('Выбери область и запусти проверку').waitFor();
    assert.equal(await start.isDisabled(),true);
    await screenshot('NO-SELECTION');
    await page.evaluate(() => window.postMessage({pluginMessage:{type:'selection',id:'sel2',pageId:'page',name:'Оплата счёта',valid:true}},'*'));
    await dialog.getByRole('button',{name:'Заполнить бриф'}).click();
    assert.equal(await textarea.inputValue(),'');
    assert.equal(await textarea.getAttribute('aria-invalid'),'false');
    assert.equal(await textarea.evaluate(node => node === document.activeElement),true);
    await screenshot('BRIEF');
    await textarea.fill(brief);
    await dialog.getByRole('button',{name:'Готово'}).click();
    await dialog.getByRole('button',{name:'Изменить бриф'}).waitFor();
    await start.click();
    await panel.getByRole('heading',{name:'Паспорт',exact:true}).waitFor();
    assert.equal(await tab('Основное').getAttribute('aria-selected'),'true');
    assert.equal(launches,2);
    await page.keyboard.press('Escape');
    assert.equal(await card.evaluate(node => node === document.activeElement),true);
    assert.deepEqual(errors,[]);
    console.log('Task Passport: redesigned states and five tabs, keyboard controls, optional brief, CSV, and guarded save passed at 800 px.');
  } finally { await browser.close(); }
}
run().catch(error => {console.error(error);process.exitCode = 1;});
