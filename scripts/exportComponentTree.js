const fs = require('fs');
const path = require('path');

const referenceDir = path.resolve(__dirname, '../src/reference');

function collectComponents() {
  const files = fs
    .readdirSync(referenceDir)
    .filter((file) => file.endsWith('.json'));

  const tree = [];

  for (const file of files) {
    const fullPath = path.join(referenceDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (err) {
      console.warn(`[tree] failed to parse ${file}:`, err);
      continue;
    }

    if (!data || !Array.isArray(data.components)) continue;

    for (const component of data.components) {
      tree.push({
        name: component.name,
        key: component.key ?? null,
      });
    }
  }

  return tree;
}

const tree = collectComponents();
const outputPath = path.resolve(__dirname, '../dist/componentTree.json');
fs.writeFileSync(outputPath, JSON.stringify(tree, null, 2));
console.log(`Component tree saved to ${outputPath}`);
