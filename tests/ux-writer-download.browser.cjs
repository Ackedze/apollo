const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const compatibility = require('../src/compatibility-requirements.json');

const schema = 'apollo.v3-audit-bridge.v1';
const agentInput = '{"texts":[{"node":"text","text":"Архив платежей"}],"components":[],"sources":[]}';
const runPath = '/v1/analyze/codex/runs';
const source = {path:'knowledge/data/ds-ai-hub/products/ab/patterns/tabs-view.md',ruleId:'rule:components.tabs-view.single-line-label'};
const findingMessage = 'Название вкладки должно помещаться в одну строку и быть не длиннее 10 символов.';

function mockFigma(schema) {
  window.addEventListener('message', ({data}) => {
    const message = data?.pluginMessage;
    if (!message) return;
    const emit = payload => setTimeout(() => window.postMessage({pluginMessage:payload}, '*'), 0);
    if (message.type === 'ready') emit({type:'selection',pageId:'page',id:'root',name:'Карточка',valid:true});
    if (message.type === 'v3-audit-run' && message.kind === 'texts') {
      const id = message.requestId;
      emit({type:'v3-audit-result',schemaVersion:schema,requestId:id,kind:'texts',result:{
        runId:id,dataId:'a'.repeat(64),textTargets:[{nodeId:'text',focusActionId:'v3-focus-text'}],
        textReport:{reportId:id+':texts',reportKind:'apollo-text-audit-report',scan:{channel:'Desktop'},
          summary:{scannedTextNodes:1},facts:{scopes:[{nodeId:'root',name:'Карточка',width:320,overlay:false}],
            texts:[{node:{id:'text',name:'Label',visible:true},scopeNodeId:'root',text:'Архив платежей',ancestors:[]}]}}
      }});
    }
    if (message.type === 'v3-audit-verify') emit({type:'v3-audit-operation-result',schemaVersion:schema,requestId:message.requestId,runId:message.runId});
    if (message.type === 'v3-audit-focus') {
      window.__fixtureTextFocus = message.focusActionId;
      emit({type:'v3-audit-operation-result',schemaVersion:schema,requestId:message.requestId,runId:message.runId});
    }
  });
}

async function run() {
  const bundle = process.env.APOLLO_V3_UI_BUNDLE_ROOT;
  if (!bundle) throw Error('APOLLO_V3_UI_BUNDLE_ROOT must name a private source fixture build.');
  const [template, js, css] = await Promise.all([
    fs.readFile(path.join(__dirname, '../src/ui.html'), 'utf8'),
    fs.readFile(path.join(bundle, 'ui.js'), 'utf8'), fs.readFile(path.join(bundle, 'ui.css'), 'utf8'),
  ]);
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({viewport:{width:800,height:860}});
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let inputKey, inputExpired = false, inputRequests = 0;
    await page.route('http://localhost:3001/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') {
        await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST'}});
        return;
      }
      const send = (value, status = 200) => route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:typeof value==='string'?value:JSON.stringify(value)});
      if (pathname === '/health') return send({ok:true,proxy:{version:compatibility.minProxyVersion},compatibility:{protocolVersion:compatibility.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:compatibility.dataSchemaVersion,profileVersion:compatibility.dataProfiles.at(-1),deliveryProfile:compatibility.deliveryProfile,generatedAt:'2026-11-13T00:00:00Z'}}});
      if (pathname === runPath) {
        assert.equal(request.postDataJSON().report.reportKind, 'apollo-ux-writer-report');
        inputKey = request.headers()['x-apollo-input-key'];
        assert.match(inputKey, /^[a-f0-9]{64}$/);
        return send({success:true,run:{id:'synthetic-model',status:'completed',agentInputAvailable:true,
          validation:{skillId:'ux-writer-v2',coverageGaps:['Недоступно одно правило проверки.'],findings:[{nodeId:'text',priority:'error',category:'Паттерн и гигиена макета',message:findingMessage,replacement:'Архив',sources:[source]}]}}});
      }
      if (pathname === runPath + '/synthetic-model/input') {
        assert.equal(request.headers()['x-apollo-input-key'], inputKey);
        inputRequests++;
        return inputExpired ? send({error:'UX_WRITER_INPUT_UNAVAILABLE'}, 404) : send(agentInput);
      }
      return send({error:'FIXTURE_ROUTE_UNAVAILABLE'}, 503);
    });
    await page.setContent(template.replace('__APOLLO_UI_CSS__', () => css)
      .replace('<script>__APOLLO_UI__', '<script>(' + mockFigma.toString() + ')(' + JSON.stringify(schema) + ');</script><script>__APOLLO_UI__')
      .replace('__APOLLO_UI__', () => js.replace(/<\/script/gi, '<\\/script')));
    await page.getByRole('button',{name:'Тексты',exact:true}).click();
    const diagnostics = page.locator('.apollo-sources').filter({hasText:'Диагностика проверки'});
    const summary = diagnostics.locator('summary');
    await summary.click();
    const input = diagnostics.getByRole('button',{name:'Исходный JSON',exact:true});
    assert.equal(await input.isDisabled(), true);
    await page.getByRole('button',{name:'Проверить',exact:true}).click();
    const findings = page.getByRole('region',{name:'Замечания к текстам'});
    await findings.getByText(findingMessage,{exact:true}).waitFor();
    assert.equal(await findings.getByText('Архив платежей',{exact:true}).count(),1);
    assert.equal(await findings.getByText('Архив',{exact:true}).count(),1);
    await page.getByText('Часть правил не проверена',{exact:true}).click();
    await page.getByText('Недоступно одно правило проверки.',{exact:true}).waitFor();
    await page.getByText('Часть правил не проверена',{exact:true}).click();
    const sources = findings.getByRole('button',{name:'Источники',exact:true});
    await sources.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog',{name:'Источники',exact:true});
    await dialog.getByText(source.ruleId,{exact:true}).waitFor();
    await dialog.getByText(source.path,{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await sources.evaluate(node=>node===document.activeElement),true);
    await sources.click();
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await sources.evaluate(node=>node===document.activeElement),true);
    await findings.getByRole('button',{name:'Показать в макете: Label'}).click();
    await page.waitForFunction(() => window.__fixtureTextFocus === 'v3-focus-text');
    if (!(await diagnostics.evaluate(node => node.open))) await summary.click();

    const [report] = await Promise.all([page.waitForEvent('download'),diagnostics.getByRole('button',{name:'Скачать отчёт',exact:true}).click()]);
    const reportJson = JSON.parse(await fs.readFile(await report.path(), 'utf8'));
    assert.equal(reportJson.originalPayload.validation.skillId, 'ux-writer-v2');
    assert.equal(JSON.stringify(reportJson).includes(inputKey), false);
    assert.equal(inputRequests, 0);

    const [sourceDownload] = await Promise.all([page.waitForEvent('download'),input.click()]);
    assert.equal(sourceDownload.suggestedFilename(), 'apollo-ux-writer-input-synthetic-model.json');
    assert.equal(await fs.readFile(await sourceDownload.path(), 'utf8'), agentInput);
    inputExpired = true;
    await input.click();
    await diagnostics.getByText('Исходный JSON больше недоступен. Запусти проверку заново.',{exact:true}).waitFor();
    assert.equal(await input.isDisabled(), true);
    assert.equal(inputRequests, 2);
    assert.deepEqual(errors, []);
    console.log('PASS: 800 px, Texts cards, coverage note, Sources dialog and focus, correct layer target, both JSON downloads, expired input, no key in report');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
