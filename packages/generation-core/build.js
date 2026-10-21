const esbuild = require('esbuild');
const path = require('node:path');
Promise.all([
  esbuild.build({absWorkingDir:__dirname,entryPoints:['src/index.ts'],outfile:path.join(__dirname,'dist/index.cjs'),bundle:true,platform:'node',format:'cjs',target:['node22']}),
  esbuild.build({absWorkingDir:__dirname,entryPoints:['src/planning/index.ts'],outfile:path.join(__dirname,'dist/planning.cjs'),bundle:true,platform:'browser',format:'cjs',target:['es2017'],supported:{'object-rest-spread':false}})
]).then(()=>console.log('Apollo generation loader and portable planning built.')).catch(error=>{console.error(error.message);process.exitCode=1;});
