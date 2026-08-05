import type { ComponentContractRule } from './componentRules';
import {
  compactAgentContext,
  compactExamples,
  type RuntimeComponentAgentContext,
  type RuntimeComponentExample,
} from './artifactContext';
import type { RemoteContractPackage } from './contractIndex';
import { compilePublicArtifact } from './publicArtifact';

export type RuntimeComponentRuleRegistryEntry = {
  componentKey: string;
  packageName?: string;
  aliases: string[];
  figmaKeys: string[];
  rulesFile: {
    componentKey: string;
    rules: ComponentContractRule[];
  };
};

export type RuntimeCompositionContract = {
  componentKey?: string;
  component?: {
    name?: string;
    library?: string;
  };
  allowedOverrides?: Array<{
    targetPathPattern?: string;
    property?: string;
    expectedOverride?: string | number | null;
    scope?: string;
    reason?: string;
  }>;
  standaloneBaselines?: Array<{
    targetPathPattern?: string;
    property?: string;
    expectedValue?: string | number | null;
    styleKey?: string | null;
    scope?: string;
  }>;
};

export type RuntimeCompositionRegistryEntry = {
  contract: RuntimeCompositionContract;
  aliases: string[];
};

export function compileContractRulesArtifact(
  payload: unknown,
  entry: RemoteContractPackage,
  aliases: string[],
): RuntimeComponentRuleRegistryEntry | null {
  const publicPayload = compilePublicArtifact(payload);
  const rules = Array.isArray(publicPayload?.rules) ? publicPayload.rules : [];
  if (!entry.componentKey || !rules.length) return null;
  return {
    componentKey: entry.componentKey,
    packageName: entry.packageName,
    aliases,
    figmaKeys: Array.isArray(entry.figmaKeys) ? entry.figmaKeys : [],
    rulesFile: {
      componentKey: entry.componentKey,
      rules: rules as ComponentContractRule[],
    },
  };
}

export function compileContractCompositionArtifact(
  payload: unknown,
  aliases: string[],
): RuntimeCompositionRegistryEntry | null {
  const contract = compilePublicArtifact(payload);
  if (!contract || typeof contract !== 'object') return null;
  return {
    contract: contract as RuntimeCompositionContract,
    aliases,
  };
}

export function compileContractOverridesArtifact(payload: unknown): any {
  return compilePublicArtifact(payload);
}

export function compileContractAgentContextArtifact(
  payload: unknown,
  componentKey: string,
  overridesPayload: unknown,
): RuntimeComponentAgentContext {
  return compactAgentContext(
    compilePublicArtifact(payload),
    componentKey,
    overridesPayload ? compilePublicArtifact(overridesPayload) : null,
  );
}

export function compileContractAuditMappingArtifact(payload: unknown): any {
  return compilePublicArtifact(payload);
}

export function compileContractExamplesArtifact(
  payload: unknown,
): RuntimeComponentExample[] {
  return compactExamples(compilePublicArtifact(payload));
}
