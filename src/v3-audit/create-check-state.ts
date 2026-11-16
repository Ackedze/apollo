import type {
  RelevanceStatus,
  AuditItem,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  ThemeAuditEntry,
  WrongChannelTypographyEntry,
} from './types/audit'

export interface CheckState {
    relevanceBuckets: Record<RelevanceStatus, AuditItem[]>
    themizationEntries: ThemeAuditEntry[]
    wrongChannelEntries: AuditItem[]
    wrongChannelTypographyEntries: WrongChannelTypographyEntry[]
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
          wrongChannelTypographyEntries: [],
          localLibraryItems: [],
          presetItems: [],
          detachedEntries: [],
          customStyleEntries: [],
          deprecatedStyleEntries: [],
          contractCustomizationItems: [],
          totalItems: 0,
    }
}
