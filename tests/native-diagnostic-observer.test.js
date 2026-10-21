const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path'),vm=require('node:vm');
const moduleObject={exports:{}};
vm.runInNewContext(esbuild.buildSync({entryPoints:[path.join(__dirname,"../src/generation/native/observer.ts")],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text,{module:moduleObject,exports:moduleObject.exports});
const {createCurrentPageDiagnosticObserver}=moduleObject.exports;
function setup(){
 const calls=[],listeners=new Map();let invalidations=0;
 function page(id){const handlers=new Set();return{id,removed:false,on(type,fn){assert.equal(type,'nodechange');calls.push('on:'+id);handlers.add(fn);},off(type,fn){assert.equal(type,'nodechange');assert.ok(handlers.has(fn));calls.push('off:'+id);handlers.delete(fn);},emit(event){for(const fn of handlers)fn(event);},handlers};}
 const a=page('synthetic-page-a'),b=page('synthetic-page-b');
 const api={currentPage:a,on(type,fn){assert.ok(['currentpagechange','close'].includes(type));listeners.set(type,fn);},off(type,fn){assert.equal(listeners.get(type),fn);listeners.delete(type);},loadAllPagesAsync(){throw Error('NO_PAGE_LOAD');},root:new Proxy({},{get(){throw Error('NO_PAGE_ENUMERATION');}})};
 const reader=createCurrentPageDiagnosticObserver(api,()=>invalidations++);
 return{reader,api,a,b,calls,listeners,get invalidations(){return invalidations;}};
}
test('current-page CREATE/DELETE/property events invalidate without loading/enumerating/global observer',()=>{
 const s=setup();s.reader.start();s.reader.start();assert.deepEqual(s.calls,['on:synthetic-page-a']);assert.equal(s.reader.snapshot().status,'available');assert.equal(s.reader.snapshot().otherPages,'not-observed');assert.equal(s.reader.snapshot().styles,'not-observed');
 for(const type of ['CREATE','DELETE','PROPERTY_CHANGE'])s.a.emit({nodeChanges:[{type,node:{id:'synthetic-node'}}]});assert.equal(s.invalidations,3);
});
test('page switch detaches exact callback and binds only current page; stale queued callbacks ignored',()=>{
 const s=setup();s.reader.start();const old=Array.from(s.a.handlers)[0];s.api.currentPage=s.b;assert.equal(s.reader.snapshot().status,'unknown');s.listeners.get('currentpagechange')();assert.equal(s.invalidations,1);assert.deepEqual(s.calls,['on:synthetic-page-a','off:synthetic-page-a','on:synthetic-page-b']);assert.equal(s.a.handlers.size,0);assert.equal(s.reader.snapshot().pageId,s.b.id);old({nodeChanges:[]});assert.equal(s.invalidations,1);s.b.emit({nodeChanges:[]});assert.equal(s.invalidations,2);s.listeners.get('close')();assert.equal(s.b.handlers.size,0);assert.equal(s.reader.snapshot().status,'unknown');assert.equal(s.listeners.size,0);
});
test('registration failures and removed current page remain unknown, never trigger fallback loads',()=>{
 for(const mutate of [s=>s.a.on=()=>{throw Error('unsupported');},s=>s.api.on=()=>{throw Error('unavailable');},s=>s.a.removed=true]){const s=setup();mutate(s);s.reader.start();assert.equal(s.reader.snapshot().status,'unknown');s.reader.stop();}
});
test('failed old-page detach stays explicitly unknown and old callbacks cannot invalidate current report',()=>{
 const s=setup();s.reader.start();const old=Array.from(s.a.handlers)[0];s.a.off=()=>{throw Error('detach-failed');};s.api.currentPage=s.b;s.listeners.get('currentpagechange')();assert.equal(s.reader.snapshot().status,'unknown');assert.equal(s.reader.snapshot().cleanup,'unknown');old({nodeChanges:[]});assert.equal(s.invalidations,1);s.b.emit({nodeChanges:[]});assert.equal(s.invalidations,2);s.reader.stop();
});
