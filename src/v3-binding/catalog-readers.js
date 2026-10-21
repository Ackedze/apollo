const pins=require("./provider-pins");
function createCatalogReaders(port,api,hash){
 let names=null,catalog=null,catalogs=null,initialization=null,catalogError='CATALOG_UNAVAILABLE';
 function validInventory(value){return hash(value)===pins.catalog&&value.protocolVersion==='apollo.style-token-read.v1'&&/^[a-f0-9]{64}$/.test(value.snapshotId)&&/^[a-f0-9]{64}$/.test(value.readerCodeSha256)&&value.authority?.bindingPermission===false&&Array.isArray(value.sources)&&value.sources.length===32&&value.sources.every(s=>s.availability==='available'&&['tokens','styles'].includes(s.kind)&&/^[a-f0-9]{64}$/.test(s.sha256));}
 function initialize(){
  if(!initialization){const deadline=Date.now()+10000;initialization=Promise.all([
   (async()=>{try{const value=await port.read('names',null);if(hash(value)===pins.names)names=value;}catch(_){}})(),
   (async()=>{try{
    const inventory=await port.read('inventory',null);if(!validInventory(inventory))throw Error('CATALOG_PIN_CHANGED');
    const request={protocolVersion:inventory.protocolVersion,snapshotId:inventory.snapshotId,contentVersion:inventory.knowledge.contentVersion,sourceIds:inventory.sources.map(s=>s.id)};
    const response=await port.read('catalogs',request,Math.max(1,deadline-Date.now()));
    if(Object.keys(response).sort().join(',')!=='bindingPermission,catalogs,freshness,knowledge,protocolVersion,readerCodeSha256,snapshotId'||response.protocolVersion!==inventory.protocolVersion||response.snapshotId!==inventory.snapshotId||response.readerCodeSha256!==inventory.readerCodeSha256||hash(response.knowledge)!==hash(inventory.knowledge)||response.freshness?.state!=='pinned-inputs-current'||response.freshness.nativeFreshness!=='unverified'||response.bindingPermission!==false||!Array.isArray(response.catalogs)||response.catalogs.length!==inventory.sources.length)throw Error('CATALOG_PIN_CHANGED');
    const tokens=[],styles=[];
    for(let i=0;i<inventory.sources.length;i++){
     const source=inventory.sources[i],row=response.catalogs[i];
     if(Object.keys(row).sort().join(',')!=='catalog,kind,loaderMeta,provenance,sourceCanonicalSha256,sourceId,sourceSha256'||row.sourceId!==source.id||row.kind!==source.kind||row.sourceSha256!==source.sha256||hash(row.provenance)!==hash(source.provenance)||row.sourceCanonicalSha256!==pins.catalogSources?.[source.id]||hash(row.catalog)!==row.sourceCanonicalSha256||!row.loaderMeta||typeof row.loaderMeta!=='object'||Array.isArray(row.loaderMeta)||hash(row.loaderMeta)!==pins.catalogLoaderMeta?.[source.id])throw Error('CATALOG_PIN_CHANGED');
     if(row.kind==='tokens'){if(!Array.isArray(row.catalog.collections)||hash(row.loaderMeta)!==hash(row.catalog.meta))throw Error('CATALOG_PIN_CHANGED');tokens.push({meta:row.loaderMeta,collections:row.catalog.collections});}
     else {if(!Array.isArray(row.catalog.styles)||typeof row.loaderMeta.fileName!=='string'||typeof row.loaderMeta.library!=='string')throw Error('CATALOG_PIN_CHANGED');styles.push({meta:row.loaderMeta,styles:row.catalog.styles});}
    }
    catalog=inventory;catalogs={tokens,styles,sourceIdentity:inventory.snapshotId};
   }catch(error){catalogError=error.message==='CATALOG_TIMEOUT'?'CATALOG_TIMEOUT':'CATALOG_UNAVAILABLE';}})(),
  ]).finally(()=>{if(!catalogs)initialization=null;});}
  return initialization;
 }
 async function resolveNames(refs,budgetMs){
  if(!names)return null;
  const resources=refs.map(r=>({kind:r.kind==='token'?'variable':'style',reference:r.key}));
  const request={protocolVersion:names.protocolVersion,indexId:names.indexId,contentVersion:names.contentVersion,resources};
  try{
   const response=await port.read('resolve',request,budgetMs);
   if(response.protocolVersion!==names.protocolVersion||response.indexId!==names.indexId||response.resolverCodeSha256!==names.resolverCodeSha256||response.contentVersion!==names.contentVersion||hash(response.knowledge)!==hash(names.knowledge)||response.freshness?.state!=='pinned-inputs-current'||!Array.isArray(response.resources)||response.resources.length!==resources.length)return null;
   const states=[];
   for(let i=0;i<resources.length;i++){
    const row=response.resources[i],ref=resources[i];
    if(row.kind!==ref.kind||row.reference!==ref.reference||row.stableKey!==ref.reference||!['resolved','ambiguous','unavailable','not-packaged'].includes(row.state))return null;
    if(row.state==='resolved'){
     if(typeof row.name!=='string'||!row.name.trim()||row.name.length>500||!Array.isArray(row.occurrences)||!row.occurrences.length)return null;
     for(const occurrence of row.occurrences){const source=names.sources.find(s=>s.id===occurrence.sourceId);if(!source||source.availability!=='available'||source.sha256!==occurrence.sourceRawSha256||pins.catalogSources?.[source.id]!==occurrence.sourceCanonicalSha256||occurrence.name!==row.name||!/^[a-f0-9]{64}$/.test(occurrence.sourceRecordSha256))return null;}
    }
    states.push({kind:refs[i].kind,key:ref.reference,state:row.state,name:row.state==='resolved'?row.name:null,collectionName:row.collection?.name||null,sourcePins:row.occurrences.map(o=>({sourceId:o.sourceId,sha256:o.sourceRawSha256,recordSha256:o.sourceRecordSha256}))});
   }
   return{resources:states,contentVersion:names.contentVersion};
  }catch(_){return null;}
 }
 async function readCatalogs(context,guard){await initialize();guard();if(!catalogs)throw Error(catalogError);return catalogs;}
 async function verifyCatalog(sourceIdentity,guard){
  if(!catalog||catalog.snapshotId!==sourceIdentity)throw Error('CATALOG_PIN_CHANGED');
  const value=await port.read('inventory',null);guard();if(!validInventory(value)||value.snapshotId!==sourceIdentity)throw Error('CATALOG_PIN_CHANGED');
 }
 function resolveModeNames(keys){
  if(!catalogs||!Array.isArray(keys))return [];
  const requested=new Set(keys.filter(key=>typeof key==='string'&&/^[a-f0-9]{40}$/.test(key)).slice(0,128));
  return catalogs.tokens.flatMap(catalog=>catalog.collections.filter(collection=>requested.has(collection.key))
   .map(collection=>({key:collection.key,name:collection.name,modes:collection.modes,origin:'catalog-export'})));
 }
 return{initialize,resolveNames,resolveModeNames,readCatalogs,verifyCatalog};
}
module.exports={createCatalogReaders};
