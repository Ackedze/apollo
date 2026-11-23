import { createCooperativeYield, designTraversalBudget } from '../utils/promisePool';
import { untimed, type createComponentTimings } from '../component-timings';

export interface AuditTreeVisitResult {
  skipChildren?: boolean;
}

export interface AuditTreeTraversalOptions<TNode> {
  isVisible: (node: TNode) => boolean;
  getChildren: (node: TNode) => readonly TNode[];
  visit: (node: TNode) => Promise<AuditTreeVisitResult | void>;
  throwIfCancelled: () => void;
  prepareNodes?: (nodes:readonly TNode[])=>Promise<void>;
  timings?: ReturnType<typeof createComponentTimings>;
}

export async function traverseAuditTree<TNode>(
  roots: readonly TNode[],
  options: AuditTreeTraversalOptions<TNode>,
): Promise<void> {
  const measure = options.timings?.measure ?? untimed;
  const measureSync = options.timings?.measureSync ?? untimed;
  const checkpoint = createCooperativeYield(
    () => measureSync('treeCheckpointGuard', options.throwIfCancelled),
    wait => measure('treeYield', wait),
    options.prepareNodes ? designTraversalBudget : undefined,
  );
  const guardEdge = () => measureSync('treeEdgeGuard', options.throwIfCancelled);
  const traverseNode = async (node: TNode): Promise<void> => {
    await measure('treeCheckpoint', checkpoint);
    if (!measureSync('treeVisibility', () => options.isVisible(node))) {
      return;
    }

    const result = await measure('treeVisit', () => options.visit(node));
    if (result?.skipChildren) {
      return;
    }

    const children = measureSync('treeChildren', () => options.getChildren(node));
    await options.prepareNodes?.(children);
    for (const child of children) {
      guardEdge();
      await traverseNode(child);
    }
  };

  await options.prepareNodes?.(roots);
  for (const root of roots) {
    guardEdge();
    await traverseNode(root);
  }
}

