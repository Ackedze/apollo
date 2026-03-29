import type { RelevanceStatus, AuditItem, ThemeStatus, CustomStyleEntry, DetachedEntry } from './types/audit'

export interface CheckState {
    relevanceBuckets: Record<RelevanceStatus, AuditItem[]>
    themeBuckets: Record<ThemeStatus, AuditItem[]>
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
          localLibraryItems: [],
          presetItems: [],
          detachedEntries: [],
          customStyleEntries: [],
          totalItems: 0,
    }
}
