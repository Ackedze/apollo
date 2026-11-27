'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');
const { data } = require('./fixtures/v3-audit-compact-index.cjs');
const { buildV3Groups, nativeMetrics } = require('../src/v3-audit/ui-model');

const runtime = { exports: {} };
const { outputFiles } = buildSync({
  stdin: {
    contents: 'module.exports = Object.assign({}, require("./src/v3-audit/entry"), require("./src/v3-audit/embedded-data"))',
    resolveDir: path.join(__dirname, '..'),
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', supported: { 'object-rest-spread': false },
});
new Function('module', 'exports', 'require', outputFiles[0].text)(runtime, runtime.exports, require);
const { createOfflineAuditIndex, runV3Audit } = runtime.exports;

const libraries = {
  web: '101 _ Web Typography.json',
  android: '102 _ Android Typography.json',
  ios: '103 _ iOS Typography.json',
};
const styleKey = {
  ios: '66996655badb6ed1d405c7779c68f6e5479ab1c1',
  web: '4'.repeat(40),
  mobile: '3'.repeat(40),
  android: '5'.repeat(40),
};
const tokenKey = { ios: '6'.repeat(40), android: '7'.repeat(40), web: '8'.repeat(40), mobile: '2'.repeat(40) };
const styleId = key => 'S:' + key + ',';
const alias = key => ({ type: 'VARIABLE_ALIAS', id: 'VariableID:' + key + '/42:1' });

function typographyPayload() {
  const payload = structuredClone(data.payload);
  for (const [platform, file] of Object.entries(libraries)) {
    const library = file.slice(0, -5);
    for (const [kind, key] of [['styles', styleKey[platform]], ['tokens', tokenKey[platform]]]) {
      const id = payload.sources.sources.length;
      payload.sources.sources.push({ id, kind, catalogPath: kind + '/' + file, library });
      payload.resources[kind][key] = { status: 'active', closed: false, observations: [{ source: id, name: 'Paragraph/15–20 ' + platform }] };
      if (platform === 'web') {
        const mobileKey = kind === 'styles' ? styleKey.mobile : tokenKey.mobile;
        const name = kind === 'styles' ? 'Headline-System-Mobile/15–20 mobile' : 'font-size/mobile-label-mobile';
        payload.resources[kind][mobileKey] = { status: 'active', closed: false, observations: [{ source: id, name }] };
      }
    }
    const style = {
      key: styleKey[platform], type: 'text', group: 'Paragraph', name: '15–20 ' + platform,
      value: { kind: 'text', data: { fontName: 'Inter Regular', fontSize: 15, lineHeight: '20.00', letterSpacing: '0.00' } },
    };
    const styles = [style];
    if (platform === 'web') styles.push(Object.assign({}, style, { key:styleKey.mobile, group:'Headline-System-Mobile', name:'15–20 mobile' }));
    payload.styleCatalogs.push({ meta: { fileName: libraries[platform], library }, styles });
    payload.tokenCatalogs.push({ meta: { fileName: library, library }, collections: [{ name: 'Font',
      variables: [{ key: tokenKey[platform], id: platform==='android'?'VariableID:3916:89':
        platform==='ios'?'VariableID:35337:966':'VariableID:'+tokenKey[platform], name: 'Font size ' + platform,
        resolvedType: 'FLOAT', scopes: ['FONT_SIZE'] }].concat(platform==='web' ? [{
          key:tokenKey.mobile, name:'font-size/mobile-label-mobile', resolvedType:'FLOAT', scopes:['FONT_SIZE'],
        }] : []),
    }] });
  }
  return payload;
}

test('typography channels use source observations, with no mismatch inferred from missing or unknown catalogs', () => {
  const payload = typographyPayload();
  const resources = payload.resources.styles;
  const shared = '9'.repeat(40);
  resources[shared] = { status: 'active', closed: false,
    observations: resources[styleKey.ios].observations.concat(resources[styleKey.web].observations) };
  const unknown = '1'.repeat(40);
  resources[unknown] = { status: 'active', closed: false, observations: [{source:0}].concat(resources[styleKey.ios].observations) };
  const nameless = '0'.repeat(40);
  resources[nameless] = { status: 'active', closed: false, observations: [{source:resources[styleKey.web].observations[0].source}] };
  const index = createOfflineAuditIndex(payload, data.dataId);
  assert.deepEqual(index.typographyChannels('styles', styleKey.ios), ['iOS']);
  assert.deepEqual(index.typographyChannels('tokens', tokenKey.android), ['Android']);
  assert.deepEqual(index.typographyChannels('styles', styleKey.mobile), ['MobileWeb']);
  assert.deepEqual(index.typographyChannels('tokens', tokenKey.mobile), ['MobileWeb']);
  assert.deepEqual(index.typographyChannels('styles', shared), ['Desktop', 'iOS']);
  assert.equal(index.typographyChannels('styles', nameless), undefined);
  assert.equal(index.typographyChannels('styles', unknown), undefined);
  assert.equal(index.typographyChannels('styles', 'absent'), undefined);
  assert.equal(createOfflineAuditIndex(data.payload, data.dataId).typographyChannels('styles', styleKey.ios), undefined);
});

test('Design audit finds channel mismatches for direct and range typography and suggests compatible styles', async t => {
  const offlineIndex = createOfflineAuditIndex(typographyPayload(), data.dataId);
  const page = { id:'1:1', type:'PAGE', name:'Fixture', parent:null, explicitVariableModes:{} };
  const mixed = Symbol('mixed');
  const iosAlias = alias(tokenKey.ios);
  const androidAlias = alias(tokenKey.android);
  const aliasLookups = [];
  function text(id, name, textStyleId, ranges, bindings) {
    return { id, name, type:'TEXT', visible:true, parent:page, characters:name, textStyleId,
      fontName:{ family:'Inter', style:'Regular' }, fontSize:15, lineHeight:{ unit:'PIXELS', value:20 },
      letterSpacing:{ unit:'PIXELS', value:0 }, fills:[], openTypeFeatures:{},
      boundVariables:bindings, getStyledTextSegments:()=>ranges };
  }
  const value = text('1:2','Value',styleId(styleKey.ios),[{ textStyleId:styleId(styleKey.ios), fills:[] }],
    {fontSize:[{type:'VARIABLE_ALIAS',id:'VariableID:3916:89'}],
      paragraphSpacing:[{type:'VARIABLE_ALIAS',id:'VariableID:35337:966'}]});
  const mixedValue = text('1:3','Mixed',mixed,[
    { textStyleId:styleId(styleKey.ios), boundVariables:{fontSize:iosAlias}, fills:[] },
    { textStyleId:styleId(styleKey.web), boundVariables:{lineHeight:{type:'VARIABLE_ALIAS',id:'VariableID:8:1'}}, fills:[] },
    { textStyleId:styleId(styleKey.mobile), boundVariables:{fontSize:alias(tokenKey.mobile)}, fills:[] },
  ],{ fontSize:[iosAlias], fills:[androidAlias] });
  const raw = text('1:4','Raw','',[]);
  const selection = [value,mixedValue,raw];
  page.children = selection;
  globalThis.figma = {
    currentPage:page, currentUser:null, fileKey:'fixture', root:{name:'Fixture'}, editorType:'figma', mixed,
    getNodeByIdAsync:async id=>selection.find(node=>node.id===id)??null,
    getStyleByIdAsync:async()=>null,
    variables:{ getVariableByIdAsync:async id=>{
      aliasLookups.push(id);
      if(id==='VariableID:8:1')return {key:tokenKey.android};
      if(id==='VariableID:3916:89')return {key:'a'.repeat(40)};
      return null;
    } },
  };
  t.after(()=>delete globalThis.figma);
  const run = channel => runV3Audit({ runId:channel, channel, offlineIndex, pageType:null, shellAuditEnabled:true,
    pluginVersion:'fixture', selection, assertCurrent(){}, onProgress(){} });
  for (const channel of ['Desktop', 'MobileWeb', 'iOS', 'Android']) {
    const result = await run(channel);
    const views = result.views.visibleViews;
    const expected = [
      [value,styleKey.ios,'iOS'],
      [mixedValue,styleKey.ios,'iOS'],[mixedValue,styleKey.web,'Desktop'],[mixedValue,styleKey.mobile,'MobileWeb'],
      [mixedValue,tokenKey.ios,'iOS'],[mixedValue,tokenKey.android,'Android'],[mixedValue,tokenKey.mobile,'MobileWeb'],
    ].filter(([, , compatible])=>compatible!==channel).map(([node,key,compatible])=>node.id+':'+key+':'+compatible);
    assert.deepEqual(views.wrongChannelTypography.map(finding=>finding.id+':'+finding.resource.key+':'+finding.channels[0]).sort(), expected.sort());
    assert(views.wrongChannelTypography.every(finding=>finding.selectedChannel===channel));
    assert(!views.customStyles.some(row => row.id === value.id || row.id === mixedValue.id),
      'Known text styles are valid in the style audit across channels');
    const available = views.customStyles.find(row=>row.id===raw.id).actions.map(action=>action.targetName);
    assert.equal(available.length,1);
    const compatible = channel==='iOS'?'ios':channel==='Android'?'android':channel==='MobileWeb'?'mobile':'web';
    assert(available[0].endsWith(compatible), 'Style suggestions must match the selected channel');
  }
  assert(aliasLookups.includes('VariableID:8:1'), 'A numerical ID is resolved in the current document');
  assert(aliasLookups.includes('VariableID:3916:89'), 'A numeric clash with the export must resolve to the document key');
});

test('typography findings appear in Tokens with a separate category from component channel findings', () => {
  const result = {
    visibleViews: {
      wrongChannelTypography: [{
        id:'text', resource:{type:'style',key:styleKey.ios,name:'iOS'}, channels:['iOS'], selectedChannel:'Desktop',
      }],
      wrongChannel: [{id:'component',name:'Mobile component'}],
    },
  };
  const summary = buildV3Groups(result);
  const styles = summary.groups.find(group => group.id === 'styles');
  assert.equal(styles.title, 'Токены');
  assert.deepEqual(styles.categories.map(category => category.id), ['deprecatedStyles', 'detachedStyles', 'customStyles', 'wrongChannelTypography']);
  assert.equal(styles.count, 1);
  assert.equal(summary.total, 2);
  const checks = nativeMetrics(result,{}).checks;
  assert.equal(checks.find(check => check.id === 'v3:wrongChannelTypography').findings.length, 1);
  assert.equal(checks.find(check => check.id === 'v3:wrongChannel').findings.length, 1);
});
