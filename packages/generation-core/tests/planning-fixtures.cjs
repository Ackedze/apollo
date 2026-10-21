// Synthetic producer/context only. No production manuals, keys or catalogs.
const crypto = require('node:crypto');
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const pin = componentId => ({ componentId, contractId: componentId+'-contract', revision:1, manualSourceHash:hash(componentId+'-manual'),compiledHash:hash(componentId+'-compiled') });
  const a = pin('synthetic-content'), b = pin('synthetic-group');
  const representations = (name,key) => [{id:name+'-figma',kind:'figma',status:'verified',platform:'desktop',locator:{componentKey:key}},
    {id:name+'-code',kind:'code',status:'verified',platform:'desktop',locator:{}}];
  const api = (id,type,path) => ({id,kind:type==='content'?'slot':'state',valueType:type,bindings:[{representationId:'group-code',path:'props.'+path},{representationId:'group-figma',path:id}]});
  const lock = {schemaVersion:'apollo.generation-package-lock.v1-experimental',runtime:{coreVersion:'synthetic',profileVersion:'synthetic',runtimeSha256:hash('runtime'),buildInputsSha256:hash('inputs')},
    packages:[a,b].map(p => Object.assign({archive:p.componentId+'.zip',archiveSha256:hash('archive'),factsHash:hash('facts'),sourceHash:hash('source'),sourceExportVersion:'synthetic',projectionEvidence:[],dependencies:[]},p))};
  const view = {schemaVersion:'apollo.generation-view.v1-experimental',lock,lockHash:hash(lock),components:[
    {pin:a,sourceStatus:'ready',sourceErrors:0,api:[{id:'Body',kind:'slot',valueType:'content',bindings:[{representationId:'content-code',path:'props.children'},{representationId:'content-figma',path:'Body',targetId:'body'}]}],representations:representations('content','synthetic-content-key'),targets:['body'],dependencies:[],coverage:{predicateRuleIds:['content.rule'],pendingRoutes:[],nonExecutableRuleIds:[]}},
    {pin:b,sourceStatus:'ready',sourceErrors:0,api:[api('primaryFirst','boolean','primaryFirst'),api('elements','content','elements')],representations:representations('group','synthetic-group-key'),targets:[],dependencies:[],coverage:{predicateRuleIds:['group.rule'],pendingRoutes:[],nonExecutableRuleIds:[]}}
  ]};
  const files = {'package.json':hash('package'),'src/corporate-content/index.ts':hash('content-index'),'src/corporate-content/component.tsx':hash('content-api'),'src/button-group/index.ts':hash('group-index'),'src/button-group/typings.ts':hash('group-api'),'tools/build/copy-package-json.mjs':hash('public-export-recipe')};
  const registry = {schemaVersion:'apollo.generation-registry-port.v1-experimental',producer:{name:'code-connect',revision:'synthetic-r1',status:'verified'},
    package:{name:'arui-private',version:'0.0.0-synthetic',commit:'a'.repeat(40),files,implementationDependencies:[{name:'synthetic-internal-button',version:'1'}]},entries:[
      {id:'content',status:'verified',pin:clone(a),platform:'desktop',code:{module:'arui-private/corporate-content',exportName:'CorporateContent',representationId:'content-code',indexFile:'src/corporate-content/index.ts'},figma:{componentKey:'synthetic-content-key',representationId:'content-figma',handlerId:'content-native'},evidenceFiles:['src/corporate-content/index.ts','src/corporate-content/component.tsx'],props:{},slots:{Body:{min:1,max:1,codeProp:'children',figma:{targetId:'body',property:'Body'}}}},
      {id:'group',status:'verified',pin:clone(b),platform:'desktop',code:{module:'arui-private/button-group',exportName:'ButtonGroup',representationId:'group-code',indexFile:'src/button-group/index.ts'},figma:{componentKey:'synthetic-group-key',representationId:'group-figma',handlerId:'group-native'},evidenceFiles:['src/button-group/index.ts','src/button-group/typings.ts'],props:{primaryFirst:{type:'boolean',code:{prop:'primaryFirst',transform:{kind:'identity'}},figma:{property:'primaryFirst',type:'VARIANT',transform:{kind:'lookup',values:[{input:true,output:'True'},{input:false,output:'False'}]}}}},slots:{},actions:{port:'elements',min:2,max:2,codeProp:'elements',fields:{label:'children',event:'onClick'},figmaHandlerId:'synthetic-owned-actions'}}
    ]};
  const code = {package:clone(registry.package),publicExports:registry.entries.map(e => ({module:e.code.module,exportName:e.code.exportName,indexFile:e.code.indexFile}))};
  const spec = {schemaVersion:'apollo.screen-spec.v1-experimental',id:'synthetic-desktop',platform:'desktop',viewport:{width:1600,height:900},root:'content',nodes:[
    {kind:'component',id:'content',mappingId:'content',props:{},slots:{Body:['group']}},
    {kind:'component',id:'group',mappingId:'group',props:{primaryFirst:{state:{ready:true,changed:false}}},slots:{},actions:{port:'elements',items:[{id:'first-action',label:'Synthetic action A',eventId:'first'},{id:'second-action',label:'Synthetic action B',eventId:'second'}]}}
  ],states:{initial:'ready',values:['ready','changed']},events:[{id:'first'},{id:'second'}],transitions:[{eventId:'first',from:'ready',to:'changed'},{eventId:'second',from:'changed',to:'ready'}],unresolved:[]};
  return {spec,context:{view,registry,code}};
}
module.exports = {hash,clone,fixture};
