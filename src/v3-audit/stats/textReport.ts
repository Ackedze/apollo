import type {
  ApolloStatsReport,
  ApolloTextAuditReport,
  ApolloTextComponentContext,
  ApolloTextFact,
} from './types';
import { createCooperativeYield } from '../utils/promisePool';

type ResolveComponentKey = (node: SceneNode) => Promise<string | null>;

export async function collectApolloTextFacts(
  roots: readonly SceneNode[],
  resolveNodePath: (node: SceneNode) => string,
  resolveComponentKey: ResolveComponentKey,
  throwIfCancelled: () => void = () => {},
): Promise<ApolloTextFact[]> {
  const facts: ApolloTextFact[] = [];
  const checkpoint = createCooperativeYield(throwIfCancelled);

  async function visit(node: SceneNode, inheritedVisible: boolean): Promise<void> {
    await checkpoint();
    const visible = inheritedVisible && node.visible !== false;
    if (!visible) return;

    if (node.type === 'TEXT') {
      const ancestors = await collectComponentContexts(node, resolveComponentKey);
      facts.push({
        node: {
          id: node.id,
          name: node.name,
          type: node.type,
          pageName: getPageName(node),
          path: resolveNodePath(node),
          visible: true,
          ancestorNodeIds: ancestors.map((context) => context.nodeId),
        },
        text: node.characters,
        owner: ancestors.length ? ancestors[ancestors.length - 1] : null,
        ancestors,
        documentOrder: facts.length,
      });
    }

    if ('children' in node) {
      for (const child of node.children) {
        await visit(child, visible);
      }
    }
  }

  for (const root of roots) {
    await visit(root, true);
  }
  throwIfCancelled();
  return facts;
}

export function buildApolloTextAuditReport(
  report: ApolloStatsReport,
  texts: ApolloTextFact[],
): ApolloTextAuditReport {
  return {
    schemaVersion: 1,
    reportKind: 'apollo-text-audit-report',
    reportId: `${report.reportId}:texts`,
    sourceReportId: report.reportId,
    generatedAt: report.generatedAt,
    suggestedFileName: toTextReportFileName(report.suggestedFileName),
    user: report.user,
    plugin: report.plugin,
    figma: report.figma,
    scan: report.scan,
    summary: {
      scannedTextNodes: texts.length,
    },
    facts: { texts },
  };
}

async function collectComponentContexts(
  node: SceneNode,
  resolveComponentKey: ResolveComponentKey,
): Promise<ApolloTextComponentContext[]> {
  const contextNodes: SceneNode[] = [];
  let cursor: BaseNode | null = node.parent;
  while (cursor && cursor.type !== 'PAGE' && cursor.type !== 'DOCUMENT') {
    if (cursor.type === 'INSTANCE' || cursor.type === 'COMPONENT') {
      contextNodes.unshift(cursor);
    }
    cursor = cursor.parent;
  }

  return Promise.all(contextNodes.map(async (contextNode) => ({
    nodeId: contextNode.id,
    name: contextNode.name,
    componentName: contextNode.name,
    componentKey: await resolveComponentKey(contextNode),
    variantProperties: readVariantProperties(contextNode),
  })));
}

function readVariantProperties(node: SceneNode): Record<string, string> {
  const result: Record<string, string> = {};
  if (node.type === 'INSTANCE') {
    for (const [name, property] of Object.entries(node.componentProperties)) {
      result[name] = String(property.value);
    }
  } else if ('variantProperties' in node && node.variantProperties) {
    for (const [name, value] of Object.entries(node.variantProperties)) {
      result[name] = String(value);
    }
  }
  return result;
}

function getPageName(node: BaseNode): string {
  let cursor: BaseNode | null = node;
  while (cursor && cursor.type !== 'PAGE') cursor = cursor.parent;
  return cursor?.type === 'PAGE' ? cursor.name : '';
}

function toTextReportFileName(value: string): string {
  return value.endsWith('.json')
    ? `${value.slice(0, -5)}_texts.json`
    : `${value}_texts.json`;
}
