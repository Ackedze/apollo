const source=require("../../src/generation/agent/figma/source.json");
function addGenericFixture(x){
 const sets=new Map(),styles=new Map(),d=source.genericMapping,partDefs=new Map();let styleHook=null;
 const oldCreate=x.Node.prototype.createInstance,oldSet=x.Node.prototype.setProperties;
 function set(key,definitions){if(!sets.has(key)){const n=new x.Node('COMPONENT_SET');n.key=key;n.componentPropertyDefinitions=structuredClone(definitions);sets.set(key,n);}return sets.get(key);}
 function text(properties,record){const n=new x.Node('TEXT');n.characters=record.characters||record.sourceCharacters||'';n.componentPropertyReferences=structuredClone(record.refs||record.nativeRefs||{});n.fontName={family:'Alfa Interface Sans',style:'Regular'};n.fontSize=14;n.textStyleId='S:'+(record.selectedContextStyleKey||d.profiles.profiles[0].styleKeys[0]);n.boundVariables=structuredClone(record.boundVariables||{});return n;}
 for(const part of d.profiles.actualPartDefinitions){
  const owner=part.type==='COMPONENT_SET'?set(part.key,part.definitions):null;
  for(const v of part.variants){const n=new x.Node('COMPONENT');n.key=v.key;n.genericDefinition=true;n.variantProperties=structuredClone(v.properties||{});n.componentPropertyDefinitions=structuredClone(part.definitions);n.instanceProperties={};for(const [k,p]of Object.entries(part.definitions))n.instanceProperties[k]={type:p.type,value:v.properties?.[k]??p.defaultValue};for(const t of v.texts||[])n.appendChild(text(n.instanceProperties,t));if(owner)owner.appendChild(n);partDefs.set(v.key,n);}
 }
 for(const choice of source.choices.filter(c=>c.generic)){
  const root=new x.Node('COMPONENT');root.key=choice.key;root.genericDefinition=true;root.variantProperties=structuredClone(choice.properties);root.instanceProperties={};root.componentPropertyDefinitions=structuredClone(choice.definitions);for(const [k,p]of Object.entries(choice.definitions))root.instanceProperties[k]={type:p.type,value:choice.properties[k]??p.defaultValue};if(choice.setKey)set(choice.setKey,choice.definitions).appendChild(root);
  const targets=d.targets.profiles.find(p=>p.choiceId===choice.id).targets,map=new Map([['[]',root]]);
  for(const t of targets.filter(t=>t.sourceTemplatePath.length).sort((a,b)=>a.sourceTemplatePath.length-b.sourceTemplatePath.length)){
   const n=t.runtimeType==='TEXT'?text({},t):new x.Node(t.runtimeType,t.runtimeType==='SLOT'?t.sourceNodeId:undefined);n.componentProperties=structuredClone(t.nativeProperties||{});n.componentPropertyReferences=structuredClone(t.nativeRefs||{});
   if(n.type==='INSTANCE'){
    let definition=partDefs.get(t.requiredMainKey);
    if(!definition){definition=new x.Node('COMPONENT');definition.key=t.requiredMainKey;definition.genericDefinition=true;definition.instanceProperties=structuredClone(n.componentProperties);definition.variantProperties=Object.fromEntries(Object.entries(n.componentProperties).filter(([,v])=>v.type==='VARIANT').map(([k,v])=>[k,v.value]));if(t.requiredSetKey){const definitions={};for(const [k,p]of Object.entries(n.componentProperties))definitions[k]={type:p.type,defaultValue:p.value,variantOptions:p.type==='VARIANT'?['True','False']:undefined};const owner=set(t.requiredSetKey,definitions);owner.appendChild(definition);if(!owner.children.some(c=>c.variantProperties.Negative==='False')){const plus=new x.Node('COMPONENT');plus.genericDefinition=true;plus.key='synthetic-plus-in-pinned-set';plus.variantProperties={Negative:'False'};plus.instanceProperties={Negative:{type:'VARIANT',value:'False'}};const tx=text({}, {characters:'+'});definition.appendChild(text({}, {characters:'−'}));plus.appendChild(tx);owner.appendChild(plus);}}}
    n.definition=definition;
   }
   const parent=map.get(JSON.stringify(t.sourceTemplatePath.slice(0,-1)));n.parent=parent;parent.children[t.sourceTemplatePath.at(-1)]=n;map.set(JSON.stringify(t.sourceTemplatePath),n);
  }
  for(const n of map.values())for(let i=0;i<n.children.length;i++)if(!n.children[i]){const placeholder=new x.Node('FRAME');placeholder.parent=n;n.children[i]=placeholder;}
  if(choice.bodyProperty&&choice.defaultSourceIds?.length){const slot=Array.from(map.values()).find(n=>n.type==='SLOT'&&n.componentPropertyReferences?.slotContentId===choice.bodyProperty);if(!slot)throw Error('Fixture missing declared Slot');for(const id of choice.defaultSourceIds){const payload=new x.Node(choice.defaultType||'FRAME',id);slot.appendChild(payload);}}
  const sourceChoice=d.profiles.choices.find(c=>c.id===choice.id);
  for(const record of sourceChoice?.targets||[])if(record.type==='TEXT'&&root.instanceProperties[record.refs?.characters]?.type==='TEXT'&&!x.walk(root).some(n=>n.type==='TEXT'&&n.componentPropertyReferences?.characters===record.refs.characters)){
   const n=text({},record),visible=record.refs?.visible;n.visible=visible?root.instanceProperties[visible]?.value!==false:true;root.appendChild(n);
  }
  x.defs.set(choice.id,root);partDefs.set(choice.key,root);
 }
 function clone(original){const n=new x.Node(original.type);for(const k of ['name','visible','width','height','fontName','fontSize','fontWeight','textStyleId','characters','boundVariables','componentPropertyReferences','componentProperties','variantProperties','fills','layoutMode','itemSpacing'])if(original[k]!==undefined)n[k]=structuredClone(original[k]);n.definition=original.definition;for(const c of original.children)n.appendChild(clone(c));return n;}
 x.Node.prototype.createInstance=function(){if(!this.genericDefinition)return oldCreate.call(this);const n=clone(this);n.type='INSTANCE';n.definition=this;n.componentProperties=structuredClone(this.instanceProperties);return n;};
 x.Node.prototype.setProperties=function(values){
  if(!this.definition?.genericDefinition)return oldSet.call(this,values);
  const defs=this.definition.parent?.type==='COMPONENT_SET'?this.definition.parent.componentPropertyDefinitions:this.definition.componentPropertyDefinitions;
  for(const [k,v]of Object.entries(values)){if(!this.componentProperties[k])throw Error('UNKNOWN_PROP');this.componentProperties[k].value=v;if(defs[k]?.type==='VARIANT'){
   const desired=Object.assign({},this.definition.variantProperties,{[k]:v}),next=this.definition.parent.children.find(n=>Object.entries(desired).every(([p,w])=>n.variantProperties[p]===w));if(!next)throw Error('UNKNOWN_VARIANT');
   const prior=this.children[0];for(const child of this.children)child.remove();this.children=[];this.definition=next;this.variantProperties=structuredClone(desired);for(const child of next.children){const tx=clone(child);if(prior){tx.fontName=prior.fontName;tx.textStyleId=prior.textStyleId;tx.boundVariables=prior.boundVariables;tx.fills=prior.fills;}this.appendChild(tx);}
  }
  for(const n of x.walk(this)){if(n.componentPropertyReferences?.visible===k)n.visible=v;if(n.type==='TEXT'&&n.componentPropertyReferences?.characters===k)n.characters=v;}
  }
 };
 for(const key of d.profiles.profiles.flatMap(p=>p.styleKeys).concat(d.typed.bindings.filter(b=>b.actuation==='library-text-style').flatMap(b=>b.writeDomain.enum)))styles.set('S:'+key,{id:'S:'+key,key,type:'TEXT',fontName:{family:'Alfa Interface Sans',style:'Regular'}});
 x.Node.prototype.getStyledTextSegments=function(){return this.characters.length?[{start:0,end:this.characters.length,textStyleId:this.textStyleId,fontName:this.fontName}]:[];};
 x.Node.prototype.setTextStyleIdAsync=async function(id){if(styleHook)await styleHook(this,id);this.textStyleId=id;this.fontName=styles.get(id).fontName;};
 x.api.importStyleByKeyAsync=async key=>styles.get('S:'+key);x.api.getStyleByIdAsync=async id=>styles.get(id);
 return{styles,setStyleHook:hook=>{styleHook=hook;}};
}
module.exports={addGenericFixture};
