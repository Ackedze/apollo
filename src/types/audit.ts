import type { LibraryComponent } from '../reference/libraryTypes';
import type { DiffEntry } from '../structure/diff';

export type RelevanceStatus = 'deprecated' | 'update' | 'current' | 'unknown';
export type ThemeAuditKind = 'corporateComponent' | 'missingThemeMode';

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
  isLocal: boolean;
  reference?: LibraryComponent | null;
  componentKey: string | null;
  diffs: DiffEntry[];
  comparisonIssues?: string[];
  customStyleReasons?: string[];
}

export interface DetachedEntry {
  id: string;
  name: string;
  pageName: string;
  path: string;
  componentKey: string;
  libraryName: string | null;
  componentName: string | null;
  visible: boolean;
}

export interface CustomStyleEntry {
  id: string;
  name: string;
  nodeType: SceneNode['type'] | null;
  pageName: string;
  visible: boolean;
  reason: string;
}

export interface DeprecatedStyleEntry {
  id: string;
  name: string;
  nodeType: SceneNode['type'] | null;
  pageName: string;
  visible: boolean;
  reason: 'fill' | 'stroke';
  styleLabel: string;
  sourceFile: string;
  sourceLibrary?: string;
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
