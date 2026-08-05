import type { DSStructureNode } from '../types/structures';
import type { CustomStyleCollectionOptions } from './auditViewBuilder';
import type { DeprecatedStyleCollectionOptions } from './deprecatedStyleAudit';
import {
  createLibraryComponentFreshnessChecker,
  type LibraryComponentFreshnessChecker,
} from './libraryComponentFreshness';

export interface AuditTraversalContext {
  sceneNodeById: Map<string, SceneNode>;
  componentKeyCache: Map<string, string | null>;
  referenceStructureCache: Map<string, DSStructureNode[] | null>;
  localComponentContextCache: Map<string, boolean>;
  checkedComponentNodes: Set<string>;
  libraryComponentFreshnessChecker: LibraryComponentFreshnessChecker;
  customStyleOptions: CustomStyleCollectionOptions;
  deprecatedStyleOptions: DeprecatedStyleCollectionOptions;
}

export interface AuditTraversalContextDependencies {
  importComponentByKey: (componentKey: string) => Promise<ComponentNode>;
  customStyleOptions: CustomStyleCollectionOptions;
  deprecatedStyleOptions: DeprecatedStyleCollectionOptions;
}

export function createAuditTraversalContext(
  dependencies: AuditTraversalContextDependencies,
): AuditTraversalContext {
  return {
    sceneNodeById: new Map(),
    componentKeyCache: new Map(),
    referenceStructureCache: new Map(),
    localComponentContextCache: new Map(),
    checkedComponentNodes: new Set(),
    libraryComponentFreshnessChecker: createLibraryComponentFreshnessChecker(
      dependencies.importComponentByKey,
    ),
    customStyleOptions: dependencies.customStyleOptions,
    deprecatedStyleOptions: dependencies.deprecatedStyleOptions,
  };
}
