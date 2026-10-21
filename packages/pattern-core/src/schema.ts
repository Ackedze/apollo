import { z } from 'zod';
import { projectJsonSchema } from './schema-projection';

export const SCHEMA_VERSION = 'apollo.pattern-contract.v1-draft' as const;
export const REQUIREMENTS_VERSION = 'apollo.pattern-requirements.v1-draft' as const;
const id = z.string().min(1).max(160).regex(/^[a-zA-Z][a-zA-Z0-9:._-]*$/);
const text = z.string().min(1).max(1200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
const relativePath = z.string().min(1).max(400).regex(/^(?!\/)(?![A-Za-z]:)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)(?!.*[\x00-\x1f])[^\s]+$/);
const ruleId = z.string().regex(/^rule:[a-z0-9][a-z0-9._-]+$/);
const patternId = z.string().regex(/^ptrn:[a-z0-9][a-z0-9._-]+$/);
const scalar = z.union([z.boolean(), z.string().min(1).max(160)]);
const evidence = z.object({ sourceId: id, ruleId }).strict();
const evidenceList = z.array(evidence).min(1).max(64);
const cell = z.discriminatedUnion('op', [
  z.object({ op: z.literal('any') }).strict(),
  z.object({ op: z.literal('eq'), value: scalar }).strict(),
  z.object({ op: z.literal('in'), values: z.array(scalar).min(1).max(32) }).strict(),
]);
const conditions = z.record(cell);
const contextField = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('boolean'), description: text }).strict(),
  z.object({ id, type: z.literal('enum'), description: text,
    values: z.array(z.string().min(1).max(160)).min(1).max(32) }).strict(),
]);
const gap = z.object({ id, area: z.enum(['product', 'source', 'availability', 'integration', 'acceptance']),
  blocking: z.boolean(), question: text, owner: text }).strict();
const componentLock = z.object({ contractId: id, revision: z.number().int().min(1),
  contractSha256: hash, representationId: id }).strict();
const binding = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unresolved'), gapId: id }).strict(),
  z.object({ kind: z.literal('registry'), entryId: id, registrySha256: hash,
    lock: componentLock, requiredInputs: z.array(id).max(64), requiredSlots: z.array(id).max(64) }).strict(),
]);
const target = z.union([
  z.object({ stateId: id }).strict(),
  z.object({ gapId: id }).strict(),
]);

/** This schema deliberately only accepts drafts. A local validator cannot promote a norm. */
export const PatternSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  documentType: z.literal('pattern-contract'),
  patternId, revision: z.number().int().min(1), status: z.literal('draft'),
  metadata: z.object({ title: text, owner: text,
    authoredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), frameworkVersion: z.literal('0.1.0-draft.1') }).strict(),
  outcome: z.object({ userGoal: text, successCriteria: z.array(text).min(1).max(32) }).strict(),
  sources: z.array(z.object({ id, repository: id, path: relativePath, commit,
    sha256: hash, patternId, ruleIds: z.array(ruleId).min(1).max(128) }).strict()).min(1).max(32),
  context: z.object({ fields: z.array(contextField).min(1).max(12) }).strict(),
  decisionTables: z.array(z.object({ id, inputs: z.array(id).min(1).max(12),
    hitPolicy: z.literal('unique'), coverage: z.literal('complete'),
    rows: z.array(z.object({ id, when: conditions, outcomeId: id, evidence: evidenceList }).strict()).min(1).max(256),
  }).strict()).min(1).max(16),
  outcomes: z.array(z.object({ id, description: text, compositionIds: z.array(id).max(32),
    entryStateId: id, evidence: evidenceList }).strict()).min(1).max(64),
  compositions: z.array(z.object({ id, activeStates: z.array(id).min(1).max(128), roles: z.array(z.object({ id, semanticRole: id,
    parentId: id.nullable(), order: z.number().int().min(0),
    kind: z.enum(['region', 'ui-component']),
    minimum: z.number().int().min(0).max(100), maximum: z.number().int().min(1).max(100),
    binding: binding.optional(), evidence: evidenceList }).strict()).min(1).max(128) }).strict()).max(32),
  scenario: z.object({
    states: z.array(z.object({ id, kind: z.enum(['initial', 'active', 'terminal']), description: text }).strict()).min(1).max(128),
    events: z.array(z.object({ id, origin: z.enum(['user', 'product']), description: text }).strict()).min(1).max(128),
    transitions: z.array(z.object({ id, from: id, eventId: id,
      outcomeIds: z.array(id).min(1).max(64), when: conditions,
      basis: z.enum(['source-formalization', 'gap-route']),
      target, actions: z.array(z.object({ id, evidence: evidenceList }).strict()).max(32),
      evidence: evidenceList }).strict()).min(1).max(256),
  }).strict(),
  constraints: z.array(z.object({ id, statement: text, ownership: z.literal('pattern-context'),
    route: z.enum(['decision-table', 'composition', 'scenario', 'product-input', 'manual']),
    subjectId: id, evidence: evidenceList }).strict()).max(128),
  gaps: z.array(gap).min(1).max(64),
}).strict();

export type PatternContract = z.infer<typeof PatternSchema>;
export type ContextValues = Record<string, boolean | string>;
export type Conditions = z.infer<typeof conditions>;
export type SourceReference = PatternContract['sources'][number];
export type ComponentBinding = Extract<z.infer<typeof binding>, { kind: 'registry' }>;
export type Issue = { level: 'error' | 'warning'; code: string; path: string; message: string };

/** Proposed read-only NEXT-01 port, not a replacement for Code Connect's registry. */
export const AvailabilityEvidenceSchema = z.object({
  entryId: id, status: z.literal('confirmed'), registrySha256: hash,
  code: z.object({ package: z.literal('arui-private'), version: text,
    commit, subpath: z.string().regex(/^arui-private\/[a-z0-9][a-z0-9/-]*$/),
    exportName: id, files: z.array(z.object({ path: relativePath, sha256: hash }).strict()).min(1).max(64) }).strict(),
  lock: componentLock,
  platforms: z.array(z.string().min(1)).min(1).max(8),
  targets: z.array(z.enum(['figma', 'frontend'])).min(1).max(2),
  semanticRoles: z.array(id).min(1).max(64),
  inputs: z.array(id).max(64), slots: z.array(id).max(64),
  readiness: z.object({ apiMapping: z.literal('confirmed-source-api'),
    contractCoverage: z.enum(['not-verified', 'verified']),
    fullContractParity: z.enum(['not-confirmed', 'confirmed']),
    codeRepresentation: z.enum(['proposed-for-authoring', 'accepted']),
    builtPackage: z.enum(['not-built-in-checkout', 'resolved']),
    liveAcceptance: z.enum(['not-run', 'accepted']),
    release: z.enum(['not-released', 'released']) }).strict(),
}).strict();
export type AvailabilityEvidence = z.infer<typeof AvailabilityEvidenceSchema>;
export const patternJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'urn:apollo:pattern-contract:v1-draft',
  title: 'Apollo pattern contract v1 draft',
  ...projectJsonSchema(PatternSchema),
};
