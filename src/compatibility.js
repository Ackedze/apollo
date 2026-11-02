'use strict';
const REQUIREMENTS = require('./compatibility-requirements.json');
function version(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function compare(left, right) {
  const a = version(left), b = version(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function assessCompatibility(health, requirements = REQUIREMENTS) {
  const actual = health?.proxy?.version;
  const result = (state, message) => ({ state, message });
  if (health?.ok !== true) return result('unavailable', 'Нет связи с Apollo Proxy. Запустите приложение и проверьте подключение снова.');
  if (!version(actual)) return result('update-proxy', 'Не удалось определить версию Apollo Proxy. Проверьте обновление приложения в меню AP.');
  if (compare(actual, requirements.minProxyVersion) < 0) return result('update-proxy', `Установлен Proxy ${actual}. Нужен ${requirements.minProxyVersion} или новее. В меню AP откройте «Проверить обновления» и обновите приложение.`);
  if (compare(actual, requirements.maxProxyVersionExclusive) >= 0) return result('update-apollo', `Proxy ${actual} использует новую основную версию. Обновите плагин Apollo в Figma.`);
  const info = health.compatibility;
  if (!info || !Number.isInteger(info.protocolVersion)) return result('update-proxy', 'Эта сборка Proxy не передаёт сведения о совместимости данных. Обновите приложение через меню AP.');
  if (info.protocolVersion !== requirements.protocolVersion) return result(info.protocolVersion > requirements.protocolVersion ? 'update-apollo' : 'update-proxy', info.protocolVersion > requirements.protocolVersion ? 'Обновите плагин Apollo в Figma: протокол Proxy новее поддерживаемого.' : 'Обновите приложение Apollo Proxy: протокол проверки совместимости устарел.');
  const data = info.data;
  if (data?.state !== 'ready' || !/^[a-f0-9]{64}$/.test(data.version || '')) return result('update-data', 'Пакет данных не установлен или его версии не согласованы. В меню AP откройте «Проверить обновления» и обновите знания.');
  if (data.schemaVersion !== requirements.dataSchemaVersion) return result('update-apollo', 'Формат пакета данных не поддерживается. Обновите плагин Apollo в Figma.');
  if (!requirements.dataProfiles.includes(data.profileVersion)) {
    const newer = compare(data.profileVersion, requirements.dataProfiles[requirements.dataProfiles.length - 1]);
    return newer > 0 ? result('update-apollo', `Профиль данных ${data.profileVersion} новее поддерживаемого. Обновите плагин Apollo в Figma.`)
      : result('update-data', `Нужен пакет данных с профилем ${requirements.dataProfiles.join(' / ')}. Обновите знания через меню AP.`);
  }
  if (data.deliveryProfile !== requirements.deliveryProfile) return result('update-data', 'Для этой сборки Apollo нужен пакет проверки, знаний и Figma MCP. Обновите знания через меню AP.');
  if (!Number.isFinite(Date.parse(data.generatedAt)) || Date.parse(data.generatedAt) < Date.parse(requirements.minDataGeneratedAt)) return result('update-data', 'Пакет данных старше минимального выпуска для этой сборки Apollo. Обновите знания через меню AP.');
  return result('compatible', 'Версии Apollo, Proxy и пакета данных совместимы.');
}
function createCompatibilityClient({ request, endpoint, onChange = () => {}, timeoutMs = 5000 }) {
  let pending = null;
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
      let health = null;
      try { const response = await request(endpoint, { signal: abort.signal, cache: 'no-store' }); if (response.ok) health = await response.json(); }
      catch {} finally { clearTimeout(timer); }
      const status = { available: health?.ok === true, version: typeof health?.proxy?.version === 'string' ? health.proxy.version : null,
        compatibility: assessCompatibility(health) };
      onChange(status); return status;
    })().finally(() => { pending = null; });
    return pending;
  }
  async function ensure() {
    const status = await refresh();
    if (status.compatibility.state !== 'compatible') throw Object.assign(Error(status.compatibility.message), { code: 'APOLLO_COMPATIBILITY_REQUIRED' });
  }
  return { refresh, ensure };
}
module.exports = { REQUIREMENTS, compare, assessCompatibility, createCompatibilityClient };
