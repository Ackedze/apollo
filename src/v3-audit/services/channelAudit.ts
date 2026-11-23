import type { LibraryComponent } from '../reference/libraryTypes';

export type AuditChannel = 'Desktop' | 'MobileWeb' | 'iOS' | 'Android';

function normalizePlatform(
  value: string | null | undefined,
): 'desktop' | 'mobile-web' | 'universal' | '' {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'desktop') return 'desktop';
  if (normalized === 'mobile-web' || normalized === 'mobile web') {
    return 'mobile-web';
  }
  if (normalized === 'universal') return 'universal';

  return '';
}

function normalizeCatalogPath(component: LibraryComponent | null | undefined): string {
  const sourceFile = String(component?.sourceFile ?? '').trim();
  if (sourceFile) {
    return sourceFile.replace(/\\/g, '/').toLowerCase();
  }

  const source = String(component?.source ?? '').trim().toLowerCase();
  if (!source) {
    return '';
  }

  if (source.includes('web ::')) return 'web/';
  if (source.includes('ios ::')) return 'abm/ios/';
  if (source.includes('android ::')) return 'abm/android/';
  if (source.includes('abm')) return 'abm/';

  return source;
}

export function parseAuditChannel(value: string | null | undefined): AuditChannel {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'mobileweb' || normalized === 'mobile-web' || normalized === 'mobile web') {
    return 'MobileWeb';
  }

  if (normalized === 'ios') return 'iOS';
  if (normalized === 'android') return 'Android';

  return 'Desktop';
}

export function isWrongChannelComponent(
  component: LibraryComponent | null | undefined,
  selectedChannel: AuditChannel,
): boolean {
  if (!component) {
    return false;
  }

  const catalogPath = normalizeCatalogPath(component);
  const platform = normalizePlatform(component.platform);
  const isAbm = catalogPath.includes('abm/');
  const isWeb = catalogPath.includes('web/');
  const isIos = catalogPath.includes('abm/ios/');
  const isAndroid = catalogPath.includes('abm/android/');

  switch (selectedChannel) {
    case 'Desktop':
      return isAbm || platform === 'mobile-web';
    case 'MobileWeb':
      return isAbm || platform === 'desktop';
    case 'iOS':
      return isWeb || isAndroid;
    case 'Android':
      return isWeb || isIos;
    default:
      return false;
  }
}
