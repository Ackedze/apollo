import type { AuditResource, WrongChannelTypographyEntry } from '../types/audit';
import type { AuditChannel } from './channelAudit';
import { buildNodePath } from '../utils/nodeHelpers';

type TypographyResourceType = 'style' | 'token';
type ResourceWithChannels = {
  resource: AuditResource;
  channels: readonly AuditChannel[];
};

const fields: readonly VariableBindableTextField[] = [
  'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'letterSpacing',
  'lineHeight', 'paragraphSpacing', 'paragraphIndent',
];

export async function collectWrongChannelTypography(
  node: TextNode,
  selectedChannel: AuditChannel,
  resolveResource: (type: TypographyResourceType, id: string) => Promise<ResourceWithChannels | null>,
  assertCurrent: () => void,
): Promise<WrongChannelTypographyEntry[]> {
  const styleIds = new Set<string>();
  const variableIds = new Set<string>();
  function addStyle(id: string | PluginAPI['mixed'] | undefined) {
    if (typeof id === 'string' && id) styleIds.add(id);
  }
  function addVariable(alias: VariableAlias | undefined) {
    if (alias?.type === 'VARIABLE_ALIAS' && alias.id) variableIds.add(alias.id);
  }

  addStyle(node.textStyleId);
  const bindings = node.boundVariables;
  for (const field of fields) for (const alias of bindings?.[field] ?? []) addVariable(alias);

  // Range bindings may differ even when the entire layer has the same text style.
  let ranges: Pick<StyledTextSegment, 'textStyleId' | 'boundVariables'>[] = [];
  try {
    ranges = node.getStyledTextSegments?.(['textStyleId', 'boundVariables']) ?? [];
  } catch {
    // Direct bindings still provide evidence if ranges are unavailable.
  }
  for (const range of ranges) {
    addStyle(range.textStyleId);
    for (const field of fields) addVariable(range.boundVariables?.[field]);
  }

  const findings: WrongChannelTypographyEntry[] = [];
  const seen = new Set<string>();
  for (const [type, ids] of [['style', styleIds], ['token', variableIds]] as const) {
    for (const id of ids) {
      assertCurrent();
      const resolved = await resolveResource(type, id);
      assertCurrent();
      if (!resolved || resolved.channels.includes(selectedChannel)) continue;
      const key = type + ':' + resolved.resource.key;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ id:node.id, name:node.name, path:buildNodePath(node),
        resource:resolved.resource, channels:resolved.channels, selectedChannel });
    }
  }
  return findings;
}
