import type { RelevanceStatus, AuditItem, ThemeStatus, CustomStyleEntry, DetachedEntry, TextNodeEntry } from './types/audit'

export interface CheckState {
    relevanceBuckets: Record<RelevanceStatus, AuditItem[]>
    themeBuckets: Record<ThemeStatus, AuditItem[]>
    localLibraryItems: AuditItem[]
    presetItems: AuditItem[]
    detachedEntries: DetachedEntry[]
    customStyleEntries : CustomStyleEntry[]
    totalItems: number;
    textNodes: TextNodeEntry[];
    textAll: TextNodeEntry[];
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
          textNodes: [],
          textAll: []
    }
}