type DSLayoutDirection = 'H' | 'V' | null;

export interface DSPadding {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}

export interface DSNodeLayout {
  width?: number | null;
  widthToken?: string | null;
  height?: number | null;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  direction?: DSLayoutDirection;
  primaryAxisAlignItems?: string | null;
  counterAxisAlignItems?: string | null;
  padding?: DSPadding | null;
  itemSpacing?: number | null;
  sizing?: {
    horizontal?: string | null;
    vertical?: string | null;
  } | null;
  paddingTokens?: {
    top?: string | null;
    right?: string | null;
    bottom?: string | null;
    left?: string | null;
  } | null;
  itemSpacingToken?: string | null;
}

export interface DSVariableModeContext {
  collectionId: string;
  resolvedModeId: string | null;
  explicitModeId: string | null;
  explicitOwnerNodeId: string | null;
  explicitOwnerName: string | null;
  explicitOwnerPath: string | null;
}

interface DSTokenReference {
  styleKey: string;
}

export interface DSNodeStyles {
  fill?: DSTokenReference | null;
  stroke?: DSTokenReference | null;
  text?: DSTokenReference | null;
  effects?: DSTokenReference[] | null;
}

interface DSPaintInfo {
  color?: string | null;
  token?: string | null;
  paintTypes?: string[] | null;
}

interface DSStrokeInfo extends DSPaintInfo {
  weight?: number | null;
  weights?: {
    top: number | null;
    right: number | null;
    bottom: number | null;
    left: number | null;
  } | null;
  align?: string | null;
}

export interface DSInstanceInfo {
  componentKey: string;
  variantProperties?: Record<string, string>;
  componentProperties?: Record<string, string>;
  directOverrides?: DSInstanceOverride[];
}

export interface DSInstanceOverride {
  nodeId: string;
  fields: string[];
}

export interface DSRadiiValues {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export type DSRadii = number | DSRadiiValues;

export interface DSTextContent {
  characters?: string;
  fontName?: string;
  fontSize?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  paragraphSpacing?: number;
  case?: string;
  alignHorizontal?: string;
}

export interface DSEffect {
  type: string;
  radius: number | null;
  color?: string | null;
  offset?: { x: number; y: number } | null;
  spread?: number | null;
  visible?: boolean | null;
  blendMode?: string | null;
}

export interface DSStructureNode {
  id: number;
  nodeId?: string;
  parentId: number | null;
  path: string;
  type: string;
  name: string;
  visible: boolean;
  styles?: DSNodeStyles;
  fill?: DSPaintInfo | null;
  stroke?: DSStrokeInfo | null;
  layout?: DSNodeLayout;
  opacity?: number | null;
  clipsContent?: boolean | null;
  opacityToken?: string | null;
  typographyToken?: string | null;
  radius: DSRadii | null;
  radiusToken?: string | null;
  effects?: DSEffect[] | null;
  variableModes?: DSVariableModeContext[];
  componentInstance?: DSInstanceInfo | null;
  text?: DSTextContent;
  referenceOrigin?: 'host' | 'nested-component';
  referenceOwnerComponentKey?: string | null;
  referenceOwnerRole?: 'Main' | 'Part' | null;
  referenceOwnerPath?: string | null;
  referenceOwnerRelativePath?: string | null;
  referenceOwnerVariantProperties?: Record<string, string> | null;
  referenceVariantOwnedProperties?: string[];
  /**
   * Property-level provenance for a fully materialized effective baseline.
   *
   * Nested component composition cannot be merged safely at node level: a
   * wrapper may own the paint while the nested component still owns layout,
   * typography, or another property on the same Figma node. These entries
   * record the component that supplied each effective property so later,
   * deeper materialization can merge properties without inferring ownership
   * from component names or path decoration.
   */
  referencePropertyOwners?: Record<string, DSReferencePropertyOwner>;
}

export interface DSReferencePropertyOwner {
  componentKey: string | null;
  ownerPath: string | null;
  ownerRelativePath: string | null;
  origin:
    | 'host-baseline'
    | 'nested-baseline'
    | 'host-override'
    | 'variant-patch';
}

export interface DSNormalizedElement {
  path: string;
  type?: string;
  componentKey?: string;
  visible?: boolean;
  styles?: {
    fill?: { styleKey?: string | null };
    stroke?: { styleKey?: string | null };
    text?: { styleKey?: string | null };
  };
  layout?: {
    padding?: [number, number, number, number];
    gap?: number;
    sizing?: {
      horizontal?: string | null;
      vertical?: string | null;
    } | null;
    primaryAxisAlignItems?: string | null;
    counterAxisAlignItems?: string | null;
    radius?: number | [number, number, number, number];
    paddingTokens?: {
      top?: string | null;
      right?: string | null;
      bottom?: string | null;
      left?: string | null;
    } | null;
    gapToken?: string | null;
  };
  text?: { value?: string };
  typographyToken?: string | null;
  typography?: {
    styleKey?: string | null;
    token?: string | null;
  };
  fill?: DSPaintInfo | null;
  stroke?: DSStrokeInfo | null;
}

export interface DSNormalizedSnapshot {
  kind: 'snapshot';
  source: {
    nodeId: string;
    name: string;
    generatedAt: string;
    scope: 'selection';
  };
  elements: DSNormalizedElement[];
}

type DSStructureNodePatch = Partial<
  Pick<
    DSStructureNode,
    | 'path'
    | 'type'
    | 'name'
    | 'visible'
    | 'styles'
    | 'fill'
    | 'stroke'
    | 'layout'
    | 'opacity'
    | 'clipsContent'
    | 'opacityToken'
    | 'typographyToken'
    | 'radius'
    | 'radiusToken'
    | 'effects'
    | 'variableModes'
    | 'componentInstance'
    | 'text'
  >
>;

export type DSVariantStructurePatch =
  | { op: 'update'; id: number; value: DSStructureNodePatch }
  | { op: 'add'; node: DSStructureNode }
  | { op: 'remove'; id: number };
