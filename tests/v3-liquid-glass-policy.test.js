'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {identifyLegacyComponent}=require('../src/v3-audit/policies/liquidGlassComponentPolicy');

const family='a'.repeat(40),disabled='b'.repeat(40),enabled='c'.repeat(40),older='d'.repeat(40);
const property='👻 LiquidGlassEffect';

function assess(mainComponentKey,variantProperties,valueSource){
 const variantCondition={property,equals:'False',missingPropertyValue:'False',
  variantValues:{[disabled]:'False',[enabled]:'True'},valueSource};
 const registry={platform:'iOS',families:[{key:family,variantKeys:[disabled,enabled,older],source:'catalog',variantCondition}]};
 return identifyLegacyComponent(registry,{platform:'iOS',nodeType:'INSTANCE',componentSetKey:family,mainComponentKey,variantProperties});
}

test('the generic missing-property fallback cannot contradict a recorded True',()=>{
 assert.deepEqual(assess(enabled,{}),{status:'unknown',reason:'variant-condition-conflict'});
 assert.equal(assess(enabled).status,'not-applicable');
 assert.equal(assess(disabled,{}).status,'legacy');
 assert.equal(assess(older,{}).status,'legacy');
});

test('the opt-in instance policy still advises an update for a confirmed missing property',()=>{
 assert.equal(assess(enabled,{},'instance-properties').reason,'variant-property-missing');
 assert.equal(assess(disabled,{[property]:'True'},'instance-properties').status,'not-applicable');
 assert.equal(assess(disabled,undefined,'instance-properties').status,'unknown');
});
