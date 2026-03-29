import type {
  RelevanceStatus,
  AuditItem,
  ThemeStatus,
  CustomStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
} from './types/audit'

export interface CheckState {
    relevanceBuckets: Record<RelevanceStatus, AuditItem[]>
    themeBuckets: Record<ThemeStatus, AuditItem[]>
    themizationEntries: ThemeAuditEntry[]
    localLibraryItems: AuditItem[]
    presetItems: AuditItem[]
    detachedEntries: DetachedEntry[]
    customStyleEntries : CustomStyleEntry[]
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
          themeBuckets: {
            ok: [],
            error: [],
          },
          themizationEntries: [],
          localLibraryItems: [],
          presetItems: [],
          detachedEntries: [],
          customStyleEntries: [],
          totalItems: 0,
    }
}
