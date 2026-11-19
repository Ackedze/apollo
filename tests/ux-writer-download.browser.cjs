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
    if (message.type === 'ready') emit({type:'selection',pageId:'page',id:'',name:'',valid:false});
    if (message.type === 'v3-audit-run' && message.kind === 'texts') {
      window.__fixtureTextRun = message;
      const id = message.requestId;
      window.__fixtureTextRunCount=(window.__fixtureTextRunCount||0)+1;
      const grouped=window.__fixtureTextRunCount>1;
      emit({type:'v3-audit-result',schemaVersion:schema,requestId:id,kind:'texts',result:{
        runId:id,dataId:'a'.repeat(64),mutationAvailable:true,textTargets:grouped?Array.from({length:9},(_,i)=>({nodeId:'text'+i,focusActionId:'v3-focus-'+i})):[{nodeId:'text',focusActionId:'v3-focus-0'},{nodeId:'skipped',focusActionId:'v3-focus-1'}],
        textReport:{reportId:id+':texts',reportKind:'apollo-text-audit-report',scan:{channel:'Desktop'},
          summary:{scannedTextNodes:1},facts:{scopes:[{nodeId:'root',name:'Карточка',width:320,overlay:false}],
            texts:grouped?Array.from({length:9},(_,i)=>({node:{id:'text'+i,name:'Label '+i,visible:true},scopeNodeId:'root',text:'Для кого '+i,ancestors:[]})):[{node:{id:'text',name:'Label',visible:true},scopeNodeId:'root',text:'Архив платежей',ancestors:[]},{node:{id:'skipped',name:'Заглушка',visible:true},scopeNodeId:'root',text:'Label',ancestors:[]}]}}
      }});
    }
    if(message.type==='v3-audit-text-replace'){
      window.__fixtureTextReplacements=message;
      if(window.__fixtureTextPartial){window.__fixtureTextPartial=false;emit({type:'v3-audit-operation-error',schemaVersion:schema,requestId:message.requestId,runId:message.runId,code:'AUDIT_ACTION_FAILED',mutationStarted:true,stale:true,textReplacements:[{nodeId:'text0',text:message.replacements[0].after}],failedTextNodeId:'text1'});return;}
      emit({type:'v3-audit-operation-result',schemaVersion:schema,requestId:message.requestId,runId:message.runId,mutationStarted:true,stale:false,textReplacements:message.replacements.map(row=>({nodeId:window.__fixtureTextRunCount>1?'text'+row.focusActionId.split('-').at(-1):'text',text:row.after})),message:'Заменено текстовых слоёв: '+message.replacements.length+'.'});
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
  const template=await fs.readFile(path.join(__dirname,'../src/ui.html'),'utf8');
  const builtHtml=await fs.readFile(path.join(bundle,'ui.html'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const [js,css]=builtHtml?[builtHtml.match(/<script>([\s\S]*)<\/script>/)[1],builtHtml.match(/<style>([\s\S]*?)<\/style>/)[1]]:
    await Promise.all([fs.readFile(path.join(bundle,'ui.js'),'utf8'),fs.readFile(path.join(bundle,'ui.css'),'utf8')]);
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({viewport:{width:800,height:860}});
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output=process.env.APOLLO_UX_UI_EVIDENCE;
    if(output)await fs.mkdir(output,{recursive:true});
    const capture=async name=>{if(output)await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});};
    let proxyOffline=false;
    let inputKey, inputExpired = false, inputRequests = 0, runRequests = 0;
    let releaseAgent;
    const agentCanComplete = new Promise(resolve => { releaseAgent = resolve; });
    await page.route('http://localhost:3001/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') {
        await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST'}});
        return;
      }
      const send = (value, status = 200) => route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:typeof value==='string'?value:JSON.stringify(value)});
      if (pathname === '/health'&&proxyOffline)return send({error:'SYNTHETIC_PROXY_OFFLINE'},503);
      if (pathname === '/health') return send({ok:true,proxy:{version:compatibility.minProxyVersion},compatibility:{protocolVersion:compatibility.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:compatibility.dataSchemaVersion,profileVersion:compatibility.dataProfiles.at(-1),deliveryProfile:compatibility.deliveryProfile,generatedAt:'2026-11-13T00:00:00Z'}}});
      if (pathname === runPath) {
        runRequests++;
        assert.equal(request.postDataJSON().report.reportKind, 'apollo-ux-writer-report');
        inputKey = request.headers()['x-apollo-input-key'];
        assert.match(inputKey, /^[a-f0-9]{64}$/);
        await agentCanComplete;
        const grouped=runRequests>1,empty=runRequests===4;
        if(runRequests===5)return send({success:true,run:{id:'synthetic-model',status:'failed',error:{code:'UX_WRITER_DATA_CHANGED'}}});
        if(runRequests===6)return send({success:true,run:{id:'synthetic-model',status:'failed',error:{code:'OPENROUTER_UNAVAILABLE'}}});
        const findings=empty?[{nodeId:'text0',priority:'error',category:'Типографика',message:'Последняя правка',replacement:'Готово',sources:[source]}]:grouped?Array.from({length:8},(_,i)=>({nodeId:'text'+i,priority:i===7?'info':i===6?'warning':'error',category:'Типографика',message:i===7?'Уточни значение в контексте':'После предлога нужен неразрывный пробел. '+('Проверь текст в строке. '.repeat(i===0?5:1)),replacement:i===7?null:'Для\u00a0кого '+i,sources:[source]})):[{nodeId:'text',priority:'error',category:'Паттерн и гигиена макета',message:findingMessage,replacement:'Архив',sources:[source]}];
        return send({success:true,run:{id:'synthetic-model',status:'completed',agentInputAvailable:true,
          validation:{skillId:'ux-writer-v2',coverageGaps:empty?[]:['Недоступно одно правило проверки.'],unverifiedTexts:empty?[]:[{nodeId:grouped?'text8':'skipped',reason:'Заглушка вместо текста — не проверялась'}],findings}}});
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
    const nav = page.getByRole('navigation',{name:'Разделы Apollo'});
    assert.equal(await nav.getByRole('button',{name:'Тексты',exact:true}).count(), 0);
    const tools = nav.getByRole('button',{name:'Тулзы',exact:true});
    const card = page.getByRole('button',{name:'Проверка текстов',exact:true});
    const textTool = page.getByRole('dialog',{name:'Проверка текстов',exact:true});
    const close = textTool.getByRole('button',{name:'Закрыть проверку текстов',exact:true});
    await tools.click();
    await page.getByRole('button',{name:'Переназвать слои',exact:true}).click();
    const sibling = page.getByRole('dialog',{name:'Переназвать слои',exact:true});
    await sibling.waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const siblingBounds = await sibling.boundingBox();
    const checkInvitation=async(dialog,y)=>{
      const measured=await dialog.locator('.apollo-shared-stage.is-idle').evaluate(stage=>{
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        const image=stage.querySelector('img'),caption=stage.querySelector('.apollo-shared-stage-copy>p'),description=stage.querySelector('.apollo-shared-stage-description');
        return {stage:rect(stage),image:rect(image),caption:rect(caption),description:rect(description),loaded:image.complete&&image.naturalWidth===324&&image.naturalHeight===332,primary:[getComputedStyle(caption).fontSize,getComputedStyle(caption).lineHeight],secondary:[getComputedStyle(description).fontSize,getComputedStyle(description).lineHeight]};
      });
      assert.deepEqual(measured.stage,{x:36,y,width:728,height:268});assert.deepEqual(measured.image,{x:319,y,width:162,height:166});
      assert.deepEqual(measured.caption,{x:36,y:y+190,width:728,height:48});assert.deepEqual(measured.description,{x:36,y:y+248,width:728,height:20});
      assert.equal(measured.loaded,true);assert.deepEqual(measured.primary,['18px','24px']);assert.deepEqual(measured.secondary,['14px','20px']);
    };
    await checkInvitation(sibling,298);
    await capture('rename-idle');
    await sibling.getByRole('button',{name:'Закрыть навык',exact:true}).click();
    await card.focus();
    await page.keyboard.press('Enter');
    await textTool.waitFor();
    assert.equal(await textTool.evaluate(node=>node.matches(':modal')), true);
    assert.deepEqual(await textTool.boundingBox(), siblingBounds);
    await checkInvitation(textTool,286);
    assert.equal(await textTool.locator('.apollo-shared-stage-copy>p').textContent(),'Проверю орфографию, типографику и соответствие текстов правилам Альфа-Бизнеса');
    assert.equal(await textTool.locator('.apollo-shared-stage-description').textContent(),'Выбери область и запусти проверку');
    const start=textTool.getByRole('button',{name:'Запустить проверку',exact:true}),scopeHint=textTool.locator('.apollo-skill-scope-name');
    assert.equal(await start.isDisabled(),true);await start.evaluate(button=>button.click());assert.equal(runRequests,0);
    const choose=async(name,id='root',valid=true)=>page.evaluate(message=>window.postMessage({pluginMessage:message},'*'),{type:'selection',pageId:'page',id,name,valid});
    await choose('Карточка');await scopeHint.getByText('Карточка',{exact:true}).waitFor();assert.equal(await start.isEnabled(),true);
    const longName='ОченьДлинноеИмяОбласти'.repeat(80);await choose(longName);await scopeHint.getByText(longName,{exact:true}).waitFor();
    assert.equal(await scopeHint.getAttribute('title'),longName);assert.equal(await scopeHint.evaluate(node=>getComputedStyle(node).textOverflow),'ellipsis');assert.equal(await scopeHint.evaluate(node=>node.scrollWidth>node.clientWidth),true);assert.equal((await scopeHint.boundingBox()).width,728);
    await choose('<b>Другая область</b>');await scopeHint.getByText('<b>Другая область</b>',{exact:true}).waitFor();assert.equal(await scopeHint.locator('b').count(),0);
    await choose('Выбрано областей: 2','root|other');await scopeHint.getByText('Выбрано областей: 2',{exact:true}).waitFor();
    await choose('','',false);await scopeHint.getByText('Выбери область и запусти проверку',{exact:true}).waitFor();assert.equal(await start.isDisabled(),true);assert.equal(runRequests,0);
    await choose('');await scopeHint.getByText('Выбранная область',{exact:true}).waitFor();assert.equal(await start.isEnabled(),true);
    await choose('Выделите область или слои с компонентами');await scopeHint.getByText('Выделите область или слои с компонентами',{exact:true}).waitFor();assert.equal(await start.isEnabled(),true);
    await choose('Карточка');await scopeHint.getByText('Карточка',{exact:true}).waitFor();
    await capture('texts-idle');
    assert.equal(await close.evaluate(node=>node===document.activeElement), true);
    assert.equal(await page.locator('nav[aria-label="Разделы Apollo"] button').first().evaluate(button => {
      button.focus();
      return button === document.activeElement;
    }), false);

    assert.equal(await textTool.getByRole('button',{name:'Desktop',exact:true}).count(),0);
    assert.equal(await textTool.getByText('Диагностика проверки текстов',{exact:true}).count(),0);
    await close.click();
    const platform = page.getByRole('group',{name:'Платформа',exact:true});
    await page.getByRole('button',{name:'Desktop',exact:true}).click();
    await platform.getByRole('button',{name:'MobileWeb',exact:true}).click();
    const diagnostics = page.locator('.apollo-text-diagnostics');
    const summary=diagnostics.locator('summary');await summary.click();
    const input=diagnostics.getByRole('button',{name:'Исходный JSON',exact:true});
    assert.equal(await input.isDisabled(),true);
    await card.click();
    await textTool.getByRole('button',{name:'Запустить проверку',exact:true}).click();
    const stop = textTool.getByRole('button',{name:'Остановить',exact:true});
    await stop.waitFor();
    assert.equal(await textTool.locator('.apollo-shared-stage.is-idle').count(),0);
    assert.deepEqual(await textTool.locator('.apollo-shared-stage>img').boundingBox(),{x:319,y:329,width:162,height:166});
    await capture('texts-loading');
    await close.click();
    await card.click();
    await stop.waitFor();
    releaseAgent();
    const findings = textTool.locator('.apollo-text-findings');
    await findings.getByText(findingMessage,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__fixtureTextRun.channel), 'MobileWeb');
    assert.equal(await page.evaluate(()=>window.__fixtureTextRun.pageType), null);
    assert.equal(await findings.getByText('Архив платежей',{exact:true}).count(),1);
    assert.equal(await findings.getByRole('textbox').inputValue(),'Архив');
    await textTool.getByRole('tab',{name:'Не проверено · 1',exact:true}).click();
    await textTool.getByText('Заглушка вместо текста — не проверялась',{exact:true}).waitFor();
    await textTool.getByRole('button',{name:'Показать в макете: Заглушка',exact:true}).click();
    await page.waitForFunction(()=>window.__fixtureTextFocus==='v3-focus-1');
    assert.equal(await textTool.getByText('Недоступно одно правило проверки.',{exact:true}).count(),0);
    await textTool.getByRole('tab',{name:'Ошибки · 1',exact:true}).click();
    await capture('texts-result');
    const sources = findings.getByRole('button',{name:'Источники',exact:true});
    await sources.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog',{name:'Источники',exact:true});
    await dialog.getByText(source.ruleId,{exact:true}).waitFor();
    await dialog.getByText(source.path,{exact:true}).waitFor();
    await capture('texts-sources');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await sources.evaluate(node=>node===document.activeElement),true);
    await sources.click();
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await sources.evaluate(node=>node===document.activeElement),true);
    await findings.getByRole('button',{name:'Показать в макете: Label'}).click();
    await page.waitForFunction(() => window.__fixtureTextFocus === 'v3-focus-0');
    await page.keyboard.press('Escape');
    await textTool.waitFor({state:'hidden'});
    assert.equal(await card.evaluate(node=>node===document.activeElement), true);
    assert.equal(await tools.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button',{name:'Проверить',exact:true}).count(), 0);
    await nav.getByRole('button',{name:'Проверка',exact:true}).click();
    await tools.click();
    await card.click();
    await findings.getByText(findingMessage,{exact:true}).waitFor();
    assert.equal(runRequests, 1);
    await close.click();

    const [report] = await Promise.all([page.waitForEvent('download'),diagnostics.getByRole('button',{name:'Скачать отчёт',exact:true}).click()]);
    const reportJson = JSON.parse(await fs.readFile(await report.path(), 'utf8'));
    assert.equal(reportJson.originalPayload.validation.skillId, 'ux-writer-v2');
    assert.deepEqual(reportJson.originalPayload.validation.unverifiedTexts,[{nodeId:'skipped',reason:'Заглушка вместо текста — не проверялась'}]);
    await diagnostics.getByText('Недоступно одно правило проверки.',{exact:true}).waitFor();
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
    await card.click();
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();
    await textTool.getByRole('tab',{name:'Ошибки · 7',exact:true}).waitFor();
    const header=textTool.locator('.apollo-text-header'),panel=textTool.getByRole('tabpanel'),cards=textTool.locator('.apollo-text-card');
    assert.equal(await textTool.getByRole('tab',{name:'Уточнения · 1',exact:true}).isDisabled(),false);
    const first=cards.first(),values=first.locator('.apollo-text-values'),rule=first.locator('.apollo-text-rule');
    await page.mouse.move(790,10);
    const geometry=await textTool.evaluate(dialog=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      return{dialog:rect(dialog),header:rect(dialog.querySelector('header')),tabs:rect(dialog.querySelector('[role=tablist]')),card:rect(dialog.querySelector('.apollo-text-card')),footer:rect(dialog.querySelector('footer')),font:getComputedStyle(dialog).fontFamily};
    });
    assert.equal(geometry.dialog.width,784);assert.equal(geometry.header.height,120);assert.equal(geometry.card.width,728);assert.equal(geometry.card.x,36);
    assert.equal(await first.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
    await capture('texts-grouped');
    await rule.hover();assert.equal(await first.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0.04)');await capture('texts-card-hover');
    await values.hover();assert.equal(await values.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');await capture('texts-values-hover');
    const pinned=await header.boundingBox(),footer=textTool.locator('footer'),footerBounds=await footer.boundingBox();
    await panel.evaluate(n=>{n.scrollTop=n.scrollHeight;});assert.deepEqual(await header.boundingBox(),pinned);assert.deepEqual(await footer.boundingBox(),footerBounds);
    await panel.evaluate(n=>{n.scrollTop=0;});
    await textTool.getByRole('tab',{name:'Уточнения · 1',exact:true}).click();assert.equal(await cards.count(),1);assert.equal(await cards.getByRole('button',{name:/Заменить текст/}).count(),0);
    await textTool.getByRole('tab',{name:'Не проверено · 1',exact:true}).click();await textTool.getByText('Заглушка вместо текста — не проверялась',{exact:true}).waitFor();
    assert.equal(await cards.count(),1);await cards.getByRole('button',{name:'Показать в макете: Label 8',exact:true}).click();
    await page.waitForFunction(()=>window.__fixtureTextFocus==='v3-focus-8');assert.equal(await cards.getByRole('button',{name:/Заменить текст/}).count(),0);await capture('texts-unchecked');
    await textTool.getByRole('tab',{name:'Ошибки · 7',exact:true}).focus();await page.keyboard.press('Enter');
    const pendingTop=(await cards.first().boundingBox()).y;
    const edited='Для\u202fкого – 👩🏽‍💻';await cards.first().getByRole('textbox').fill(edited);
    await cards.first().getByRole('button',{name:'Заменить текст слоя Label 0',exact:true}).click();
    const toast=textTool.locator('.apollo-text-toast .apollo-audit-toast');
    await toast.getByRole('status').filter({hasText:'Заменено текстовых слоёв: 1.'}).waitFor();
    assert.equal(await textTool.locator('.apollo-text-results > p').filter({hasText:/Заменено текстовых слоёв|Применяем исправление/}).count(),0);
    assert.equal((await cards.first().boundingBox()).y,pendingTop,'success does not add a row above the findings');
    assert.equal(await page.locator('.apollo-audit-toast').count(),1,'one success toast only');
    await toast.getByRole('button',{name:'Закрыть уведомление',exact:true}).click();await toast.waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.__fixtureTextReplacements.replacements),[{focusActionId:'v3-focus-0',before:'Для кого 0',after:edited}]);
    assert.equal(await cards.count(),6);assert.equal(await cards.getByRole('button',{name:'Показать в макете: Label 0',exact:true}).count(),0);
    await textTool.getByRole('tab',{name:'Ошибки · 6',exact:true}).waitFor();
    assert.equal(await cards.first().getByRole('button',{name:'Заменить текст слоя Label 1',exact:true}).isDisabled(),false);
    assert.equal(await textTool.getByRole('button',{name:'Применить всё',exact:true}).isDisabled(),false);await capture('texts-one-applied');
    await cards.first().getByRole('button',{name:'Заменить текст слоя Label 1',exact:true}).click();await textTool.getByRole('tab',{name:'Ошибки · 5',exact:true}).waitFor();
    await toast.getByRole('status').filter({hasText:'Заменено текстовых слоёв: 1.'}).waitFor();await capture('texts-success-toast');
    await toast.waitFor({state:'hidden',timeout:9000});
    await textTool.getByRole('tab',{name:'Не проверено · 1',exact:true}).click();await textTool.getByRole('tab',{name:'Ошибки · 5',exact:true}).click();
    await cards.first().getByRole('button',{name:'Показать в макете: Label 2',exact:true}).click();assert.equal(await toast.count(),0,'expired toast is not replayed by focus or rerender');
    assert.equal(await cards.count(),5);assert.equal(await cards.getByRole('button',{name:'Показать в макете: Label 1',exact:true}).count(),0);
    await textTool.getByRole('button',{name:'Применить всё',exact:true}).click();
    await textTool.getByText('Заменено текстовых слоёв: 5.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__fixtureTextReplacements.replacements.length),5);
    assert.equal(await textTool.getByRole('tab',{name:'Ошибки',exact:true}).isDisabled(),true);
    assert.equal(await textTool.getByRole('tab',{name:'Уточнения · 1',exact:true}).getAttribute('aria-selected'),'true');await capture('texts-remaining-applied');
    assert.equal(await cards.count(),1);assert.equal(await cards.getByRole('textbox').count(),0);
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();await textTool.getByRole('button',{name:'Применить всё',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.apollo-text-tool footer button:last-child').disabled);
    await textTool.getByRole('button',{name:'Применить всё',exact:true}).click();
    await textTool.getByText('Заменено текстовых слоёв: 7.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__fixtureTextReplacements.replacements.length),7);
    assert.equal(await textTool.getByRole('tab',{name:'Ошибки',exact:true}).isDisabled(),true);
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();await textTool.getByRole('tab',{name:'Ошибки · 1',exact:true}).waitFor();
    await cards.getByRole('button',{name:'Заменить текст слоя Label 0',exact:true}).click();await textTool.getByText('Замечаний нет.',{exact:true}).waitFor();
    for(const label of ['Ошибки','Уточнения','Не проверено']){
      const tab=textTool.getByRole('tab',{name:label,exact:true});
      assert.equal(await tab.isDisabled(),true);
      assert.equal(await tab.getAttribute('aria-selected'),'false');
      assert.equal(await tab.evaluate(node=>getComputedStyle(node,'::after').content),'none');
    }
    await capture('texts-empty');
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();await textTool.getByRole('alert').filter({hasText:'Данные UX-writer изменились'}).waitFor();await capture('texts-error');
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();
    await textTool.getByRole('alert').filter({hasText:'Модель не справилась с анализом'}).waitFor();
    assert.equal(await textTool.locator('.apollo-text-card').count(),0);
    assert.equal(await textTool.getByRole('button',{name:'Применить всё',exact:true}).count(),0);
    const retry=textTool.getByRole('button',{name:'Повторить анализ',exact:true});assert.equal(await retry.isEnabled(),true);
    await retry.focus();await capture('texts-model-failure');await page.keyboard.press('Enter');
    await textTool.getByRole('tab',{name:'Ошибки · 7',exact:true}).waitFor();
    assert.equal(await textTool.getByRole('button',{name:'Повторить анализ',exact:true}).count(),0);
    assert.equal(await textTool.getByRole('button',{name:'Применить всё',exact:true}).isEnabled(),true);
    await capture('texts-model-retry');
    const beforeOffline=runRequests;proxyOffline=true;
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();
    const availability=textTool.locator('.apollo-compatibility');
    await availability.getByText('Нет связи с Apollo Proxy. Запустите приложение и проверьте подключение снова.',{exact:true}).waitFor({timeout:1500});
    assert.equal(runRequests,beforeOffline,'compatibility refusal must not start a model run');await capture('texts-proxy-offline');
    proxyOffline=false;await availability.getByRole('button',{name:'Проверить снова',exact:true}).click();
    await availability.waitFor({state:'hidden'});
    const recoveredRun=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===runPath);
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();
    await recoveredRun;
    await textTool.getByRole('tab',{name:'Ошибки · 7',exact:true}).waitFor();assert.equal(runRequests,beforeOffline+1);
    await capture('texts-proxy-recovered');
    await textTool.getByRole('button',{name:'Применить всё',exact:true}).click();
    await textTool.getByRole('tab',{name:'Ошибки',exact:true}).waitFor();
    await textTool.getByRole('button',{name:'Закрыть проверку текстов',exact:true}).click();await card.click();
    assert.equal(await cards.getByRole('button',{name:/Текст заменён в слое/}).count(),0);
    assert.equal(await textTool.getByRole('tab',{name:'Ошибки',exact:true}).isDisabled(),true);
    assert.equal(await toast.count(),0,'reopening results does not replay an old success');
    await textTool.getByRole('button',{name:'Новая проверка',exact:true}).click();await textTool.getByRole('tab',{name:'Ошибки · 7',exact:true}).waitFor();
    await page.evaluate(()=>{window.__fixtureTextPartial=true;});await textTool.getByRole('button',{name:'Применить всё',exact:true}).click();
    await textTool.getByRole('tab',{name:'Ошибки · 6',exact:true}).waitFor();assert.equal(await cards.count(),6);
    assert.equal(await cards.getByRole('button',{name:'Показать в макете: Label 0',exact:true}).count(),0);
    assert.equal(await cards.first().getByRole('button',{name:'Заменить текст слоя Label 1',exact:true}).isDisabled(),true);assert.equal(await toast.count(),0);assert(await textTool.getByRole('alert').count());await capture('texts-partial-protected');
    if(output)await fs.writeFile(path.join(output,'geometry.json'),JSON.stringify(geometry,null,2)+'\n');
    assert.deepEqual(errors, []);
    console.log('PASS: fixed 800 px; shared stages, Figma geometry, tabs and counts, hover, sticky header/footer, editable replacement and bulk action, stale/empty/error states, nested Sources, exact layer focus, global platform and both exports on Tools.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
