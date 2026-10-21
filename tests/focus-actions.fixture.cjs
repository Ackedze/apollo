// Invented native scene. No real document, component key, catalog or token payload.
const {fixture}=require("./document-audit.test");
function actionScene(){
 const f=fixture();let seq=0,hold=null;
 f.api.mixed=Symbol('mixed');f.api.root={name:'Invented action test'};f.api.fileKey='invented-file';f.api.base64Encode=bytes=>Buffer.from(bytes).toString('base64');f.api.getStyleByIdAsync=async()=>null;f.api.variables.getVariableByIdAsync=async()=>null;
 const defaults={componentPropertyReferences:{},resolvedVariableModes:{},width:24,height:24,x:0,y:0,opacity:1,fills:[],strokes:[],effects:[]};
 function instance(id,main,parent,opacity=1){const n=f.node(id,'INSTANCE',parent,Object.assign({},defaults,{opacity,componentProperties:{}}));n.main=main;n.getMainComponentAsync=async()=>n.main;n.setProperties=values=>{for(const [key,value]of Object.entries(values))n.componentProperties[key].value=value;};n.swapComponent=next=>{f.writes.push(['swap',n.id,next.id]);n.main=next;n.componentProperties={'Label#new':{type:'TEXT',value:'Default'},'Visible#new':{type:'BOOLEAN',value:true},'Swap#new':{type:'INSTANCE_SWAP',value:'default-key'}};};n.exportAsync=async()=>new Uint8Array([1]);n.remove=()=>{n.removed=true;};return n;}
 const area=f.node('Исходная область','FRAME',f.page,Object.assign({},defaults));
 const old=f.component('old-host',true,'host-key'),latest=f.component('latest-host-key',true,'host-key'),childMain=f.component('child-main',true,'child-key'),ownerMain=f.component('owner-main',true,'owner-key');
 for(const m of [old,latest,childMain,ownerMain])m.componentPropertyDefinitions={};ownerMain.parent={id:'owner-set',type:'COMPONENT_SET',key:'owner-set',componentPropertyDefinitions:{Type:{type:'VARIANT',defaultValue:'Child'}}};
 function tree(id,parent,opacity){const root=instance(id,old,parent);for(const [i,side]of ['Left','Right'].entries()){const frame=f.node(id+'-'+side,'FRAME',root,Object.assign({},defaults));frame.name=side;const owner=instance(id+'-'+side+'-owner',ownerMain,frame);owner.name='Owner';owner.componentProperties={Type:{type:'VARIANT',value:'Child'}};const child=instance(id==='actual'?'Iactual;3541:'+i:id+'-'+side+'-child',childMain,owner,i===0?opacity:1);child.name='Child';}return root;}
 const actual=tree('actual',area,.4);actual.name='Составной компонент';actual.componentProperties={'Label#old':{type:'TEXT',value:'Мой текст'},'Visible#old':{type:'BOOLEAN',value:false},'Swap#old':{type:'INSTANCE_SWAP',value:'invented-choice'}};actual.width=123;actual.opacity=.8;
 const peer=instance('peer',old,area);peer.name='Второй экземпляр';
 old.createInstance=()=>tree('reference-'+ ++seq,f.page,1);childMain.createInstance=()=>instance('child-reference-'+ ++seq,childMain,f.page);ownerMain.createInstance=()=>instance('owner-reference-'+ ++seq,ownerMain,f.page);
 f.component('latest-child-key',true,'child-key');f.component('latest-owner-key',true,'owner-key');
 const local=f.component('Локальная кнопка',false,'',area);const detached=f.node('Подтверждённый детач','FRAME',area,Object.assign({},defaults,{detachedInfo:{type:'library',componentKey:'invented-library'}}));
 const raw=f.node('Iactual;3541:raw','RECTANGLE',actual,Object.assign({},defaults,{fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:''}));raw.name='Непривязанная заливка';f.theme('base');f.page.setExplicitVariableModeForCollection=(c,mode)=>{f.writes.push(['theme',f.page.id,c.id,mode]);f.page.explicitVariableModes[c.id]=mode;};
 const get=f.api.getNodeByIdAsync;f.api.getNodeByIdAsync=async id=>id.startsWith('Iactual;')?null:get(id);f.api.createPage=()=>{const p={id:'temp-'+ ++seq,type:'PAGE',children:[],appendChild:n=>{n.parent=p;p.children.push(n);},remove:()=>{p.removed=true;}};return p;};
 const normalImport=f.api.importComponentByKeyAsync;f.api.importComponentByKeyAsync=async key=>hold&&key==='host-key'?new Promise(r=>{hold.release=()=>r(latest);}):normalImport(key);
 f.page.selection=[area];return Object.assign(f,{area,actual,peer,latest,raw,local,detached,child:actual.children[0].children[0].children[0],holdImport:()=>{hold={};return hold;},releaseImport:()=>{hold.release();hold=null;}});
}
module.exports={actionScene};
