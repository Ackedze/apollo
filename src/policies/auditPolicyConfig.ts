import { AsyncResourceLifecycle } from '../services/asyncResourceLifecycle';
import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';

export type RawTypographyPolicyRule = {
  id: string;
  componentKeys: string[];
  nodeName: string;
  ancestorPath: string[];
  reasonCode: string;
};

export type AuditPolicyConfig = {
  schemaVersion: 1;
  rawTypography: {
    rules: RawTypographyPolicyRule[];
  };
};

const lifecycle = new AsyncResourceLifecycle({ retryFailed: true });
let sourceUrl: string | null = null;
let config = createEmptyConfig();

export function configureRemoteAuditPolicySource(url: string): void {
  const normalized = String(url ?? '').trim();
  if (sourceUrl === normalized) return;
  sourceUrl = normalized || null;
  config = createEmptyConfig();
  lifecycle.reset();
}

export async function ensureAuditPolicyConfigLoaded(): Promise<void> {
  await lifecycle.ensure(loadConfig);
}

export function shouldIgnoreRawTypography(params: {
  componentKeys: Iterable<string>;
  nodeName: string;
  ancestorNames: readonly string[];
}): boolean {
  const componentKeys = new Set(params.componentKeys);
  return config.rawTypography.rules.some((rule) => {
    if (rule.nodeName !== params.nodeName) return false;
    if (rule.componentKeys.some((key) => componentKeys.has(key))) return true;
    return matchesAncestorPath(params.ancestorNames, rule.ancestorPath);
  });
}

async function loadConfig(): Promise<void> {
  if (!sourceUrl) {
    throw new Error('Apollo audit policy config source is not configured');
  }

  const requestUrl = appendCacheBustingQuery(sourceUrl, 'apolloAuditPolicies');
  config = validateAuditPolicyConfig(JSON.parse(await fetchDirect(requestUrl)) as unknown);
  console.log('[Apollo] audit policy config loaded', {
    url: sourceUrl,
    rawTypographyRules: config.rawTypography.rules.length,
  });
}

export function validateAuditPolicyConfig(payload: unknown): AuditPolicyConfig {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Apollo audit policy config must be an object');
  }
  const candidate = payload as Partial<AuditPolicyConfig>;
  if (candidate.schemaVersion !== 1) {
    throw new Error(
      `Unsupported audit policy config schemaVersion: ${String(candidate.schemaVersion)}`,
    );
  }
  const rawTypography = candidate.rawTypography;
  if (!rawTypography || typeof rawTypography !== 'object') {
    throw new Error('Audit policy config requires rawTypography');
  }
  if (!Array.isArray(rawTypography.rules)) {
    throw new Error('Audit policy config rawTypography.rules must be an array');
  }

  const ids = new Set<string>();
  const rules = rawTypography.rules.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid raw typography policy rule at index ${index}`);
    }
    const value = entry as Partial<RawTypographyPolicyRule>;
    const id = requiredString(value.id, `rawTypography.rules[${index}].id`);
    if (ids.has(id)) {
      throw new Error(`Duplicate raw typography policy rule id: ${id}`);
    }
    ids.add(id);
    const componentKeys = stringArray(
      value.componentKeys,
      `rawTypography.rules[${index}].componentKeys`,
      true,
    );
    const ancestorPath = stringArray(
      value.ancestorPath,
      `rawTypography.rules[${index}].ancestorPath`,
    );
    if (!componentKeys.length && !ancestorPath.length) {
      throw new Error(
        `Raw typography policy rule ${id} requires componentKeys or ancestorPath`,
      );
    }
    return {
      id,
      componentKeys,
      nodeName: requiredString(
        value.nodeName,
        `rawTypography.rules[${index}].nodeName`,
      ),
      ancestorPath,
      reasonCode: requiredString(
        value.reasonCode,
        `rawTypography.rules[${index}].reasonCode`,
      ),
    };
  });

  return {
    schemaVersion: 1,
    rawTypography: { rules },
  };
}

function matchesAncestorPath(
  ancestorNames: readonly string[],
  configuredPath: readonly string[],
): boolean {
  if (!configuredPath.length) return false;
  const expectedInnerToOuter = configuredPath.slice().reverse();
  for (
    let start = 0;
    start <= ancestorNames.length - expectedInnerToOuter.length;
    start += 1
  ) {
    let matches = true;
    for (let index = 0; index < expectedInnerToOuter.length; index += 1) {
      if (ancestorNames[start + index] !== expectedInnerToOuter[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function requiredString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} must be a non-empty string`);
  return normalized;
}

function stringArray(value: unknown, label: string, unique = false): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = value.map((entry, index) =>
    requiredString(entry, `${label}[${index}]`),
  );
  return unique ? Array.from(new Set(normalized)) : normalized;
}

function createEmptyConfig(): AuditPolicyConfig {
  return {
    schemaVersion: 1,
    rawTypography: { rules: [] },
  };
}

export function __test_setAuditPolicyConfig(payload: unknown): void {
  config = validateAuditPolicyConfig(payload);
}

export function __test_resetAuditPolicyConfig(): void {
  sourceUrl = null;
  config = createEmptyConfig();
  lifecycle.reset();
}
