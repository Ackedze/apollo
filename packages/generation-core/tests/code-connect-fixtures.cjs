// Synthetic producer records only; no DS manual, catalog or real identity.
const {fixture,hash,clone}=require('./planning-fixtures.cjs');
function producerFixture(){
 const f=fixture();delete f.spec.nodes[1].props.primaryFirst;
 Object.assign(f.spec.nodes[1].actions.items[0],{view:'primary',disabled:{state:{ready:false,changed:true}}});
 Object.assign(f.spec.nodes[1].actions.items[1],{view:'secondary',disabled:false});
 const raw={schemaVersion:'apollo.arui-private-mappings.v1',registryVersion:'1.0.0',registryDigest:hash('synthetic-producer'),targetProduct:'apollo-v4',
  source:{package:'arui-private',version:f.context.registry.package.version,commit:f.context.registry.package.commit,
   files:Object.entries(f.context.registry.package.files).map(([path,sha256])=>({path,sha256})),internalPackageVersions:{'synthetic-internal':'1'}},
  mappingArtifacts:[{path:'tools/synthetic-mapping.cjs',sha256:hash('mapping')}],availabilityPolicy:{allowedImports:f.context.registry.entries.map(e=>e.code.module)},
  mappings:f.context.registry.entries.map((e,i)=>({id:e.id,kind:i?'buttons-group':'corporate-content',platforms:['desktop'],
   contract:Object.assign({},clone(e.pin),{archivePath:'synthetic/'+f.context.view.lock.packages[i].archive,
    archiveSha256:f.context.view.lock.packages[i].archiveSha256,manualSha256:hash('synthetic-manual-bytes'),dependencyPins:[]}),
   figma:{representationId:e.figma.representationId,componentKey:e.figma.componentKey,bodyProperty:i?undefined:'Body'},
   code:{package:'arui-private',version:f.context.registry.package.version,subpath:e.code.module,export:e.code.exportName,
    source:{index:e.code.indexFile,implementation:e.evidenceFiles[1]},publicExportStatus:'confirmed-build-source',
    proposedRepresentationId:e.code.representationId,representationStatus:'proposed-for-authoring',builtPackageStatus:'not-built-in-checkout',api:[]},
   status:{apiMapping:'confirmed-source-api',fullContractParity:'not-confirmed',liveAcceptance:'not-run-for-NEXT-01',publication:'not-confirmed',release:'not-released'},
   propertyMappings:i?[{from:'direct-label',to:'elements[].children',transform:'string'},
    {from:'disabled',to:'elements[].disabled',transform:'False/True→boolean'},
    {from:'priority',to:'primaryFirst',transform:'Primary→true, Secondary→false'},
    {from:'event',to:'elements[].onClick',transform:'bind-real-handler'}]:[{from:'Body',to:'children',transform:'preserve-ordered-content'}],
   gaps:[{id:'SYNTHETIC-PARITY-GAP',description:'Unaccepted synthetic geometry.',sources:['synthetic']}],evidence:e.evidenceFiles}))};
 const lock={registryVersion:raw.registryVersion,registryDigest:raw.registryDigest,codeVersion:raw.source.version,codeCommit:raw.source.commit,
  contracts:Object.fromEntries(raw.mappings.map(m=>[m.id,m.contract.archiveSha256]))};
 return Object.assign(f,{raw,lock});
}
module.exports={producerFixture};
