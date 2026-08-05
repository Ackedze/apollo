export interface AuditTreeVisitResult {
  skipChildren?: boolean;
}

export interface AuditTreeTraversalOptions<TNode> {
  isVisible: (node: TNode) => boolean;
  getChildren: (node: TNode) => readonly TNode[];
  visit: (node: TNode) => Promise<AuditTreeVisitResult | void>;
  throwIfCancelled: () => void;
}

export async function traverseAuditTree<TNode>(
  roots: readonly TNode[],
  options: AuditTreeTraversalOptions<TNode>,
): Promise<void> {
  const traverseNode = async (node: TNode): Promise<void> => {
    options.throwIfCancelled();
    if (!options.isVisible(node)) {
      return;
    }

    const result = await options.visit(node);
    if (result?.skipChildren) {
      return;
    }

    const children = options.getChildren(node);
    for (const child of children) {
      options.throwIfCancelled();
      await traverseNode(child);
    }
  };

  for (const root of roots) {
    options.throwIfCancelled();
    await traverseNode(root);
  }
}
