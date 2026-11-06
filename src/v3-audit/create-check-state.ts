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
    wrongChannelEntries: AuditItem[]
    localLibraryItems: AuditItem[]
    presetItems: AuditItem[]
    detachedEntries: DetachedEntry[]
    customStyleEntries : CustomStyleEntry[]
    deprecatedStyleEntries: DeprecatedStyleEntry[]
    contractCustomizationItems: AuditItem[]
    totalItems: number;
}

export const createCheckState = (): CheckState => {
    return {
        relevanceBuckets: {
            technical: [],
            deprecated: [],
            update: [],
            current: [],
            unknown: [],
          },
          themizationEntries: [],
          wrongChannelEntries: [],
          localLibraryItems: [],
          presetItems: [],
          detachedEntries: [],
          customStyleEntries: [],
          deprecatedStyleEntries: [],
          contractCustomizationItems: [],
          totalItems: 0,
    }
}
