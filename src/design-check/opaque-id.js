let sequence = 0;

// Correlation IDs only: Figma's iframe may expose crypto without randomUUID,
// and older hosts may have no Web Crypto at all. These IDs are not credentials.
function createOpaqueId({ crypto = globalThis.crypto, now = Date.now, random = Math.random } = {}) {
  const serial = (++sequence).toString(36);
  try {
    if (typeof crypto?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('') + '-' + serial;
    }
  } catch { /* Restricted hosts can expose Web Crypto but reject its use. */ }
  return now().toString(36) + '-' + serial + '-' + random().toString(36).slice(2) + random().toString(36).slice(2);
}

module.exports = { createOpaqueId };
