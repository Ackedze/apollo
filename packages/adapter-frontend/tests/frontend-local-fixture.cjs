// Synthetic norms/profile only. Actual arui-private source/toolchain is read-only.
const fs=require('node:fs'),path=require('node:path');
const {fixture,hash,clone}=require('../../generation-core/tests/planning-fixtures.cjs');
const {sha}=require('../host/frontend-toolchain.cjs');
function localFixture(repo,{overflow=false,width=640,equalLabels=false}={}){
 const f=fixture(),base=JSON.parse(fs.readFileSync(path.join(repo,'tools/code-connect/reports/NEXT-05-source-build.2026-10-05.json')));
 const files=Object.fromEntries(base.source.originalFiles.map(r=>[r.path,r.sha256]));
 for(const pkg of [f.context.registry.package,f.context.code.package])Object.assign(pkg,{version:base.source.version,commit:base.source.commit,files});
 const m=f.context.registry.entries[1],node=f.spec.nodes[1];delete node.props.primaryFirst;
 m.props.size={type:'string',values:['56'],code:{prop:'size',transform:{kind:'lookup',values:[{input:'56',output:56}]}},figma:{property:'Size',type:'VARIANT',transform:{kind:'identity'}}};node.props.size='56';
 f.context.view.components[1].api.push({id:'size',kind:'state',valueType:'enum',domain:['56'],bindings:[{representationId:'group-code',path:'props.size'},{representationId:'group-figma',path:'Size'}]});
 Object.assign(m.actions.fields,{disabled:'disabled',priorityProp:'primaryFirst'});m.actions.min=1;m.actions.max=4;
 f.context.registry.entries[0].evidenceFiles=['src/corporate-content/index.ts','src/corporate-content/corporate-content.tsx'];
 node.actions.items=[{id:'send',label:equalLabels?'Действие':'Начать',eventId:'first',view:'primary',disabled:false},{id:'cancel',label:equalLabels?'Действие':'Отмена',eventId:'second',view:'secondary',disabled:{state:{ready:false,changed:true}}}];
 if(overflow)node.actions.items.push({id:'approve',label:equalLabels?'Действие':'Подтвердить',eventId:'second',view:'secondary',disabled:false},{id:'defer',label:equalLabels?'Действие':'Отложить',eventId:'second',view:'secondary',disabled:true});
 const commands=`import type {Invocation} from './recipe';\ntype Bank=Readonly<Record<string,(i:Invocation)=>void>>;\nconst refs=${JSON.stringify(node.actions.items.map(a=>'synthetic-'+a.id))};\nexport function createCommandBank():Bank {return Object.fromEntries(refs.map(ref=>[ref,()=>{}]));}\nexport function createProbeCommandBank(record:(ref:string,i:Invocation)=>void):Bank {return Object.fromEntries(refs.map(ref=>[ref,(i:Invocation)=>record(ref,i)]));}\n`;
 function profile(plan,context){return {version:1,profileId:overflow?'desktop-size56.opt-in-overflow-commands.v1':'desktop-size56.baseline-no-overflow.v1',mode:overflow?'opt-in-auto-overflow-commands':'baseline-no-overflow',authority:{status:'accepted',scope:'synthetic-local',planHash:hash(plan),contextHash:hash(context),evidenceHash:hash('synthetic acceptance only')},presentation:{version:1,id:'synthetic-Alfa-Interface-Sans',fontFamily:'Alfa Interface Sans',evidenceHash:hash('synthetic presentation only')},inlineSize:width,actions:node.actions.items.map(a=>({id:a.id,label:a.label,eventId:a.eventId,commandRef:'synthetic-'+a.id,view:a.view})),commandModule:{path:'commands.ts',sha256:sha(commands),invocationVersion:1,probeVersion:1,eventPolicy:'event-optional-business-command'}};}
 return {spec:f.spec,context:f.context,profile,commands,hash,clone};
}
module.exports={localFixture};
