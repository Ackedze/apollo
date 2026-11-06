import type { LibraryComponent } from '../reference/libraryTypes';
import type { LibraryComponentFreshness } from '../services/libraryComponentFreshness';
import type { DiffEntry } from '../structure/diff';

export type RelevanceStatus = 'technical' | 'deprecated' | 'update' | 'current' | 'unknown';
export type UpdateReason = 'catalog-lifecycle' | 'library-update-available';
export type ThemeAuditKind = 'corporateComponent' | 'missingThemeMode';

export type FindingActionKind =
  | 'swap-component'
  | 'apply-library-update'
  | 'bind-style'
  | 'bind-variable';

export interface FindingActionSummary {
  id: string;
  kind: FindingActionKind;
  label: string;
  targetName: string;
  targetLibrary?: string | null;
  scope:
    | 'wrongChannel'
    | 'deprecated'
    | 'update'
    | 'deprecatedStyles'
    | 'customStyles';
}

export interface PathSegment {
  id: string;
  label: string;
  nodeType: BaseNode['type'];
  visible: boolean;
}

export interface AuditItem {
  id: string;
  name: string;
  nodeType: SceneNode['type'];
  pageName: string;
  pathSegments: PathSegment[];
  fullPath: string;
  relevance: RelevanceStatus;
  librarySource: string | null;
  librarySourceFile?: string | null;
  isLocal: boolean;
  reference?: LibraryComponent | null;
  componentKey: string | null;
  diffs: DiffEntry[];
  /**
   * Наблюдаемые отклонения actual от effective baseline до применения
   * allowlist, suppressions и правил допустимости кастомизаций.
   */
  baselineDiffs?: DiffEntry[];
  comparisonIssues?: string[];
  updateReasons?: UpdateReason[];
  libraryFreshness?: LibraryComponentFreshness | null;
  focusNodeId?: string | null;
  sourceOwnerOccurrenceIds?: string[];
  sourceOwnerKind?: 'local' | 'remote';
  localComponentOwner?: {
    id: string;
    name: string;
    pageName: string;
    fullPath: string;
  } | null;
  customStyleReasons?: string[];
  forcedCategory?: 'technical' | 'deprecated' | null;
  forcedCategoryReason?: string | null;
  resolvedReferenceVariantKey?: string | null;
  resolvedReferenceVariantName?: string | null;
  actions?: FindingActionSummary[];
  customizationOnly?: boolean;
}

export interface DetachedEntry {
  id: string;
  name: string;
  pageName: string;
  path: string;
  componentKey: string;
  libraryName: string | null;
  componentName: string | null;
  sourceFile?: string | null;
  visible: boolean;
}

export interface CustomStyleEntry {
  id: string;
  name: string;
  nodeType: SceneNode['type'] | null;
  pageName: string;
  path: string;
  visible: boolean;
  reason: string;
  resource: AuditResource;
  actions?: FindingActionSummary[];
}

export interface DeprecatedStyleEntry {
  id: string;
  name: string;
  nodeType: SceneNode['type'] | null;
  pageName: string;
  path: string;
  visible: boolean;
  reason: 'fill' | 'stroke';
  styleId: string;
  styleKey: string;
  styleLabel: string;
  sourceFile: string;
  sourceLibrary?: string;
  actions?: FindingActionSummary[];
}

export interface AuditResource {
  type: 'component' | 'component-variant' | 'style' | 'token' | 'raw-value';
  name: string;
  key: string | null;
  id?: string | null;
  library: string | null;
  sourceFile?: string | null;
}

export interface ThemeAuditEntry {
  id: string;
  kind: ThemeAuditKind;
  name: string;
  pageName: string;
  path: string;
  visible: boolean;
  nodeId: string | null;
  nodeType: SceneNode['type'] | 'PAGE' | null;
  libraryName?: string | null;
  recommendation: string;
  replacementComponentKey?: string | null;
  themeCollectionId?: string | null;
  targetModeId?: string | null;
}
