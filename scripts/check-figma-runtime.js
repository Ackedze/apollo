const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const filesToCheck = [
  path.join(rootDir, 'src', 'code.ts'),
  path.join(rootDir, 'dist', 'code.js'),
];

const failures = [];

for (const filePath of filesToCheck) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${relative(filePath)}: file does not exist. Run npm run build first.`);
    continue;
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );

  visit(sourceFile, sourceFile);
}

if (failures.length > 0) {
  console.error('[Apollo] Figma runtime compatibility check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[Apollo] Figma runtime compatibility check passed');

function visit(node, sourceFile) {
  if (node.kind === ts.SyntaxKind.SpreadAssignment) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    failures.push(
      `${relative(sourceFile.fileName)}:${position.line + 1}:${position.character + 1} object spread is not allowed in Figma main runtime code`,
    );
  }

  ts.forEachChild(node, (child) => visit(child, sourceFile));
}

function relative(filePath) {
  return path.relative(rootDir, filePath);
}
