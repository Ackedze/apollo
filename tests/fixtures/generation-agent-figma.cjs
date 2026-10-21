const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort()):x)).digest('hex');
function fixture(){let serial=0,writes=0;const nodes=new Map(),listeners=new Map();
 class Node{
  constructor(type='FRAME'){this.id='n:'+(++serial);this.type=type;this.name=type;this.children=[];this.parent=null;this.removed=false;this.x=0;this.y=0;this.width=100;this.height=100;this.layoutMode='NONE';this.itemSpacing=0;this.fills=[];this.componentProperties={};this.callbacks=new Map();nodes.set(this.id,this);}
  get relativeTransform(){return [[1,0,this.x],[0,1,this.y]];}
  get absoluteTransform(){return this.relativeTransform;}
  set relativeTransform(v){this.x=v[0][2];this.y=v[1][2];writes++;}
  resize(w,h){this.width=w;this.height=h;writes++;}
  appendChild(child){if(child===this)throw Error('CYCLE');if(child.parent)child.parent.children=child.parent.children.filter(n=>n!==child);child.parent=this;this.children.push(child);writes++;}
  insertChild(index,child){this.appendChild(child);this.children.splice(this.children.indexOf(child),1);this.children.splice(index,0,child);}
  remove(){writes++;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);for(const n of walk(this))n.removed=true;this.parent=null;}
  on(type,cb){this.callbacks.set(type,cb);}
  off(type,cb){if(this.callbacks.get(type)===cb)this.callbacks.delete(type);}
  setProperties(values){for(const [k,v]of Object.entries(values)){if(!this.componentProperties[k])throw Error('UNKNOWN_PROP');this.componentProperties[k].value=v;}writes++;}
  clone(){const copy=new Node(this.type);copy.name=this.name;copy.sourceId=this.sourceId||this.id;copy.key=this.key;copy.componentProperties=structuredClone(this.componentProperties);for(const child of this.children)copy.appendChild(child.clone());return copy;}
  createInstance(){const n=this.clone();n.type='INSTANCE';n.definition=this;return n;}
  exportAsync(){return Promise.resolve(new Uint8Array([137,80,78,71]));}
 }
 const walk=root=>{const all=[root];for(const child of root.children)all.push(...walk(child));return all;};
 const document=new Node('DOCUMENT'),page=new Node('PAGE');document.appendChild(page);const def=new Node('COMPONENT');def.key='component-key';def.componentProperties={'Label#7:4':{type:'TEXT',value:'Label'},Size:{type:'VARIANT',value:'40'},Enabled:{type:'BOOLEAN',value:true}};
 const slot=new Node('SLOT'),placeholder=new Node('FRAME');slot.appendChild(placeholder);def.appendChild(slot);
 const policy={actorPolicy:'new-owned-root-current-page.v1',sourceHash:hash('source'),current:true,isCurrent(){return this.current;},mapping(id){return id==='cc'?{key:def.key,assertInstance:n=>n.type==='INSTANCE'&&n.definition===def,assertDefinition:async n=>{if(n!==def)throw Error('DEFINITION_WRONG');}}:null;},resolvePort:async(n,m,id)=>{if(id==='body'){const actual=n.children.find(x=>x.sourceId===slot.id);return{kind:'slot',node:actual,disposable:actual.children.slice()};}if(id==='label')return{kind:'property',node:n,property:'Label#7:4',type:'TEXT'};if(id==='size')return{kind:'property',node:n,property:'Size',type:'VARIANT',values:['40','56']};if(id==='wrong-slot')return{kind:'slot',node:n.children[0].children[0],disposable:[]};return null;},capture:async()=>({checks:[{id:'coverage',status:'unknown',origin:'tool-observation',message:'Synthetic source coverage only',evidenceHash:null}]})};
 const api={root:document,currentPage:page,fileKey:undefined,viewport:{scrollAndZoomIntoView(){}},createFrame(){const n=new Node();page.appendChild(n);return n;},importComponentByKeyAsync:async()=>def,on(type,cb){listeners.set(type,cb);},off(type,cb){if(listeners.get(type)===cb)listeners.delete(type);},base64Encode:bytes=>Buffer.from(bytes).toString('base64')};
 const identity={runId:'run-1',revision:1,specHash:hash('spec'),contextHash:hash('context'),target:'figma'};
 return{api,policy,identity,nodes,Node,def,slot,hash,walk,writes:()=>writes,event(event){page.callbacks.get('nodechange')?.(event);},pageChange(){listeners.get('currentpagechange')?.();}};
}
module.exports={fixture,hash};
