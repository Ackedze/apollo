// Invented Auto Layout hierarchy; outside content is never original authority.
function surround(f,{count=80,onRead=()=>{}}={}){
 const outer=f.node('invented-outside-layout','FRAME',f.page,{visible:true,layoutMode:'VERTICAL',x:0,y:0,width:1200,height:1000,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[],opacity:1});
 f.page.children=f.page.children.filter(n=>n!==f.area);f.area.parent=outer;outer.children.push(f.area);
 for(let i=0;i<count;i++){
  const n=f.node('invented-outside-child-'+i,'RECTANGLE',outer,{visible:true,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[]});
  Object.defineProperty(n,'opacity',{get(){onRead(n.id);return 1;}});
 }
 return outer;
}
module.exports={surround};
function project(f){
 f.area.type='INSTANCE';f.area.main=f.component('latest-shell-key',true,'shell-key');f.area.getMainComponentAsync=async()=>f.area.main;f.area.componentProperties={};
 const defaults={visible:true,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[],opacity:1};
 const slot=f.node('invented-native-slot','SLOT',f.area,defaults),content=f.node('invented-projected-content','FRAME',slot,Object.assign({},defaults,{layoutMode:'VERTICAL'}));
 f.area.children=f.area.children.filter(n=>n!==f.actual&&n!==f.peer);for(const n of [f.actual,f.peer]){n.parent=content;content.children.push(n);}
 return{slot,content};
}
module.exports.project=project;
