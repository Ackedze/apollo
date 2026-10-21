import type { CompiledContract, ExportBundle, ManualSource, VariantEvidence } from './types';
import { compileManualSource } from './compiler';
import { createZip, textZipEntry } from './zip';
import { importWorkspace, type TextFile } from './importer';
import { slug, stableHash } from './stable';

export type ExportOptions = { projection?: CompiledContract };
/** Recompile all norms, then verify an explicit historical producer stamp against
 * the entire original projection. Cached predicates are never compiler input. */
export function verifyProjectionStamp(contract: CompiledContract, projection: CompiledContract): CompiledContract {
  if (projection?.documentType !== 'component-contract' || projection.schemaVersion !== contract.schemaVersion
    || projection.package?.manualSourceHash !== contract.package.manualSourceHash
    || projection.package?.componentId !== contract.package.componentId
    || !/^component-contract-editor@0\.2\.\d+$/.test(projection.package?.sourceExportVersion || '')) {
    throw new Error('EXPORT_PROJECTION_SOURCE_MISMATCH: historical projection must match the exact manual and component.');
  }
  const candidate = JSON.parse(JSON.stringify(contract)) as CompiledContract;
  candidate.package.sourceExportVersion = projection.package.sourceExportVersion;
  if (stableHash(candidate) !== stableHash(projection)) throw new Error('EXPORT_PROJECTION_MISMATCH: manual, facts and dependencies do not reproduce the historical projection.');
  return candidate;
}
export function buildExportBundle(manual: ManualSource, variantEvidence?: VariantEvidence, dependencyContracts?: CompiledContract[], options: ExportOptions = {}): ExportBundle {
  const result = compileManualSource(manual, variantEvidence, dependencyContracts);
  const valid = !result.issues.some(issue=>issue.level==='error');
  if (options.projection && !valid) throw new Error('EXPORT_PROJECTION_SOURCE_INVALID: compiler errors prevent stamp preservation.');
  return {
    manual,
    compiled: options.projection ? verifyProjectionStamp(result.contract,options.projection) : result.contract,
    sourceFactsHash: variantEvidence ? stableHash(variantEvidence) : undefined,
    validation: { schemaVersion: 'apollo.component-contract-validation.v1', valid, issues: result.issues },
    coverage: result.contract.coverage,
  };
}
/** Carry the actual imported JSON inventory, including legacy descriptive source
 * labels. Reopen the resulting files and prove full authoring-facts equality. */
export function buildAuthoringZip(bundle: ExportBundle, importedFiles: TextFile[] = []): Uint8Array {
  const reserved = new Set(['contract.manual.json','component-contract.v2.json','coverage.json','validation-report.json']);
  const evidence = new Map<string,string>();
  for (const file of importedFiles) {
    const name=file.name,basename=name.split('/').pop() || '';
    if (!name.endsWith('.json') || reserved.has(basename)) continue;
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(p=>!p||p==='.'||p==='..')) throw new Error('EXPORT_EVIDENCE_PATH_INVALID');
    const value=JSON.parse(file.text);
    if (value.documentType==='component-contract-manual' || value.documentType==='component-contract') continue;
    const key=slug(bundle.manual.component.family)+'/source/'+basename;
    const existing=evidence.get(key);
    if(existing!==undefined && existing!==file.text)throw new Error('EXPORT_EVIDENCE_CONFLICT: '+name);
    evidence.set(key,file.text);
  }
  const files:TextFile[]=[{name:'contract.manual.json',text:JSON.stringify(bundle.manual)},
    {name:'compiled/component-contract.v2.json',text:JSON.stringify(bundle.compiled)}];
  for(const [name,text] of evidence)files.push({name,text});
  // Dependencies carry only exact compiler-linked projections. Their authoring
  // source packages remain separately required by Generation.
  for(const dependency of bundle.compiled.componentDependencies || [])if(dependency.contract && !dependency.issue)
    files.push({name:'dependencies/'+encodeURIComponent(dependency.componentId)+'/component-contract.v2.json',text:JSON.stringify(dependency.contract)});
  if(bundle.sourceFactsHash) {
    const reopened=importWorkspace(files,bundle.manual.component.contractId);
    if(!reopened.variantEvidence || stableHash(reopened.variantEvidence)!==bundle.sourceFactsHash)throw new Error('EXPORT_FACTS_MISMATCH: input inventory does not reproduce full authoring evidence.');
  }
  return createZip([
    ...files.map(file=>({name:file.name,data:new TextEncoder().encode(file.text)})),
    textZipEntry('coverage.json',bundle.coverage),textZipEntry('validation-report.json',bundle.validation),
  ]);
}
