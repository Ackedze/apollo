// Read-only approved package inputs; the scene stays invented and catalogs are never copied into fixtures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function provider(){
 const root=process.env.V3_BIND_PROVIDER_ROOT,packageRoot=process.env.V3_BIND_PACKAGE_ROOT,manifestSha=process.env.V3_BIND_MANIFEST_SHA;
 if(!root||!packageRoot||!manifestSha)throw Error('Explicit reviewed V3 binding provider/package/manifest pins required');
 const bytes=fs.readFileSync(path.join(packageRoot,'manifest.json'));if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifestSha)throw Error('Reviewed package manifest changed');
 const {createCatalogProvider}=require(path.join(root,'src/style-token-catalog/service')),p=createCatalogProvider({designSystemRoot:path.join(packageRoot,'data/design-system_ab'),knowledgeRelease:JSON.parse(bytes)})();
 const inventory=p.snapshot.inventory(),names=p.display.inventory();
 const read=async(op,request)=>op==='names'?names:op==='resolve'?p.display.query(request):op==='inventory'?inventory:op==='catalogs'?p.catalogs(request):(()=>{throw Error('Unexpected operation');})();
 const documents=Array.from(p.snapshot.rawCatalogs.entries()).map(([id,catalog])=>({id,catalog}));
 let record,value,modeId;
 for(const {id,catalog} of documents)for(const collection of catalog.collections||[])for(const v of collection.variables){if(record||v.resolvedType!=='COLOR'||v.hiddenFromPublishing||!(v.scopes?.length===0||v.scopes?.some(s=>['ALL_SCOPES','FRAME_FILL','SHAPE_FILL'].includes(s))))continue;for(const [mode,values]of Object.entries(v.actualValuesByMode||{}))for(const color of values){if(record||typeof color.r!=='number'||color.a<=0||color.a>=1)continue;record={key:v.key,name:v.groupName&&v.groupName!=='Без группы'?v.groupName+'/'+(v.tokenName||v.name):v.tokenName||v.name,collectionKey:collection.key,collectionName:collection.name,modes:collection.modes,defaultModeId:collection.defaultModeId,sourceId:id};value=color;modeId=mode;}}
 if(!record)throw Error('Expected published semi-transparent COLOR fixture source');
 return{read,inventory,names,record,value,modeId,provider:p,documents};
}
module.exports={provider};
