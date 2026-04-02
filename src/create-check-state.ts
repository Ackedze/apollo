import type {
  RelevanceStatus,
  AuditItem,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
} from './types/audit'

export interface CheckState {
    relevanceBuckets: Record<RelevanceStatus, AuditItem[]>
    themizationEntries: ThemeAuditEntry[]
    localLibraryItems: AuditItem[]
    presetItems: AuditItem[]
    detachedEntries: DetachedEntry[]
    customStyleEntries : CustomStyleEntry[]
    deprecatedStyleEntries: DeprecatedStyleEntry[]
    totalItems: number;
}

export const createCheckState = (): CheckState => {
    return {
        relevanceBuckets: {
            deprecated: [],
            update: [],
            current: [],
            unknown: [],
          },
          themizationEntries: [],
          localLibraryItems: [],
          presetItems: [],
          detachedEntries: [],
          customStyleEntries: [],
          deprecatedStyleEntries: [],
          totalItems: 0,
    }
}
