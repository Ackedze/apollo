// UI choices copied from the pinned v3 source; these are not audit facts.
const PAGE_TYPES = Object.freeze([
  { id: 'form', label: 'Форма' }, { id: 'details', label: 'Просмотровая' },
  { id: 'data-list', label: 'Страница с таблицей' }, { id: 'landing', label: 'Лендинг' },
  { id: 'dashboard', label: 'Дашборд' }, { id: 'other', label: 'Другое' },
]);
const PLATFORMS = Object.freeze(['Desktop', 'MobileWeb', 'iOS', 'Android']);
const CHANNELS = Object.freeze(['b2b', 'b2c', 'site', 'invest']);
const DEFAULT_SETTINGS = Object.freeze({ pageTypeId: null, channelId: 'b2b', pickerLabel: 'Desktop',
  compact: false, shellAuditEnabled: false, showExpectedCustomizations: true,
  hideCustomizations: false, experimentalContractV2Enabled: false });
const PREFERENCE_VERSION = 'apollo.design-check-ui-preferences.v1';
const CONTEXT_FIELDS = new Set(['pageTypeId', 'channelId', 'pickerLabel', 'shellAuditEnabled', 'experimentalContractV2Enabled']);
function validSetting(key, value) {
  if (key === 'pageTypeId') return value === null || PAGE_TYPES.some(option => option.id === value);
  if (key === 'channelId') return CHANNELS.includes(value);
  if (key === 'pickerLabel') return PLATFORMS.includes(value);
  return Object.hasOwn(DEFAULT_SETTINGS, key) && typeof value === 'boolean';
}
module.exports = { PAGE_TYPES, PLATFORMS, CHANNELS, DEFAULT_SETTINGS, PREFERENCE_VERSION, CONTEXT_FIELDS, validSetting };
