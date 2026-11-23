import type { LibraryComponent } from '../reference/libraryTypes';
import type { AuditChannel } from '../services/channelAudit';

export type ForcedAuditCategory = 'technical' | 'deprecated';

const TECHNICAL_LIBRARY_NAMES = [
  'Web :: Core Helpers',
  'Web :: Corp Helpers',
];

function normalizeLibraryName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const TECHNICAL_LIBRARY_NAME_SET = new Set(
  TECHNICAL_LIBRARY_NAMES.map(normalizeLibraryName),
);

export function getForcedAuditCategory(
  component: LibraryComponent | null | undefined,
): ForcedAuditCategory | null {
  const libraryName = normalizeLibraryName(component?.source);

  if (TECHNICAL_LIBRARY_NAME_SET.has(libraryName)) {
    return 'technical';
  }

  return null;
}

export function getForcedAuditCategoryReason(
  category: ForcedAuditCategory,
  component: LibraryComponent | null | undefined,
): string {
  const libraryName = normalizeLibraryName(component?.source) || 'Unknown library';

  switch (category) {
    case 'technical':
      return `library ${libraryName} is audited as technical helper content`;
    case 'deprecated':
      return `library ${libraryName} is audited as deprecated source content`;
    default:
      return `library ${libraryName} uses a forced audit category`;
  }
}

export function supportsThemizationForChannel(channel: AuditChannel): boolean {
  return channel === 'Desktop' || channel === 'MobileWeb';
}

export function getHiddenTabsForChannel(channel: AuditChannel): string[] {
  return supportsThemizationForChannel(channel) ? [] : ['themization'];
}
