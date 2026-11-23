import type {
  ApolloStatsReport,
  ApolloTextAuditReport,
  ApolloTextComponentContext,
  ApolloTextFact,
  ApolloTextScope,
} from './types';
import { createCooperativeYield } from '../utils/promisePool';
import type { AuditSceneSnapshot } from '../source-observation';

type ResolveComponentKey = (node: SceneNode) => Promise<string | null>;

export async function collectApolloTextFacts(
  roots: readonly SceneNode[],
  resolveNodePath: (node: SceneNode) => string,
  resolveComponentKey: ResolveComponentKey,
  throwIfCancelled: () => void = () => {},
  snapshot?:AuditSceneSnapshot,
  scopes?: ApolloTextScope[],
): Promise<ApolloTextFact[]> {
  const facts: ApolloTextFact[] = [];
  const checkpoint = createCooperativeYield(throwIfCancelled);

  const seen = new Set<string>();
  const identities = new Map<string, Promise<{key: string | null; name: string}>>();
  const duplicateChildNames = new Map<string, Set<string>>();

  function readComponentPath(node: TextNode, rootId: string): ApolloTextFact['componentPath'] {
    const path: NonNullable<ApolloTextFact['componentPath']> = [];
    for (let current: BaseNode | null = node; current; current = current.parent) {
      if (current.id === rootId) {
        path.push({ nodeId: current.id, name: current.name, uniqueName: true });
        return path.reverse();
      }
      const parent: (BaseNode & ChildrenMixin) | null = current.parent;
      if (!parent || parent.type === 'DOCUMENT' || parent.type === 'PAGE') return;
      let duplicates = duplicateChildNames.get(parent.id);
      if (!duplicates) {
        duplicates = new Set<string>();
        const names = new Set<string>();
        for (const name of snapshot?.getChildNames(parent) ?? parent.children.map(child => child.name)) {
          if (names.has(name)) duplicates.add(name);
          names.add(name);
        }
        duplicateChildNames.set(parent.id, duplicates);
      }
      path.push({ nodeId: current.id, name: current.name, uniqueName: !duplicates.has(current.name) });
    }
  }

  function identity(node: SceneNode): Promise<{key: string | null; name: string}> {
    if (!scopes) return resolveComponentKey(node).then(key => ({key, name: node.name}));
    let existing = identities.get(node.id);
    if (!existing) {
      existing = (async () => {
        const main = node.type === 'INSTANCE' ? await (snapshot?.getMainComponent(node) ?? node.getMainComponentAsync())
          : node.type === 'COMPONENT' ? node : null;
        throwIfCancelled();
        return {key: main?.key ?? null, name: main?.parent?.type === 'COMPONENT_SET' ? main.parent.name : main?.name ?? node.name};
      })();
      identities.set(node.id, existing);
    }
    return existing;
  }

  async function visit(node: SceneNode, inheritedVisible: boolean, inheritedOpacity: number, scope?: ApolloTextScope): Promise<void> {
    await checkpoint();
    const visible = inheritedVisible && (snapshot?snapshot.isVisible(node):node.visible!==false);
    if (!visible) return;
    const opacity = inheritedOpacity * ('opacity' in node && typeof node.opacity === 'number' ? node.opacity : 1);
    if (scope && node.id !== scope.nodeId && node.type !== 'TEXT' && /overlay|scrim|затемнен|оверлей/i.test(node.name) && opacity > 0) scope.overlay = true;

    if (node.type === 'TEXT' && (!scope || !seen.has(node.id))) {
      const ancestors = await collectComponentContexts(node, identity);
      const fact: ApolloTextFact = {
        node: {
          id: node.id,
          name: node.name,
          type: node.type,
          pageName: getPageName(node),
          path: resolveNodePath(node),
          visible: true,
          ancestorNodeIds: ancestors.map((context) => context.nodeId),
        },
        text: snapshot?snapshot.getText(node):node.characters,
        owner: ancestors.length ? ancestors[ancestors.length - 1] : null,
        ancestors,
        documentOrder: facts.length,
      };
      if (scope) {
        fact.scopeNodeId = scope.nodeId;
        fact.effectiveOpacity = opacity;
        if (ancestors.length) fact.componentPath = readComponentPath(node, ancestors[0].nodeId);
        seen.add(node.id);
      }
      facts.push(fact);
    }

    for (const child of snapshot?.getChildren(node)??('children'in node?node.children:[])) {
      await visit(child, visible, opacity, scope);
    }
  }

  for (const root of roots) {
    let scope: ApolloTextScope | undefined;
    let visible = true;
    let opacity = 1;
    if (scopes) {
      scope = {nodeId: root.id, name: root.name, width: root.width, overlay: false};
      scopes.push(scope);
      for (let parent = root.parent; parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT'; parent = parent.parent) {
        if ('visible' in parent && parent.visible === false) visible = false;
        if ('opacity' in parent && typeof parent.opacity === 'number') opacity *= parent.opacity;
      }
    }
    await visit(root, visible, opacity, scope);
  }
  throwIfCancelled();
  return facts;
}

export function buildApolloTextAuditReport(
  report: Pick<ApolloStatsReport,'reportId'|'generatedAt'|'suggestedFileName'|'user'|'plugin'|'figma'|'scan'>,
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
  resolveIdentity: (node: SceneNode) => Promise<{key: string | null; name: string}>,
): Promise<ApolloTextComponentContext[]> {
  const contextNodes: SceneNode[] = [];
  let cursor: BaseNode | null = node.parent;
  while (cursor && cursor.type !== 'PAGE' && cursor.type !== 'DOCUMENT') {
    if (cursor.type === 'INSTANCE' || cursor.type === 'COMPONENT') {
      contextNodes.unshift(cursor);
    }
    cursor = cursor.parent;
  }

  return Promise.all(contextNodes.map(async contextNode => {
    const component = await resolveIdentity(contextNode);
    return {
      nodeId: contextNode.id,
      name: contextNode.name,
      componentName: component.name,
      componentKey: component.key,
      variantProperties: readVariantProperties(contextNode),
    };
  }));
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
