// Optional visual gate with an existing Playwright/Chrome installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fixture = require("./fixtures");
const runtime = require("../dist/runtime.cjs");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const authored = require("./authoring-fixtures");
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dist/ui.html")).href);
    await page.evaluate(() => { window.bridgeMessages = []; parent.postMessage = message => window.bridgeMessages.push(message.pluginMessage); });
    await page.locator('#contract-file').setInputFiles({ name: 'source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(authored.source())) });
    await page.waitForFunction(() => window.bridgeMessages.some(message => message.type === 'load-contract'));
    assert.equal(await page.evaluate(() => window.bridgeMessages.at(-1).source.manual.documentType), 'component-contract-manual');
    await page.evaluate(() => { window.bridgeMessages = []; });
    await page.locator('#contract-file').setInputFiles({ name: 'compiled.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.contract())) });
    await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert.equal(await page.evaluate(() => window.bridgeMessages.length), 0);
    const core = require("../packages/component-contract-core/dist/core.cjs");
    const source = authored.source(), projection = runtime.loadAuthoringSource(source).contract;
    const zip = core.createZip([core.textZipEntry('contract.manual.json', source.manual), core.textZipEntry('compiled/component-contract.v2.json', projection)]);
    await page.locator('#contract-file').setInputFiles({ name: 'authoring.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await page.waitForFunction(() => window.bridgeMessages.some(message => message.type === 'load-contract'));
    assert.equal(await page.evaluate(() => window.bridgeMessages.at(-1).source.projectionStamp.compiledHash), runtime.contractHash(projection));
    const document = fixture.contract(), snapshot = fixture.snapshot(); snapshot.nodes[0].appearance.opacity = .5;
    const audit = { auditId: 'a'.repeat(64), release: { channel: 'local-file' }, result: runtime.auditContractSnapshot(snapshot, document), snapshot, warnings: [] };
    for (const width of [440, 360]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto(pathToFileURL(path.resolve(__dirname, "../dist/ui.html")).href);
      assert.equal(await page.locator('#audit').isDisabled(), true);
      await page.evaluate(() => {
        window.bridgeMessages = [];
        const emit = data => window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: data }, source: window }));
        parent.postMessage = message => window.bridgeMessages.push(message.pluginMessage);
        emit({ type: 'contract-loaded', name: 'Test', revision: 1 });
        emit({ type: 'selection', valid: true, name: 'Test instance' });
      });
      await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', {name:'Проверить',exact:true}).click();
      assert.equal(await page.locator('#audit').isDisabled(), true);
      const request = await page.evaluate(() => window.bridgeMessages.at(-1));
      await page.evaluate(({ audit, request, rules }) => window.dispatchEvent(new MessageEvent('message', {
        data: { pluginMessage: { type: 'audit-result', requestId: request.requestId, audit, rules } }, source: window,
      })), { audit, request, rules: document.rules.map(rule => ({ ruleId: rule.ruleId, title: rule.presentation.title })) });
      assert.equal(await page.locator('.finding').count(), 1);
      assert.equal(await page.locator('.finding-property').innerText(), 'Непрозрачность (0–1)');
      assert.equal(await page.locator('.finding-value.expected dd').innerText(), '1');
      assert.equal(await page.locator('.finding-value.actual dd').innerText(), '0,5');
      assert.match(await page.locator('#coverage').innerText(), /завершены/);
      assert.equal(await page.locator('#explain').isDisabled(), true);
      await page.locator('.finding button').click();
      const focus = await page.evaluate(() => window.bridgeMessages.at(-1));
      assert.equal(focus.evaluationId, audit.result.engine.evaluations[0].evaluationId);
      const geometry = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(geometry.content <= geometry.viewport, 'No horizontal overflow');
      const resultOutput = process.env.DESIGN_CHECK_QA_ROOT ? path.join(process.env.DESIGN_CHECK_QA_ROOT, 'screenshots', `result-${width}.png`) : path.resolve(__dirname, `../dist/visual-qa/result-${width}.png`);
      fs.mkdirSync(path.dirname(resultOutput), { recursive: true });
      await page.screenshot({ path: resultOutput, fullPage: true });
      await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
        data: { pluginMessage: { type: 'selection', valid: false, name: '', invalidated: true } }, source: window,
      })));
      assert.equal(await page.locator('#result').isVisible(), true);
      assert.equal(await page.locator('#audit').isDisabled(), true);
    }
    const nested = require("./dependency-fixtures").dependencyFixture();
    nested.snapshot.nodes.find(n => n.id === 'left-child').appearance.opacity = .4;
    require("./dependency-fixtures").syncCapture(nested.snapshot, 'left');
    const nestedAudit = { auditId: 'b'.repeat(64), release: { channel: 'local-file' }, result: runtime.auditContractSnapshot(nested.snapshot, nested.host), snapshot: nested.snapshot, warnings: [] };
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dist/ui.html")).href);
    await page.evaluate(() => {
      window.bridgeMessages = []; parent.postMessage = message => window.bridgeMessages.push(message.pluginMessage);
      for (const data of [{ type: 'contract-loaded', name: 'Host', revision: 1 }, { type: 'selection', valid: true, name: 'Host instance' }])
        window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: data } }));
    });
    await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', {name:'Проверить',exact:true}).click();
    const nestedRequest = await page.evaluate(() => window.bridgeMessages.at(-1));
    await page.evaluate(({ audit, rules, request }) => window.dispatchEvent(new MessageEvent('message', { source: window,
      data: { pluginMessage: { type: 'audit-result', requestId: request.requestId, audit, rules } } })), { audit: nestedAudit, rules: runtime.collectContractRules(nested.host), request: nestedRequest });
    assert.match(await page.locator('#coverage').innerText(), /Вложенные компоненты: проверено 2/);
    assert.match(await page.locator('.finding').innerText(), /test.child.opacity.1.*left/s);
    await page.locator('.finding button').click();
    assert.equal((await page.evaluate(() => window.bridgeMessages.at(-1))).evaluationId, nestedAudit.result.engine.evaluations.find(e => e.dependency && e.classification === 'violation').evaluationId);
    nested.snapshot.componentDependencyCaptures = [];
    nestedAudit.result = runtime.auditContractSnapshot(nested.snapshot, nested.host);
    await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', {name:'Проверить',exact:true}).click();
    const repeatedNestedRequest = await page.evaluate(() => window.bridgeMessages.at(-1));
    await page.evaluate(({ audit, rules, request }) => window.dispatchEvent(new MessageEvent('message', { source: window,
      data: { pluginMessage: { type: 'audit-result', requestId: request.requestId, audit, rules } } })), { audit: nestedAudit, rules: runtime.collectContractRules(nested.host), request: repeatedNestedRequest });
    assert.match(await page.locator('#coverage').innerText(), /неполных проверок 2/);
    assert.equal(await page.locator('#warnings .warning').count(), 2);
    // Synthetic area protocol: no live proxy, Figma or agent calls.
    await page.goto(pathToFileURL(path.resolve(__dirname, "../dist/ui.html")).href);
    const first = { scopeId: 'first', name: 'First instance', auditId: 'c'.repeat(64), snapshot, result: audit.result,
      release: { id: 'e'.repeat(64), channel: 'local-pilot', contractId: 'synthetic.first', sourceHash: 'f'.repeat(64) } };
    const second = Object.assign({}, first, { scopeId: 'second', name: 'Second instance', auditId: 'd'.repeat(64),
      release: Object.assign({}, first.release, { contractId: 'synthetic.second' }) });
    const components = [first, second];
    const area = { auditId: '9'.repeat(64), release: { id: 'e'.repeat(64), channel: 'local-pilot' }, components,
      notChecked: [{ nodeId: 'missing', name: 'Missing component', message: 'Контракт не найден.' }], warnings: [],
      result: runtime.aggregateAreaResult(components, [{}], { complete: true, components: [{}, {}, {}] }) };
    await page.evaluate(() => {
      window.bridgeMessages = []; window.httpRequests = [];
      parent.postMessage = message => window.bridgeMessages.push(message.pluginMessage);
      window.emit = data => window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: data } }));
      window.fetch = async (url, options) => {
        const body = JSON.parse(options.body); window.httpRequests.push({ url, body });
        if (url.endsWith('/resolve')) return { ok: true, json: async () => ({ success: true, releaseId: 'e'.repeat(64), contracts: [], resolutions: [] }) };
        return new Promise(resolve => { window.finishAgent = () => resolve({ ok: true, json: async () => ({ success: true, explanation: 'Late explanation' }) }); });
      };
      window.emit({ type: 'selection', valid: true, name: 'Selected area' });
    });
    assert.equal(await page.locator('#audit').isDisabled(), false, 'Default area flow requires no manual package load');
    await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', {name:'Проверить',exact:true}).click();
    const areaRequest = await page.evaluate(() => window.bridgeMessages.at(-1));
    await page.evaluate(request => window.emit({ type: 'resolve-contracts', requestId: request.requestId + ':resolve',
      components: [{ componentKey: 'test-key', componentSetKey: '' }] }), areaRequest);
    await page.waitForFunction(() => window.bridgeMessages.some(m => m.type === 'contracts-resolved'));
    const resolved = await page.evaluate(() => window.bridgeMessages.at(-1));
    assert.equal(resolved.requestId, areaRequest.requestId + ':resolve'); assert.equal(resolved.data.releaseId, 'e'.repeat(64));
    assert.equal((await page.evaluate(() => window.httpRequests[0])).url, 'http://localhost:3001/v2/contracts/resolve');
    await page.evaluate(({ area, request, rules }) => window.emit({ type: 'audit-result', requestId: request.requestId, audit: area, rules }),
      { area, request: areaRequest, rules: components.map((component, i) => ({ componentScopeId: component.scopeId,
        ruleId: component.result.engine.evaluations[0].ruleId, title: i ? 'Second requirement' : 'First requirement' })) });
    assert.match(await page.locator('#coverage').innerText(), /проверено 2.*без проверки 1/);
    assert.match(await page.locator('#findings').innerText(), /First instance.*First requirement.*Second instance.*Second requirement/s);
    await page.locator('#gaps button').click();
    assert.equal((await page.evaluate(() => window.bridgeMessages.at(-1))).nodeId, 'missing');
    assert.equal(await page.locator('#explain-scope option').count(), 2);
    assert.equal((await page.evaluate(() => window.httpRequests)).length, 1, 'No automatic agent calls');
    await page.locator('#explain').click();
    await page.waitForFunction(() => !!window.finishAgent);
    const explanationRequest = await page.evaluate(() => window.httpRequests.at(-1));
    assert.equal(explanationRequest.body.auditId, first.auditId);
    assert.deepEqual(explanationRequest.body.release, first.release);
    assert.deepEqual(explanationRequest.body.snapshot, first.snapshot);
    await page.locator('#explain-scope').selectOption('1');
    await page.evaluate(() => { window.finishAgent(); window.finishAgent = null; });
    assert.equal(await page.locator('#explanation').innerText(), '', 'Old component explanation is ignored');
    await page.locator('#explain').click();
    await page.waitForFunction(() => !!window.finishAgent);
    assert.equal((await page.evaluate(() => window.httpRequests.at(-1))).body.auditId, second.auditId);
    await page.evaluate(() => {
      window.emit({ type: 'selection', valid: false, invalidated: true });window.emit({type:'audit-invalidated',auditId:'9'.repeat(64)}); window.finishAgent();
    });
    assert.equal(await page.locator('#result').isVisible(), true);
    assert.equal(await page.locator('#explanation').innerText(), '');
    // Real synthetic traces test the comparison renderer for scoped numeric,
    // paint, missing-reference and allowed-set findings at narrow widths.
    const paddingDocument = fixture.contract();
    paddingDocument.rules[0].assert = { predicate: 'equals', actual: { fact: 'layout.padding.right' }, expected: { literal: 20 }, missingPolicy: 'unknown' };
    paddingDocument.rules[0].presentation.title = 'Synthetic right padding requirement';
    const paddingComponents = [24, 28].map((value, index) => {
      const sample = fixture.snapshot(); sample.nodes[0].layout = { padding: { right: value } };
      return { scopeId: `padding-${index}`, name: `Padding ${index}`, release: { channel: 'local-file' }, snapshot: sample,
        auditId: String(index).repeat(64), result: runtime.auditContractSnapshot(sample, paddingDocument) };
    });
    const paintDocument = fixture.contract();
    const expectedPaint = [{ type: 'SOLID', color: { r: 255, g: 255, b: 255 }, tokenId: 'synthetic-white', opacity: 1 }];
    const actualPaint = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, tokenId: 'synthetic-black', opacity: 1 }];
    paintDocument.rules[0].assert = { predicate: 'equals', actual: { fact: 'appearance.fill' }, expected: { literal: expectedPaint } };
    paintDocument.rules[0].presentation.title = 'Synthetic fill must use the white token';
    const paintSnapshot = fixture.snapshot(); paintSnapshot.nodes[0].appearance.fill = actualPaint;
    const paintComponent = { scopeId: 'paint', name: 'Paint', release: { channel: 'local-file' }, snapshot: paintSnapshot,
      auditId: '7'.repeat(64), result: runtime.auditContractSnapshot(paintSnapshot, paintDocument) };
    const missingSnapshot = fixture.snapshot(); missingSnapshot.nodes[0].appearance.radius = 24;
    const missingDocument = fixture.contract();
    missingDocument.rules[0].assert = { predicate: 'matches-effective-baseline', actual: { fact: 'appearance.radius' }, expected: { fact: 'baseline.effective.appearance.radius' }, missingPolicy: 'unknown' };
    missingDocument.rules[0].presentation.title = 'Synthetic radius must match the independent reference';
    const missingComponent = { scopeId: 'reference', name: 'Missing reference', release: { channel: 'local-file' }, snapshot: missingSnapshot,
      auditId: '8'.repeat(64), result: runtime.auditContractSnapshot(missingSnapshot, missingDocument) };
    const comparisonComponents = paddingComponents.concat(paintComponent, missingComponent);
    const comparisonAudit = { auditId: 'f'.repeat(64), release: { channel: 'local-file' }, components: comparisonComponents, notChecked: [], warnings: [],
      result: runtime.aggregateAreaResult(comparisonComponents, [], { complete: true, components: [{}, {}, {}, {}] }) };
    const displayMetadata = { schemaVersion: 'apollo.audit-display-metadata.v1', resources: [
      { kind: 'token', id: 'synthetic-white', name: 'Color/White', collectionName: 'Synthetic DS' },
      { kind: 'token', id: 'synthetic-black', name: 'Color/Black', collectionName: 'Synthetic DS' } ] };
    const comparisonRules = comparisonComponents.map((component, i) => {
      const rule = [paddingDocument, paddingDocument, paintDocument, missingDocument][i].rules[0];
      return { ruleId: rule.ruleId, componentScopeId: component.scopeId, title: rule.presentation.title, assert: rule.assert, effect: rule.effect };
    });
    for (const width of [440, 360]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto(pathToFileURL(path.resolve(__dirname, "../dist/ui.html")).href);
      await page.evaluate(() => {
        window.bridgeMessages = []; parent.postMessage = message => window.bridgeMessages.push(message.pluginMessage);
        window.dispatchEvent(new MessageEvent('message', { source: window, data: { pluginMessage: { type: 'selection', valid: true } } }));
      });
      await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомизации(?! \[WIP\])/}).click();
      await page.getByRole('button', {name:'Проверить',exact:true}).click();
      const request = await page.evaluate(() => window.bridgeMessages.at(-1));
      await page.evaluate(({ audit, rules, request, displayMetadata }) => window.dispatchEvent(new MessageEvent('message', { source: window,
        data: { pluginMessage: { type: 'audit-result', audit, rules, displayMetadata, requestId: request.requestId } } })), { audit: comparisonAudit, rules: comparisonRules, request, displayMetadata });
      const cards = page.locator('#findings .finding');
      assert.equal(await cards.count(), 4);
      for (const [index, value] of [24, 28].entries()) {
        assert.equal(await cards.nth(index).locator('.finding-property').innerText(), 'Отступ справа');
        assert.equal(await cards.nth(index).locator('.expected dd').innerText(), '20 px');
        assert.equal(await cards.nth(index).locator('.actual dd').innerText(), `${value} px`);
      }
      assert.match(await cards.nth(2).locator('.expected .finding-readable').innerText(), /#FFFFFF.*Color\/White.*Непрозрачность: 100%/s);
      assert.match(await cards.nth(2).locator('.actual .finding-readable').innerText(), /#000000.*Color\/Black.*Непрозрачность: 100%/s);
      assert.doesNotMatch(await cards.nth(2).locator('.actual .finding-readable').innerText(), /synthetic-black|Token ID|Opacity/);
      await cards.nth(2).locator('.actual details summary').click();
      assert.match(await cards.nth(2).locator('.actual pre').innerText(), /"r": 0/);
      assert.match(await cards.nth(2).locator('.actual pre').innerText(), /synthetic-black/);
      assert.equal(await cards.nth(3).locator('.expected dd').innerText(), 'Значение отсутствует');
      assert.match(await cards.nth(3).innerText(), /Ожидаемое значение не получено/);
      await cards.nth(1).locator('button').click();
      assert.equal((await page.evaluate(() => window.bridgeMessages.at(-1))).evaluationId, comparisonAudit.result.engine.evaluations[1].evaluationId);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const comparisonOutput = process.env.DESIGN_CHECK_QA_ROOT ? path.join(process.env.DESIGN_CHECK_QA_ROOT, 'screenshots', `token-comparison-${width}.png`) : path.resolve(__dirname, `../dist/visual-qa/comparison-${width}.png`);
      fs.mkdirSync(path.dirname(comparisonOutput), { recursive: true });
      await page.screenshot({ path: comparisonOutput, fullPage: true });
    }
    // Desktop Figma nests the UI in sandbox wrappers. Its editor bridge
    // can post from an ancestor other than the UI's immediate parent.
    const html = fs.readFileSync(path.resolve(__dirname, "../dist/ui.html"), 'utf8');
    await page.setContent('<iframe id="sandbox"></iframe><iframe id="foreign"></iframe>');
    await page.locator('#sandbox').evaluate((frame, html) => {
      frame.srcdoc = '<iframe id="wrapper"></iframe>';
      frame.onload = () => {
        const wrapper = frame.contentDocument.querySelector('#wrapper');
        wrapper.srcdoc = '<iframe id="plugin"></iframe>';
        wrapper.onload = () => { wrapper.contentDocument.querySelector('#plugin').srcdoc = html; };
      };
    }, html);
    const sandbox = page.frameLocator('#sandbox');
    const plugin = sandbox.frameLocator('#wrapper').frameLocator('#plugin');
    await plugin.getByRole('button', {name:'Проверить',exact:true}).waitFor();
    await page.evaluate(() => {
      const target = document.querySelector('#sandbox').contentDocument.querySelector('#wrapper').contentDocument.querySelector('#plugin').contentWindow;
      target.postMessage({ pluginMessage: { type: 'selection', valid: true, name: 'Top bridge instance' } }, '*');
      target.postMessage({ pluginMessage: { type: 'contract-loaded', name: 'Top bridge', revision: 1 } }, '*');
    });
    await plugin.getByRole('button', {name:'Проверить',exact:true}).waitFor();
    assert.equal(await plugin.locator('#selection').innerText(), 'Top bridge instance');
    await sandbox.locator('#wrapper').evaluate(frame => {
      frame.contentDocument.querySelector('#plugin').contentWindow.postMessage({
        pluginMessage: { type: 'selection', valid: true, name: 'Intermediate editor instance' },
      }, '*');
    });
    await plugin.locator('#selection').filter({ hasText: 'Intermediate editor instance' }).waitFor();
    await page.evaluate(() => {
      const target = document.querySelector('#sandbox').contentDocument.querySelector('#wrapper').contentDocument.querySelector('#plugin').contentWindow;
      target.dispatchEvent(new MessageEvent('message', {
        source: document.querySelector('#foreign').contentWindow,
        data: { pluginMessage: { type: 'selection', valid: false, name: 'Unrelated frame', invalidated: true } },
      }));
    });
    assert.equal(await plugin.locator('#selection').innerText(), 'Intermediate editor instance');
    assert.equal(await plugin.getByRole('button', {name:'Проверить',exact:true}).isDisabled(), false);
    assert.deepEqual(errors, []); console.log('UI: numeric/paint/missing evidence comparisons and scoped focus at 440/360 px, automatic key fetch, area gaps, explanation/stale guards, child coverage and nested editor bridge passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
