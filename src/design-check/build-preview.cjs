const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function buildPreview(destination) {
  if (!destination) throw new Error('Provide an explicit output directory outside the shared v4 dist.');
  const output = path.resolve(destination), sharedDist = path.resolve(__dirname, "../../dist");
  if (output === sharedDist || output.startsWith(sharedDist + path.sep)) throw new Error('Shared v4 dist is owned by the integration writer.');
  fs.mkdirSync(output, { recursive: true });
  const result = await esbuild.build({ absWorkingDir: __dirname, entryPoints: ['index.tsx'], outfile: path.join(output, 'shell.js'),
    bundle: true, platform: 'browser', format: 'iife', globalName: 'ApolloDesignCheck', target: ['es2022'],
    loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, write: false });
  const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  const boot = `const preferences = {load: async () => JSON.parse(localStorage.getItem('apollo-design-check-preview') || 'null'), save: async value => localStorage.setItem('apollo-design-check-preview', JSON.stringify(value))};
window.designCheckController = ApolloDesignCheck.createDesignCheckController({tabs: ApolloDesignCheck.tabDefinitions, preferences});
window.designCheckView = ApolloDesignCheck.mountDesignCheck(document.getElementById('app'), window.designCheckController);
void window.designCheckController.restorePreferences();`;
  fs.writeFileSync(path.join(output, 'preview.html'), '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Apollo · Design Check UI preview</title><style>' + css + '</style></head><body><div id="app"></div><script>' + js.replace(/<\/script/gi, '<\\/script') + '</script><script>' + boot + '</script></body></html>');
  fs.writeFileSync(path.join(output, 'build-inputs.json'), JSON.stringify({ scope: 'isolated-ui-preview-only', inputs: Object.keys(result.metafile.inputs).sort() }, null, 2) + '\n');
  return { output, bytes: result.outputFiles.reduce((total, file) => total + file.contents.length, 0), inputCount: Object.keys(result.metafile.inputs).length };
}
module.exports = { buildPreview };
if (require.main === module) buildPreview(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
