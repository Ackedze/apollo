// Invented scene and author norms; never a real Figma document or catalog.
const {actionScene}=require("./focus-actions.fixture.cjs"),authored=require("./authoring-fixtures");
function postactionScene(){
 const f=actionScene();for(const n of f.nodes.values())if(n.type!=='PAGE'){n.explicitVariableModes={};n.resolvedVariableModes=Object.assign({},n.resolvedVariableModes);}
 const source=JSON.parse(JSON.stringify(authored.source()).replace(/test-key/g,'host-key'));
 f.actual.children=[];f.actual.name='Составной компонент';
 // Independent authored constraint: every host fill must equal the declared paint.
 source.manual.rules.push({id:'invented.host.fill',targetId:'root',targetScope:'self',capability:'appearance.fill',permission:'constrained',controlPaths:[],constraints:[{type:'propertyDomain',fact:'appearance.fill',values:[[{type:'SOLID',color:{r:0,g:0,b:255},opacity:1,visible:true}]]}],applicability:{variants:'all',modes:'all',platforms:['desktop']},rationale:'Invented blue host fill.',status:'reviewed',execution:{route:'predicate'},owner:'test-author'});
 f.actual.fills=[{type:'SOLID',color:{r:1,g:0,b:0},opacity:1,visible:true}];f.peer.fills=[{type:'SOLID',color:{r:1,g:0,b:0},opacity:1,visible:true}];
 const old=f.actual.main,create=old.createInstance;
 old.createInstance=()=>{const n=create();n.children=[];n.fills=[{type:'SOLID',color:{r:0,g:0,b:1},opacity:1,visible:true}];return n;};
 f.latest.createInstance=()=>{const n=old.createInstance();n.main=f.latest;return n;};
 const swap=f.actual.swapComponent;f.actual.swapComponent=next=>{swap(next);f.actual.fills=[{type:'SOLID',color:{r:0,g:0,b:1},opacity:1,visible:true}];f.actual.fillStyleId='invented-blue';f.raw.fills=[];f.child.opacity=1;};
 f.api.getStyleByIdAsync=async id=>id==='invented-blue'?{id,type:'PAINT',name:'Invented blue',key:'invented-style',remote:true,paints:[{type:'SOLID',color:{r:0,g:0,b:1}}]}:null;
 return Object.assign(f,{source});
}
module.exports={postactionScene};
