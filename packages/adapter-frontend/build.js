const esbuild=require('esbuild');
const path=require('node:path');
esbuild.build({absWorkingDir:__dirname,entryPoints:['src/index.ts'],outfile:path.join(__dirname,'dist/index.cjs'),bundle:true,platform:'browser',format:'cjs',target:['es2017'],supported:{'object-rest-spread':false}}).then(()=>console.log('Generation adapter built.')).catch(error=>{console.error(error.message);process.exitCode=1;});
