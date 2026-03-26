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
}

export interface LibraryComponent {
  key?: string;
  names: string[];
  name?: string;
  status: LibraryStatus;
  platform?: ComponentPlatform;
  role?: ComponentRole;
  source?: string;
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
  opacity?: number | null;
  opacityToken?: string | null;
  radiusToken?: string | null;
  fill?: {
    color?: string | null;
    token?: string | null;
  };
  stroke?: {
    color?: string | null;
    token?: string | null;
    weight?: number | null;
    align?: string | null;
  };
  layout?: {
    padding?: number[];
    gap?: number;
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
    name?: string;
    defaultModeId?: string | null;
    variables?: Array<{
      key?: string;
      name?: string;
      tokenName?: string;
      groupName?: string;
      valuesByMode?: Record<string, any>;
    }>;
  } | null>;
};

export type StyleCatalog = {
  meta?: { fileName?: string; library?: string };
  styles?: Array<{
    key?: string;
    name?: string;
    group?: string;
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
  }>;
};
