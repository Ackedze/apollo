import { AsyncResourceLifecycle } from '../services/asyncResourceLifecycle';
import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import type {
  ComponentRemediationEntry,
  RemediationConfig,
  StyleRemediationEntry,
} from './types';

const lifecycle = new AsyncResourceLifecycle({ retryFailed: true });
let sourceUrl: string | null = null;
let config: RemediationConfig = createEmptyConfig();

export function configureRemoteRemediationConfigSource(url: string): void {
  const normalized = String(url ?? '').trim();
  if (sourceUrl === normalized) {
    return;
  }
  sourceUrl = normalized || null;
  config = createEmptyConfig();
  lifecycle.reset();
}

export async function ensureRemediationConfigLoaded(): Promise<void> {
  await lifecycle.ensure(loadConfig);
}

export function getComponentRemediation(
  componentKey: string | null | undefined,
): ComponentRemediationEntry | null {
  if (!componentKey) {
    return null;
  }
  return config.components[componentKey] ?? null;
}

export function getStyleRemediation(
  styleKey: string | null | undefined,
): StyleRemediationEntry | null {
  if (!styleKey) {
    return null;
  }
  return config.styles[styleKey] ?? null;
}

async function loadConfig(): Promise<void> {
  if (!sourceUrl) {
    throw new Error('Apollo remediation config source is not configured');
  }

  const requestUrl = appendCacheBustingQuery(
    sourceUrl,
    'apolloRemediations',
  );
  const raw = await fetchDirect(requestUrl);
  const payload = JSON.parse(raw) as unknown;
  config = validateRemediationConfig(payload);
  console.log('[Apollo] remediation config loaded', {
    url: sourceUrl,
    componentReplacements: Object.keys(config.components).length,
    styleReplacements: Object.keys(config.styles).length,
  });
}

export function validateRemediationConfig(payload: unknown): RemediationConfig {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Apollo remediation config must be an object');
  }

  const candidate = payload as Partial<RemediationConfig>;
  if (candidate.schemaVersion !== 1) {
    throw new Error(
      `Unsupported remediation config schemaVersion: ${String(candidate.schemaVersion)}`,
    );
  }

  return {
    schemaVersion: 1,
    components: validateComponentEntries(candidate.components),
    styles: validateStyleEntries(candidate.styles),
  };
}

function validateComponentEntries(
  entries: unknown,
): Record<string, ComponentRemediationEntry> {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('Remediation config components must be an object');
  }

  const result: Record<string, ComponentRemediationEntry> = {};
  for (const sourceKey of Object.keys(entries as Record<string, unknown>)) {
    const entry = (entries as Record<string, unknown>)[sourceKey];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid component remediation entry: ${sourceKey}`);
    }
    const value = entry as Partial<ComponentRemediationEntry>;
    const targetKey = String(value.replacementComponentKey ?? '').trim();
    if (!sourceKey.trim() || !targetKey || sourceKey === targetKey) {
      throw new Error(`Invalid component remediation target: ${sourceKey}`);
    }
    result[sourceKey] = {
      replacementComponentKey: targetKey,
      replacementName: normalizeOptionalString(value.replacementName),
      replacementLibrary: normalizeOptionalString(value.replacementLibrary),
    };
  }
  return result;
}

function validateStyleEntries(
  entries: unknown,
): Record<string, StyleRemediationEntry> {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('Remediation config styles must be an object');
  }

  const result: Record<string, StyleRemediationEntry> = {};
  for (const sourceKey of Object.keys(entries as Record<string, unknown>)) {
    const entry = (entries as Record<string, unknown>)[sourceKey];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid style remediation entry: ${sourceKey}`);
    }
    const value = entry as Partial<StyleRemediationEntry>;
    const targetKey = String(value.replacementStyleKey ?? '').trim();
    if (!sourceKey.trim() || !targetKey || sourceKey === targetKey) {
      throw new Error(`Invalid style remediation target: ${sourceKey}`);
    }
    const styleType = value.styleType;
    if (
      styleType !== undefined &&
      styleType !== 'fill' &&
      styleType !== 'stroke' &&
      styleType !== 'effect' &&
      styleType !== 'text'
    ) {
      throw new Error(`Invalid style remediation type: ${sourceKey}`);
    }
    result[sourceKey] = {
      replacementStyleKey: targetKey,
      replacementName: normalizeOptionalString(value.replacementName),
      replacementLibrary: normalizeOptionalString(value.replacementLibrary),
      styleType,
    };
  }
  return result;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
}

function createEmptyConfig(): RemediationConfig {
  return {
    schemaVersion: 1,
    components: {},
    styles: {},
  };
}

export function __test_resetRemediationConfig(): void {
  sourceUrl = null;
  config = createEmptyConfig();
  lifecycle.reset();
}
