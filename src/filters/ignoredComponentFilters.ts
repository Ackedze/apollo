import type { AuditItem } from '../types/audit';

const SANDBOX_COMPONENT_KEYS = new Set([
  'a7215914d0ce763820cf7b2d9ce411ba8fd0d340',
  '61b5396e383b8f1b771f67c560369010b8f42f24',
  '78f0d6548a8d085c41ee5d347eb297e4093117c4',
  '06940c9158aa15ff5ad74fbc95f09936fd8b9f72',
  '72b3f043328822f7e1b57b9d6c75f8d473db8437',
  '4df88df8c730f8c6b05bd9a3bb046a668426e99f',
  'e12b5dc4455e77393e21b7f8b43bb3ff5aecd8d3',
  '2bef8a8ee052228c37a68ed9c3aa95eb217acc30',
  '6a42bab88723f0334c58a3aff640abdb07965101',
  'e21f2fe2c2649ab560ac19ee522c3c0e1673325f',
  '32e637e002987025b7a3f2fc6137f7b51eba8ca8',
  'f638a5c22ac27fe6e9b36127267f50ad3f45a2bc',
  '711754a1e32bd428ad50876c3acdfe351dc8a4aa',
  '4988b64cef070355cfa4cdf48851d49c5c5d8519',
  'ca83024a7a403cc13094d05891ebb17a74f34ba8',
  '7ad5315e3da9e4aa92da03804237ddb36b919b73',
  '4afa994c3b344fc5f2cc739ea372650dcb12460d',
  'ccb190aea600d205ae04640ba6de90723cbc31cf',
  'ad4c544ec2c7bd5ee6a98847180945fb9b4836d8',
  'd892beb5669f8226a682f9afa15d7a9578131f43',
  '7e1c910207d99b61a51d93759698e8fcfc4fd4b3',
  '5a59a495ee5df4f2dce184ce6280d3005c40b90e',
]);

const IGNORED_COMPONENT_NAMES = new Set(['❌template']);

export function filterIgnoredLocalLibraryItems(items: AuditItem[]): AuditItem[] {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  return items.filter((item) => !isIgnoredLocalAuditItem(item));
}

export async function shouldIgnoreNodeDiagnostics(
  node: SceneNode,
): Promise<boolean> {
  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (isIgnoredByName(current)) {
      return true;
    }

    const componentKey = await getNodeComponentKey(current);
    if (componentKey && SANDBOX_COMPONENT_KEYS.has(componentKey)) {
      return true;
    }

    current = current.parent ?? null;
  }

  return false;
}

function isIgnoredLocalAuditItem(item: AuditItem): boolean {
  if (!item) {
    return false;
  }

  if (IGNORED_COMPONENT_NAMES.has(item.name)) {
    return true;
  }

  return !!item.componentKey && SANDBOX_COMPONENT_KEYS.has(item.componentKey);
}

function isIgnoredByName(node: BaseNode): boolean {
  return 'name' in node && IGNORED_COMPONENT_NAMES.has(node.name);
}

async function getNodeComponentKey(node: BaseNode): Promise<string | null> {
  if (node.type === 'INSTANCE') {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent?.key ?? null;
  }

  if (node.type === 'COMPONENT') {
    return node.key ?? null;
  }

  return null;
}
