/** Pure data preparation using the existing V3 readers and policy normalizers.
 * The native comparator never compiles policies or reads author checkouts.
 */
import * as references from './reference/referenceList';
import { validateRemoteContractIndex, type RemoteContractPackage } from './rules/contractIndex';
import * as artifacts from './rules/contractArtifactCompiler';
import type { NormalizedAuditPolicyPackage } from './rules/runtimeContractRegistry';

export const VERSION = 'apollo.v3-audit-preparation.v1';
export const entryUrl = references.apolloReferenceCatalogListUrl;
export type Source = {url:string; roles:string[]; channels:string[]};
type ReadJson = (url:string) => Promise<any>;

// V3 contractIndexResolver path/alias semantics; these are legacy rule files,
// not the retired manual/compiled V4 contract engine.
export function policyArtifactPaths(entry:RemoteContractPackage) {
  const source = entry.artifacts;
  const paths = {generatedContract:source.generatedContract ?? '',
    rules:entry.rulesPath ?? entry.rulesFile ?? source.rules ?? '',
    composition:entry.compositionPath ?? entry.compositionFile ?? source.composition ?? '',
    overrides:source.overrides ?? '',agentContext:entry.agentContextPath ?? source.agentContext ?? '',
    auditMapping:source.auditMapping ?? '',examples:source.examples ?? ''};
  for (const name of Object.keys(paths) as Array<keyof typeof paths>) {
    const value = paths[name];
    if (value && !/^https?:\/\//i.test(value) && !value.includes('/') && entry.packagePath) {
      paths[name] = `${references.normalizePath(entry.packagePath)}/${value}`;
    }
  }
  return paths;
}

export async function describeSources(readJson:ReadJson) {
  const sources = new Map<string,Source>(), visited = new Set<string>(), policyIndexes = new Set<string>();
  const add = (url:string,role:string,channels:string[]) => {
    const row = sources.get(url) ?? {url,roles:[],channels:[]};
    row.roles = Array.from(new Set(row.roles.concat(role))).sort();
    row.channels = Array.from(new Set(row.channels.concat(channels))).sort();
    sources.set(url,row);
  };
  async function manifest(url:string,channels:string[]) {
    add(url,'reference-manifest',channels);
    if (visited.has(url)) return;
    visited.add(url);
    const body = await readJson(url);
    for (const catalog of references.buildReferenceCatalogSources(body)) {
      add(catalog.url,`${catalog.kind}-catalog`,channels);
      if (catalog.indexUrl) add(catalog.indexUrl,'component-index',channels);
    }
    for (const child of references.resolveCatalogManifests(body)) await manifest(child.url,child.channels);
    if (channels.includes('Desktop')) {
      add(references.resolvePatternRulesUrl(body),'pattern-policy',channels);
      for (const [resolver,role] of [[references.resolveRemediationConfigUrl,'remediation-policy'],[references.resolveAuditPolicyConfigUrl,'audit-policy']] as const) {
        const policyUrl = resolver(body); if (policyUrl) add(policyUrl,role,channels);
      }
      const indexUrl = references.resolveComponentContractIndexUrl(body);
      if (!indexUrl) throw Error('AUDIT_RULE_INDEX_UNAVAILABLE');
      add(indexUrl,'v3-policy-index',channels); policyIndexes.add(indexUrl);
      const index = validateRemoteContractIndex(await readJson(indexUrl));
      for (const entry of index.packages) for (const [role,value] of Object.entries(policyArtifactPaths(entry))) {
        if (value) add(references.resolveCatalogUrl(entry.baseUrl ?? index.baseUrl ?? body.baseUrl ?? '',value),`v3-policy-${role}`,channels);
      }
    }
  }
  await manifest(entryUrl,['Desktop','MobileWeb']);
  if (policyIndexes.size !== 1) throw Error('AUDIT_RULE_INDEX_AMBIGUOUS');
  return {entryUrl,policyIndexUrl:Array.from(policyIndexes)[0],sources:Array.from(sources.values()).sort((a,b)=>a.url.localeCompare(b.url))};
}

export async function preparePolicies(indexDocument:unknown, readJson:ReadJson, fallbackBaseUrl:string) {
  const index = validateRemoteContractIndex(indexDocument), packages:NormalizedAuditPolicyPackage[] = [];
  for (const indexEntry of index.packages) {
    const aliases = Array.from(new Set([indexEntry.packageName,indexEntry.componentKey,...(indexEntry.aliases ?? [])].filter((v):v is string=>Boolean(v))));
    const row:NormalizedAuditPolicyPackage = {indexEntry,aliases,
      loadedArtifacts:{generatedContract:false,rules:false,composition:false,overrides:false,agentContext:false,auditMapping:false},
      apiEntry:null,rulesEntry:null,compositionEntry:null,agentContext:null,auditMapping:null};
    if (indexEntry.coverage !== 'none') {
      const paths = policyArtifactPaths(indexEntry);
      async function read(role:keyof typeof row.loadedArtifacts) {
        const file = paths[role]; if (!file) return null;
        const value = await readJson(references.resolveCatalogUrl(indexEntry.baseUrl ?? index.baseUrl ?? fallbackBaseUrl,file));
        row.loadedArtifacts[role] = true; return value;
      }
      const api = await read('generatedContract');
      if (row.loadedArtifacts.generatedContract) row.apiEntry = artifacts.compileContractGeneratedApiArtifact(api,indexEntry,aliases);
      const rules = await read('rules');
      if (row.loadedArtifacts.rules) row.rulesEntry = artifacts.compileContractRulesArtifact(rules,indexEntry,aliases);
      const composition = await read('composition');
      if (row.loadedArtifacts.composition) row.compositionEntry = artifacts.compileContractCompositionArtifact(composition,aliases);
      const overrides = await read('overrides');
      const publicOverrides = row.loadedArtifacts.overrides ? artifacts.compileContractOverridesArtifact(overrides) : null;
      const context = await read('agentContext');
      if (row.loadedArtifacts.agentContext) row.agentContext = artifacts.compileContractAgentContextArtifact(context,indexEntry.componentKey,publicOverrides);
      const mapping = await read('auditMapping');
      if (row.loadedArtifacts.auditMapping) row.auditMapping = artifacts.compileContractAuditMappingArtifact(mapping);
    }
    packages.push(row);
  }
  return {schemaVersion:'apollo.v3-audit-policies.v1',coverage:index.coverage,packages};
}
