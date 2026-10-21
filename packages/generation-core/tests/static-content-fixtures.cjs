// Synthetic product/context only. No user reports, private native IDs or manuals.
const {fixture:legacyFixture,hash,clone}=require('./planning-fixtures.cjs');
function staticFixture(){
 const f=legacyFixture(),content='arui-private.corporate-content.desktop',group='arui-private.buttons-group.desktop';
 f.context.registry.entries[0].id=content;f.context.registry.entries[1].id=group;
 f.context.registry.entries[0].slots={body:f.context.registry.entries[0].slots.Body};
 f.context.registry.entries[1].actions.port='button-label';
 f.context.registry.entries[1].props={size:{type:'string',values:['56'],code:{prop:'size',transform:{kind:'lookup',values:[{input:'56',output:56}]}},figma:{property:'Size',type:'VARIANT',transform:{kind:'identity'}}}};
 f.context.view.components[0].api[0].id='body';
 f.context.view.components[1].api[1].id='button-label';
 const spec={schemaVersion:'apollo.screen-spec.static-content.v1-draft',status:'draft',executionAllowed:false,id:'synthetic-static',platform:'desktop',viewport:{width:1600,height:900},root:'content',nodes:[
 {kind:'component',id:'content',mappingId:content,props:{},slots:{body:['group']}},
 {kind:'component',id:'group',mappingId:group,props:{size:'56'},slots:{},staticActions:{port:'button-label',items:[
  {id:'synthetic-secondary',label:'Synthetic identical label',view:'secondary',disabled:true,loading:false},
  {id:'synthetic-primary',label:'Synthetic identical label',view:'primary',disabled:false,loading:false}
 ],displayOrder:['synthetic-secondary','synthetic-primary'],priorityOrder:['synthetic-secondary','synthetic-primary']}}
 ],states:{initial:'default',values:['default']},unresolved:[]};
 return {spec,context:f.context};
}
function filledFacts(g,plan){
 const facts=g.createStaticFactInputDraft(plan,hash,hash('synthetic-build'));
 const width={availableWidth:600,buttonWidths:plan.content.actions.map(a=>({actionId:a.id,width:120})),gap:16,paddingStart:8,paddingEnd:8,measurementHash:hash('synthetic-width'),fontHash:hash('synthetic-font')};
 facts.widths={figma:clone(width),frontend:clone(width)};
 facts.canonical={body:{ownerSourceAddress:'synthetic-owner',property:'synthetic-slot-property',slotSourceAddress:'synthetic-slot'},occurrences:[
 {occurrenceId:'synthetic-occurrence-1',symbolId:'synthetic-symbol',actionId:plan.content.priorityOrder[0],visible:true},
 {occurrenceId:'synthetic-occurrence-2',symbolId:'synthetic-symbol',actionId:plan.content.priorityOrder[1],visible:true},
 {occurrenceId:'synthetic-occurrence-3',symbolId:'synthetic-symbol',actionId:null,visible:false},
 {occurrenceId:'synthetic-occurrence-4',symbolId:'synthetic-symbol',actionId:null,visible:false}],crosswalkHash:hash('synthetic-crosswalk')};
 return facts;
}
module.exports={staticFixture,filledFacts,hash,clone};
