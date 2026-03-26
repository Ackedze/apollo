const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');

const referenceListPath = path.resolve(
  __dirname,
  '../src/reference/referenceSources.json',
);
const jsonsPath = path.resolve(
  __dirname,
  '../JSON/referenceSourcesMVP.json',
);

const DEFAULT_REMOTE_URL =
  'https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json';

/**
 * Optional knobs:
 * - REFERENCE_SOURCES_URL: override remote URL
 * - NEMESIS_OFFLINE=1: do not fetch, use local cache/files only
 * - NEMESIS_FETCH_TIMEOUT_MS: request timeout (default 15000)
 * - NODE_OPTIONS="--dns-result-order=ipv4first": prefer IPv4 if network is quirky
 */
const remoteReferenceUrl =
  process.env.REFERENCE_SOURCES_URL || DEFAULT_REMOTE_URL;
const OFFLINE = process.env.NEMESIS_OFFLINE === '1';
const TIMEOUT_MS = Number(process.env.NEMESIS_FETCH_TIMEOUT_MS || 15000);

function writeReferenceFiles(payload) {
  const serialized = JSON.stringify(payload, null, 2);
  fs.mkdirSync(path.dirname(referenceListPath), { recursive: true });
  fs.mkdirSync(path.dirname(jsonsPath), { recursive: true });
  fs.writeFileSync(referenceListPath, serialized);
  fs.writeFileSync(jsonsPath, serialized);
  console.log(
    `Prepared reference sources list with ${payload.catalogs?.length ?? 0} files → ${jsonsPath}`,
  );
}

function readLocalIfExists() {
  const candidates = [jsonsPath, referenceListPath];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        console.log(`[Apollo] Using local reference sources: ${p}`);
        return parsed;
      } catch (e) {
        // continue
      }
    }
  }
  return null;
}

function fetchJsonViaHttps(urlString) {
  const url = new URL(urlString);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'GET',
        hostname: url.hostname,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Apollo/prepareReferences',
        },
      },
      (res) => {
        const { statusCode = 0, statusMessage = '' } = res;
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            return reject(
              new Error(
                `Failed to fetch reference list (${statusCode} ${statusMessage}) from ${urlString}`,
              ),
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from ${urlString}: ${e.message}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(
        new Error(`Timeout after ${TIMEOUT_MS}ms fetching ${urlString}`),
      );
    });
    req.end();
  });
}

async function fetchWithRetries(url, retries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Apollo] Retry ${attempt}/${retries}…`);
      }
      return await fetchJsonViaHttps(url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  // Offline mode or any local fallback
  const local = readLocalIfExists();
  if (OFFLINE) {
    if (!local) {
      throw new Error(
        `NEMESIS_OFFLINE=1 but no local referenceSources found at:\n- ${jsonsPath}\n- ${referenceListPath}`,
      );
    }
    writeReferenceFiles(local);
    return;
  }

  try {
    const payload = await fetchWithRetries(remoteReferenceUrl, 2);
    writeReferenceFiles(payload);
  } catch (e) {
    // fallback to local if remote failed
    if (local) {
      console.warn(
        `[Apollo] Remote fetch failed, falling back to local cache. Reason: ${e.message}`,
      );
      writeReferenceFiles(local);
      return;
    }
    throw e;
  }
}

main().catch((error) => {
  console.error(`[Apollo] Unable to load reference catalog list:`, error);
  process.exit(1);
});
