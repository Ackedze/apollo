#!/usr/bin/env node
// Optional independent QA using an explicitly supplied, already installed Ajv.
const path = require('node:path');
const { PatternSchema, patternJsonSchema } = require('../dist/index.cjs');
const { makePattern } = require('../tests/synthetic.cjs');
const modulePath = process.argv[2];
if (!modulePath || !path.isAbsolute(modulePath)) throw Error('Supply an absolute path to existing Ajv 6.15.0; no package installation is performed.');
const version = require(path.join(modulePath, 'package.json')).version;
if (version !== '6.15.0') throw Error('This QA route is pinned to Ajv 6.15.0.');
const Ajv = require(modulePath), ajv = new Ajv({ allErrors: true });
if (!ajv.validateSchema(patternJsonSchema)) throw Error(JSON.stringify(ajv.errors));
const validate = ajv.compile(patternJsonSchema);
const mutations = [
  p => p,
  p => { p.context.fields[0].type = 'string'; return p; },
  p => { p.status = 'verified'; return p; },
  p => { p.schemaVersion = 'unknown'; return p; },
  p => { delete p.outcome; return p; },
  p => { p.props = { arbitrary: true }; return p; },
  p => { p.decisionTables[0].rows[0].when.needsReview = { op: 'eq', value: 1 }; return p; },
  p => { p.compositions[0].roles[0].maximum = 0; return p; },
  p => { p.revision = 1.5; return p; },
  p => { p.sources[0].path = '../escape.md'; return p; },
  p => { p.scenario.transitions[0].basis = 'invented'; return p; },
  p => { p.scenario.transitions[0].target = { stateId: 'initial', gapId: 'product-gap' }; return p; },
];
mutations.forEach((mutate, index) => {
  const p = mutate(makePattern()), expected = index === 0;
  if (validate(p) !== expected || PatternSchema.safeParse(p).success !== expected)
    throw Error('Zod / JSON Schema structural mismatch in synthetic case ' + index);
});
console.log(JSON.stringify({ schema: patternJsonSchema.$id, metaschema: 'draft-07', ajv: version, schemaValid: true, syntheticCases: mutations.length, status: 'passed' }));
