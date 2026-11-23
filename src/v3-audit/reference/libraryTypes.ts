import type {
  DSStructureNode,
  DSVariantStructurePatch,
} from '../types/structures';

export type LibraryStatus = 'deprecated' | 'update' | 'current' | 'changed';
export type ComponentPlatform = 'Desktop' | 'Mobile Web' | 'Universal';
export type ComponentRole = 'Main' | 'Part';
type LibraryComponentVariant = {
  key: string;
  id: string;
  name: string;
  properties?: Record<string, string>;
}

export interface LibraryComponent {
  key?: string;
  names: string[];
  name?: string;
  status: LibraryStatus;
  platform?: ComponentPlatform;
  role?: ComponentRole;
  source?: string;
  sourceFile?: string;
  displayName: string;
  variantOf?: string;
  parentComponent?: { key: string | null; name: string | null } | null;
  structure?: DSStructureNode[];
  variants?: LibraryComponentVariant[];
  variantStructures?: Record<string, DSVariantStructurePatch[]>;
  notes?: string;
}

export interface LibraryCatalog {
  id: string;
  name: string;
  components: LibraryComponent[];
}

interface AthenaVariant {
  key: string;
  name: string;
  id: string;
  properties?: Record<string, string>;
}

export interface AthenaComponent {
  key: string;
  name: string;
  description?: string;
  status?: string;
  role?: string;
  platform?: string;
  variants?: AthenaVariant[];
  structure?: DSStructureNode[];
  variantStructures?: Record<string, DSVariantStructurePatch[]>;
  parentComponent?: { key: string | null; name: string | null } | null;
  meta?: {
    pageName: string;
    category: string | null;
  };
}

export interface AthenaCatalog {
  meta: {
    fileName: string;
    library?: string;
  };
  components: AthenaComponent[];
}

export type NormalizedElement = {
  id?: number;
  path: string;
  type?: string;
  componentKey?: string;
  visible?: boolean;
  styles?: {
    fill?: { styleKey?: string | null };
    stroke?: { styleKey?: string | null };
    text?: { styleKey?: string | null };
  };
  opacity?: number | null;
  opacityToken?: string | null;
  radiusToken?: string | null;
  typographyToken?: string | null;
  fill?: {
    color?: string | null;
    token?: string | null;
  };
  stroke?: {
    color?: string | null;
    token?: string | null;
    weight?: number | null;
    weights?: {
      top: number | null;
      right: number | null;
      bottom: number | null;
      left: number | null;
    } | null;
    align?: string | null;
  };
  layout?: {
    padding?: number[];
    gap?: number;
    sizing?: {
      horizontal?: string | null;
      vertical?: string | null;
    } | null;
    primaryAxisAlignItems?: string | null;
    counterAxisAlignItems?: string | null;
    radius?: number | number[];
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
};

export type NormalizedJsonCatalog = {
  kind: string;
  source?: {
    file?: string;
    library?: string;
  };
  elements?: NormalizedElement[];
  components?: NormalizedJsonComponent[];
};

export type TokenCatalog = {
  meta?: { fileName?: string; library?: string };
  collections?: Array<{
    id?: string;
    key?: string;
    name?: string;
    defaultModeId?: string | null;
    modes?: Array<{
      modeId?: string;
      name?: string;
    }>;
    variables?: Array<{
      id?: string;
      key?: string;
      name?: string;
      tokenName?: string;
      groupName?: string;
      resolvedType?: string;
      variableCollectionId?: string;
      hiddenFromPublishing?: boolean;
      scopes?: string[];
      valuesByMode?: Record<string, any>;
      actualValuesByMode?: Record<string, any[]>;
      actualHexByMode?: Record<string, string[]>;
      resolutionByMode?: Record<
        string,
        {
          status?: 'resolved' | 'partial' | 'unresolved';
          aliasIds?: string[];
          unresolvedAliasIds?: string[];
        }
      >;
    }>;
  } | null>;
};

export type StyleCatalog = {
  meta?: { fileName?: string; library?: string };
  styles?: Array<{
    key?: string;
    name?: string;
    group?: string;
    type?: string;
    value?: {
      kind?: string;
      data?: {
        paints?: Array<{
          type?: string;
          color?: string;
          opacity?: number;
          visible?: boolean;
          blendMode?: string;
        }>;
        fontName?: string;
        fontSize?: number;
        lineHeight?: string | number;
        letterSpacing?: string | number;
      };
    };
  } | null>;
};

export type NormalizedJsonComponent = {
  key?: string;
  name?: string;
  status?: string;
  role?: string;
  platform?: string;
  description?: string;
  category?: string;
  defaultVariant?: string;
  variants?: Array<{
    id?: string;
    key?: string;
    name?: string;
    properties?: Record<string, string>;
  }>;
  structure?: DSStructureNode[];
  variantStructures?: Record<string, DSVariantStructurePatch[]>;
};
