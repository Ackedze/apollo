import { createHash } from 'node:crypto';
import type { ManualSource, CompiledContract, VariantEvidence, ValidationIssue } from '../../../component-contract-core/src/types';

export type AuthoringSource = {
  schemaVersion: string;
  documentType: 'component-contract-source';
  manual: ManualSource;
  variantEvidence: VariantEvidence;
  dependencies: AuthoringSource[];
  projectionStamp?: { sourceExportVersion: string; compiledHash: string };
};
export type SourceRuntime = {
  RUNTIME_VERSION: string;
  contractHash(value: unknown): string;
  sourceFromFiles(files: Array<{ name: string; text: string }>): AuthoringSource;
  loadAuthoringSource(source: AuthoringSource): {
    source: AuthoringSource; sourceHash: string; contract: CompiledContract; issues: ValidationIssue[];
  };
};
export type RuntimeIdentity = {
  coreVersion: string;
  profileVersion: string;
  runtimeSha256: string;
  buildInputsSha256: string;
};
export type Archive = { name: string; bytes: Uint8Array };
export type ZipReader = (bytes: Uint8Array) => Promise<Array<{ name: string; data: Uint8Array }>>;
export type PackageLock = {
  schemaVersion: 'apollo.generation-package-lock.v1-experimental';
  runtime: RuntimeIdentity;
  packages: Array<{
    archive: string; archiveSha256: string; componentId: string; contractId: string; revision: number;
    manualSourceHash: string; factsHash: string; sourceHash: string; compiledHash: string;
    sourceExportVersion: string;
    projectionEvidence: Array<{ archive: string; entry: string; compiledHash: string }>;
    dependencies: Array<{ id: string; componentId: string; revision: number; manualSourceHash: string; compiledHash: string }>;
  }>;
};
export type PackageInventory = {
  lock: PackageLock;
  lockHash: string;
  packages: Array<{
    componentId: string; source: AuthoringSource; contract: CompiledContract; issues: ValidationIssue[];
    representations: ManualSource['representations'];
    checks: { scope: 'compiled-predicate-execution'; predicateRules: number; pendingRoutes: Array<{ ruleId: string; route: string }>; nonExecutableRules: number };
  }>;
};

export class PackageLoadError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'PackageLoadError'; }
}
const shaPattern = /^[a-f0-9]{64}$/;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fail(code: string, message: string): never { throw new PackageLoadError(code, message); }
function pathSafe(name: string): boolean {
  return !!name && !name.includes('\\') && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..') && !/^[a-z]:/i.test(name);
}
type Cache = { archive: string; entry: string; contract: CompiledContract };

/** Read-only local ZIP import. Apollo supplies its existing compiler/profile;
 * neither cached predicates nor archive reports become normative inputs. */
export async function loadContractPackages(
  archives: Archive[],
  ports: { runtime: SourceRuntime; readZip: ZipReader; identity: RuntimeIdentity },
  expectedLock?: PackageLock,
): Promise<PackageInventory> {
  const { runtime, readZip, identity } = ports;
  if (expectedLock && (expectedLock.schemaVersion !== 'apollo.generation-package-lock.v1-experimental' || !Array.isArray(expectedLock.packages))) fail('LOCK_SCHEMA', 'Unsupported generation lock schema.');
  if (identity.profileVersion !== runtime.RUNTIME_VERSION || !identity.coreVersion
    || !shaPattern.test(identity.runtimeSha256) || !shaPattern.test(identity.buildInputsSha256)) {
    fail('RUNTIME_IDENTITY', 'A pinned Apollo runtime build is required.');
  }
  if (!archives.length || archives.length > 32) fail('ARCHIVE_LIMIT', 'Supply between 1 and 32 authoring ZIP packages.');
  const names = new Set<string>();
  const records = new Map<string, { archive: string; archiveSha256: string; source: AuthoringSource; projectionEvidence: PackageLock['packages'][number]['projectionEvidence'] }>();
  const caches: Cache[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function collectCache(value: unknown, archive: string, entry: string, depth = 0): void {
    if (!value || typeof value !== 'object' || (value as CompiledContract).documentType !== 'component-contract') return;
    if (depth > 4 || caches.length >= 128) fail('CACHE_LIMIT', 'Compiled dependency evidence exceeds the closure limit.');
    const contract = value as CompiledContract;
    if (!contract.package?.componentId || !shaPattern.test(contract.package.manualSourceHash || '')) fail('CACHE_IDENTITY', `Invalid compiled identity in ${archive}:${entry}.`);
    caches.push({ archive, entry, contract });
    for (const child of contract.componentDependencies || []) collectCache(child.contract, archive, entry + '#' + child.id, depth + 1);
  }
  for (const archive of archives.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    if (!pathSafe(archive.name) || !/\.zip$/i.test(archive.name) || names.has(archive.name)) fail('ARCHIVE_NAME', 'ZIP names must be unique safe relative paths.');
    names.add(archive.name);
    if (archive.bytes.length > 64 * 1024 * 1024) fail('ARCHIVE_LIMIT', `ZIP is too large: ${archive.name}.`);
    const archiveSha256 = sha(archive.bytes);
    if (expectedLock) {
      const expected = expectedLock.packages?.find(p => p.archive === archive.name);
      if (!expected || expected.archiveSha256 !== archiveSha256) fail('STALE_ARCHIVE', `ZIP differs from the pinned run: ${archive.name}.`);
    }
    let source: AuthoringSource;
    try {
      const entries = await readZip(archive.bytes), entryNames = new Set<string>();
      if (entries.length > 200 || entries.reduce((size, entry) => size + entry.data.length, 0) > 128 * 1024 * 1024) fail('ENTRY_LIMIT', `ZIP contents exceed the package limit: ${archive.name}.`);
      const files = [];
      for (const entry of entries) {
        if (!pathSafe(entry.name) || entryNames.has(entry.name)) fail('ENTRY_NAME', `Duplicate or unsafe ZIP entry: ${archive.name}:${entry.name}.`);
        entryNames.add(entry.name);
        if (!/\.json$/i.test(entry.name)) continue;
        const text = decoder.decode(entry.data);
        collectCache(JSON.parse(text), archive.name, entry.name);
        files.push({ name: entry.name, text });
      }
      source = runtime.sourceFromFiles(files);
    } catch (error) {
      if (error instanceof PackageLoadError) throw error;
      fail('SOURCE_IMPORT', `Cannot import ${archive.name}: ${(error as Error).message}`);
    }
    const id = source.manual.component.componentId;
    if (records.has(id)) fail('COMPONENT_CONFLICT', `Multiple ZIP sources for ${id}.`);
    records.set(id, { archive: archive.name, archiveSha256, source, projectionEvidence: [] });
  }
  // Preserve an export stamp only when its own manual/facts reproduce the exact
  // compiled hash. Embedded children still require a separate authoring ZIP.
  for (const [id, record] of records) {
    const manualHash = runtime.contractHash(record.source.manual);
    const candidates = caches.filter(cache => cache.contract.package.componentId === id);
    const matching = candidates.filter(cache => cache.contract.package.manualSourceHash === manualHash);
    const staleHost = candidates.find(cache => cache.archive === record.archive && cache.contract.package.manualSourceHash !== manualHash);
    if (staleHost) fail('STALE_COMPILED', `Host cache does not match its manual: ${record.archive}.`);
    const hashes = new Set(matching.map(cache => runtime.contractHash(cache.contract)));
    if (hashes.size > 1) fail('CACHE_CONFLICT', `Conflicting projections for ${id}.`);
    if (matching.length) {
      record.source.projectionStamp = {
        sourceExportVersion: matching[0].contract.package.sourceExportVersion,
        compiledHash: runtime.contractHash(matching[0].contract),
      };
      record.projectionEvidence = matching.map(cache => ({ archive: cache.archive, entry: cache.entry, compiledHash: runtime.contractHash(cache.contract) }));
    }
  }
  const linked = new Set<string>();
  function link(id: string, ancestors: Set<string>): AuthoringSource {
    const record = records.get(id);
    if (!record) fail('MISSING_DEPENDENCY', `Supply the dependency ZIP with its own manual and facts: ${id}.`);
    if (ancestors.has(id)) fail('DEPENDENCY_CYCLE', `Dependency cycle at ${id}.`);
    if (ancestors.size > 4) fail('DEPENDENCY_DEPTH', `Dependency closure is too deep at ${id}.`);
    if (linked.has(id)) return record.source;
    const next = new Set(ancestors); next.add(id);
    const pins = record.source.manual.componentDependencies || [];
    for (const pin of pins) {
      const child = records.get(pin.componentId);
      if (!child) fail('MISSING_DEPENDENCY', `Supply the dependency ZIP with its own manual and facts: ${pin.componentId}.`);
      if (pin.revision !== child.source.manual.metadata.revision || pin.manualSourceHash !== runtime.contractHash(child.source.manual)) {
        fail('DEPENDENCY_PIN', `Revision/manual hash mismatch: ${id} → ${pin.componentId}.`);
      }
    }
    record.source.dependencies = Array.from(new Set(pins.map(pin => pin.componentId))).map(child => link(child, next));
    linked.add(id); return record.source;
  }
  for (const id of records.keys()) link(id, new Set());
  const packages: PackageInventory['packages'] = [];
  const locked: PackageLock['packages'] = [];
  for (const [id, record] of Array.from(records).sort(([a], [b]) => a.localeCompare(b))) {
    let loaded: ReturnType<SourceRuntime['loadAuthoringSource']>;
    try { loaded = runtime.loadAuthoringSource(record.source); }
    catch (error) { fail('SOURCE_COMPILE', `Cannot verify ${id}: ${(error as Error).message}`); }
    const contract = loaded.contract;
    packages.push({ componentId: id, source: loaded.source, contract, issues: loaded.issues,
      representations: record.source.manual.representations,
      checks: { scope: 'compiled-predicate-execution', predicateRules: contract.rules.length,
        pendingRoutes: contract.customizationPolicy.filter(rule => ['delegated', 'context-only'].includes(rule.execution.route)).map(rule => ({ ruleId: rule.id, route: rule.execution.route })),
        nonExecutableRules: contract.nonExecutableRules.length } });
    locked.push({ archive: record.archive, archiveSha256: record.archiveSha256, componentId: id,
      contractId: record.source.manual.component.contractId, revision: record.source.manual.metadata.revision,
      manualSourceHash: runtime.contractHash(record.source.manual), factsHash: runtime.contractHash(record.source.variantEvidence),
      sourceHash: loaded.sourceHash, compiledHash: runtime.contractHash(contract), sourceExportVersion: contract.package.sourceExportVersion,
      projectionEvidence: record.projectionEvidence,
      dependencies: (record.source.manual.componentDependencies || []).map(pin => ({ id: pin.id, componentId: pin.componentId, revision: pin.revision, manualSourceHash: pin.manualSourceHash, compiledHash: pin.compiledHash })) });
  }
  const lock: PackageLock = { schemaVersion: 'apollo.generation-package-lock.v1-experimental', runtime: identity, packages: locked };
  const lockHash = runtime.contractHash(lock);
  if (expectedLock && runtime.contractHash(expectedLock) !== lockHash) fail('STALE_LOCK', 'Runtime, source closure or package inventory differs from the pinned run.');
  return { lock, lockHash, packages };
}
