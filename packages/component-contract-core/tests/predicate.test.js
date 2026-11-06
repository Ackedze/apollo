const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const engine = require('../dist/predicate.cjs');
const core = require('../dist/core.cjs');

test('browser-safe hashes match Node SHA-256, including Unicode and absent TextEncoder', () => {
  const original = global.TextEncoder;
  global.TextEncoder = undefined;
  try {
    for (const value of ['', 'Spinner', 'Пример 🧩', '\ud800', { z: 3, a: ['x', null, '🚀'] }, Array.from({ length: 1000 }, (_, i) => `Строка ${i}`)]) {
      const serialized = engine.stableStringify(value);
      const expected = crypto.createHash('sha256').update(serialized).digest('hex');
      assert.equal(engine.stableHash(value), expected);
      assert.equal(core.stableHash(value), expected);
    }
  } finally { global.TextEncoder = original; }
});

test('browser-safe hashes retain SHA-256 block boundaries and large multi-block payloads', () => {
  const values = Array.from({ length: 160 }, (_, size) => 'x'.repeat(size));
  values.push('a'.repeat(1000000), 'ё🦊'.repeat(257));
  let seed = 37;
  for (let i = 0; i < 80; i++) {
    let text = '';
    for (let j = 0; j < i * 7; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      text += String.fromCharCode(seed & 65535);
    }
    values.push(text);
  }
  for (const value of values) {
    const expected = crypto.createHash('sha256').update(engine.stableStringify(value)).digest('hex');
    assert.equal(engine.stableHash(value), expected);
    assert.equal(core.stableHash(value), expected);
  }
});

test('evaluation IDs repeat for a frozen snapshot and change with actual facts', () => {
  const rule = { schemaVersion: 'apollo.rule-ir.v1', ruleId: 'fixture.opacity', revision: 1,
    source: { path: 'fixture', checksum: 'a'.repeat(64), anchor: 'fixture' }, authority: { status: 'active', provenance: 'test' },
    effect: 'require', scope: {}, select: { from: 'selection-root', traverse: 'self' },
    assert: { predicate: 'equals', actual: { fact: 'opacity' }, expected: { literal: 1 }, missingPolicy: 'unknown' }, severity: 'error', unknownPolicy: 'human-review' };
  const snapshot = { schemaVersion: 'apollo.predicate-snapshot.v2', selection: ['root'], nodes: [{ id: 'root', type: 'INSTANCE', visible: true, opacity: 1 }], context: {} };
  const first = engine.evaluateRules({ snapshot, rules: [rule] });
  assert.deepEqual(engine.evaluateRules({ snapshot, rules: [rule] }), first);
  snapshot.nodes[0].opacity = .5;
  const changed = engine.evaluateRules({ snapshot, rules: [rule] });
  assert.equal(first.evaluations[0].classification, 'compliant');
  assert.equal(changed.evaluations[0].classification, 'violation');
  assert.notEqual(changed.evaluations[0].evaluationId, first.evaluations[0].evaluationId);
});

test('execution index is reused across rules but never retained across audits',()=>{
 const rule={schemaVersion:'apollo.rule-ir.v1',ruleId:'index',revision:1,source:{path:'fixture',checksum:'a'.repeat(64),anchor:'fixture'},authority:{status:'active',provenance:'test'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},assert:{predicate:'equals',actual:{fact:'opacity'},expected:{literal:1},missingPolicy:'unknown'},severity:'error',unknownPolicy:'human-review'};
 const nodes=[{id:'root',type:'INSTANCE',visible:true,opacity:1}];let maps=0;
 Object.defineProperty(nodes,'map',{value:function(...args){maps++;return Array.prototype.map.apply(this,args);}});
 const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',selection:['root'],nodes,context:{}};
 const before=JSON.stringify(snapshot),first=engine.evaluateRules({snapshot,rules:Array.from({length:20},(_,i)=>({...rule,ruleId:'index'+i}))});
 const manyMaps=maps;maps=0;engine.evaluateRules({snapshot,rules:[rule]});assert.equal(manyMaps,maps);assert.equal(JSON.stringify(snapshot),before);assert.equal(Object.getOwnPropertySymbols(snapshot).length,0);
 snapshot.nodes=[{id:'root',type:'INSTANCE',visible:true,opacity:.5}];
 const next=engine.evaluateRules({snapshot,rules:[rule]});assert.equal(first.evaluations[0].classification,'compliant');assert.equal(next.evaluations[0].classification,'violation');
});

test('unread child facts make aggregate comparison UNKNOWN while independent rules still run', () => {
 const subject={id:'root',type:'INSTANCE',visible:true,unknownFacts:['appearance.typography.styleId'],
  appearance:{typography:{styleId:'unread',fontSize:18}},baseline:{effective:{appearance:{typography:{styleId:'expected',fontSize:16}}}}};
 const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',selection:['root'],nodes:[subject],context:{}};
 const rule=(id,fact)=>({schemaVersion:'apollo.rule-ir.v1',ruleId:id,revision:1,source:{path:'fixture',checksum:'a'.repeat(64),anchor:'fixture'},
  authority:{status:'active',provenance:'test'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},
  assert:{predicate:'equals',actual:{fact},expected:{fact:'baseline.effective.'+fact},missingPolicy:'unknown'},severity:'error',unknownPolicy:'human-review'});
 const result=engine.evaluateRules({snapshot,rules:[rule('whole','appearance.typography'),rule('font','appearance.typography.fontSize')]});
 assert.equal(result.evaluations.find(e=>e.ruleId==='whole').classification,'human-review');
 assert.equal(result.evaluations.find(e=>e.ruleId==='font').classification,'violation');
});

test('exact proved finite scalars refine only ancestor UNKNOWN and preserve all other gaps',()=>{
 const rule=fact=>({schemaVersion:'apollo.rule-ir.v1',ruleId:'partial',revision:1,source:{path:'fixture',checksum:'a'.repeat(64),anchor:'fixture'},
  authority:{status:'active'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},
  assert:{predicate:'equals',actual:{fact},expected:{literal:0},missingPolicy:'unknown'},severity:'error',unknownPolicy:'human-review'});
 const n={id:'root',type:'INSTANCE',visible:true,unknownFacts:['baseline.effective'],knownFacts:['baseline.effective.padding'],baseline:{effective:{padding:0,other:0}}};
 const run=(fact='baseline.effective.padding')=>engine.evaluateRules({snapshot:{schemaVersion:'apollo.predicate-snapshot.v2',selection:['root'],nodes:[n],context:{}},rules:[rule(fact)]}).evaluations[0].classification;
 assert.equal(run(),'compliant');assert.equal(run('baseline.effective'),'human-review');assert.equal(run('baseline.effective.other'),'human-review');
 for(const path of ['baseline.effective.padding','baseline.effective.padding.child']){n.unknownFacts.push(path);assert.equal(run(),'human-review');n.unknownFacts.pop();}
 for(const value of [undefined,null,{},[],NaN,Infinity,'0']){n.baseline.effective.padding=value;assert.equal(run(),'human-review');}
 n.baseline.effective.padding=false;assert.equal(run(),'violation');
 n.baseline.effective.padding=0;delete n.knownFacts;assert.equal(run(),'human-review');
});
