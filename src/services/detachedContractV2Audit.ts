import {
  findComponent,
} from '../reference/library';
import {
  getExperimentalContractV2ForKey,
} from '../contracts/experimentalContractV2Registry';
import { evaluateExperimentalContractV2 } from '../contracts/experimentalContractV2Engine';
import { snapshotTree } from '../structure/snapshot';
import type { AuditItem, PathSegment } from '../types/audit';
import { buildNodePath, getPageName } from '../utils/nodeHelpers';
import { getDetachedLibraryComponentKey } from './detachedComponentSource';

export async function classifyDetachedContractV2Node(
  node: SceneNode,
  options: {
    buildNodeSegments(node: SceneNode): PathSegment[];
    resolveTokenLabel(token: string): string | null;
    throwIfCancelled(): void;
  },
): Promise<AuditItem | null> {
  const componentKey = getDetachedLibraryComponentKey(node);
  if (!componentKey) return null;
  const contract = getExperimentalContractV2ForKey(componentKey);
  if (!contract) return null;

  options.throwIfCancelled();
  // Detached evaluation must not mark descendants as already compared. Nested
  // live instances still need their own regular component audit.
  const actualStructure = await snapshotTree(node, new Set<string>());
  options.throwIfCancelled();
  const reference = findComponent(componentKey);
  const componentName =
    reference?.displayName ??
    reference?.name ??
    reference?.names?.[0] ??
    node.name;
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: componentKey,
    hostComponentName: componentName,
    actualStructure,
    resolveTokenLabel: options.resolveTokenLabel,
    evaluationScope: 'detached-structural',
  });

  console.log('[Apollo][contracts-v2] detached component evaluated', {
    componentKey,
    componentName,
    packageId: contract.package.id,
    diagnostics: result.diagnostics,
  });
  if (!result.diffs.length) return null;

  const nodeSegments = options.buildNodeSegments(node);
  return {
    id: node.id,
    name: node.name,
    nodeType: node.type,
    pageName: getPageName(node),
    pathSegments: nodeSegments.length > 1 ? nodeSegments.slice(1) : nodeSegments,
    fullPath: buildNodePath(node),
    relevance: 'current',
    librarySource: reference?.source ?? null,
    librarySourceFile: reference?.sourceFile ?? null,
    isLocal: false,
    reference,
    componentKey,
    diffs: result.diffs,
    comparisonIssues: [],
    customizationOnly: true,
  };
}
