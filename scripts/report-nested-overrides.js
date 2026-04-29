const fs = require('node:fs');
const path = require('node:path');

const COMPONENTS_ROOT = path.resolve(__dirname, '../JSONS');

function walkJsonFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) {
    return files;
  }

  const queue = [rootDir];

  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function readCatalog(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function hasSuspiciousNestedOverride(element) {
  return Boolean(
    element?.fill?.token ||
      element?.stroke?.token ||
      element?.styles?.fill?.styleKey ||
      element?.styles?.stroke?.styleKey ||
      element?.styles?.text?.styleKey ||
      element?.typographyToken ||
      element?.layout?.gapToken ||
      element?.layout?.paddingTokens ||
      (Array.isArray(element?.layout?.padding) &&
        element.layout.padding.some((value) => typeof value === 'number' && value !== 0)) ||
      typeof element?.layout?.gap === 'number' ||
      typeof element?.layout?.radius === 'number' ||
      Array.isArray(element?.layout?.radius)
  );
}

function main() {
  const rows = [];
  const files = walkJsonFiles(COMPONENTS_ROOT);

  for (const filePath of files) {
    const catalog = readCatalog(filePath);
    const elements = Array.isArray(catalog?.elements) ? catalog.elements : [];
    if (!elements.length) {
      continue;
    }

    const instanceElements = elements.filter(
      (element) => element?.type === 'INSTANCE' && typeof element?.componentKey === 'string',
    );

    for (const instance of instanceElements) {
      const instancePath = instance.path;
      const nestedNodes = elements.filter(
        (element) =>
          typeof element?.path === 'string' &&
          element.path.startsWith(`${instancePath} / `) &&
          hasSuspiciousNestedOverride(element),
      );

      if (!nestedNodes.length) {
        continue;
      }

      rows.push({
        file: path.relative(path.resolve(__dirname, '..'), filePath),
        instancePath,
        componentKey: instance.componentKey,
        nestedNodes: nestedNodes.length,
        samplePath: nestedNodes[0].path,
      });
    }
  }

  console.log(`[Apollo] suspicious nested override candidates: ${rows.length}`);
  for (const row of rows.slice(0, 100)) {
    console.log(
      [
        row.file,
        `instance=${row.instancePath}`,
        `componentKey=${row.componentKey}`,
        `nestedNodes=${row.nestedNodes}`,
        `sample=${row.samplePath}`,
      ].join(' | '),
    );
  }

  if (rows.length > 100) {
    console.log(`[Apollo] truncated ${rows.length - 100} additional candidates`);
  }
}

main();
