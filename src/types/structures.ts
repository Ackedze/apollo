type DSLayoutDirection = 'H' | 'V' | null;

interface DSPadding {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}

export interface DSNodeLayout {
  width?: number | null;
  height?: number | null;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  direction?: DSLayoutDirection;
  padding?: DSPadding | null;
  itemSpacing?: number | null;
  paddingTokens?: {
    top?: string | null;
    right?: string | null;
    bottom?: string | null;
    left?: string | null;
  } | null;
  itemSpacingToken?: string | null;
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
}

interface DSStrokeInfo extends DSPaintInfo {
  weight?: number | null;
  align?: string | null;
}

export interface DSInstanceInfo {
  componentKey: string;
  variantProperties?: Record<string, string>;
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
  lineHeight?: number | string;
  letterSpacing?: number;
  paragraphSpacing?: number;
  case?: string;
}

export interface DSEffect {
  type: string;
  radius: number | null;
  color?: string | null;
  offset?: { x: number; y: number } | null;
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
  opacityToken?: string | null;
  radius: DSRadii | null;
  radiusToken?: string | null;
  effects?: DSEffect[] | null;
  componentInstance?: DSInstanceInfo | null;
  text?: DSTextContent;
}

export interface DSNormalizedElement {
  path: string;
  type?: string;
  componentKey?: string;
  visible?: boolean;
  layout?: {
    padding?: [number, number, number, number];
    gap?: number;
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
    | 'layout'
    | 'opacity'
    | 'radius'
    | 'effects'
    | 'componentInstance'
    | 'text'
  >
>;

export type DSVariantStructurePatch =
  | { op: 'update'; id: number; value: DSStructureNodePatch }
  | { op: 'add'; node: DSStructureNode }
  | { op: 'remove'; id: number };
