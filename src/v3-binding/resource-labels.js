const {resourceKey,resourceId}=require("../resource-identity");
function fieldKind(path) {
  if (/^(textBindingIdentityV1\.fill|paintBindingsV1\.(fill|stroke)|variable\.bindings)(\.|$)/.test(path)) return 'token';
  if (/^(textBindingIdentityV1\.style|selectedTextBindingV1|textStyleBindingsV1)(\.|$)/.test(path)) return 'style';
  if (/(^|\.)(tokenId|tokenIds|variableId)$/.test(path)) return 'token';
  if (/(^|\.)(styleId|styleKey|styleKeys|fillStyleId|strokeStyleId|effectStyleId|textStyleId)$/.test(path)) return 'style';
  return null;
}
function exactKey(kind,raw) {
  if (typeof raw!=='string'||raw.length>300||/[\s\u0000-\u001f\u007f]/.test(raw))return null;
  return resourceKey(kind,raw);
}
function collectReferences(report) {
  const refs=new Map();let visited=0,truncated=false;
  function add(kind,raw){
    if(typeof raw!=='string'||!raw||raw.length>300)return;
    const id=resourceId(kind,raw),identity=kind+':'+id;
    if(refs.has(identity))return;
    if(refs.size>=256){truncated=true;return;}
    refs.set(identity,{kind,id});
  }
  function visit(value,path='',depth=0){
    if(++visited>50000||depth>32){truncated=true;return;}
    if(typeof value==='string'){
      const kind=fieldKind(path)||(value.startsWith('VariableID:')?'token':value.startsWith('S:')?'style':null);
      if(kind)add(kind,value);return;
    }
    if(Array.isArray(value)){for(const v of value)visit(v,path,depth+1);return;}
    if(!value||typeof value!=='object')return;
    const fact=(value.factPaths||[]).find(p=>typeof p==='string'&&!p.startsWith('baseline.effective.')&&fieldKind(p));
    if(fact){visit(value.actual,fact,depth+1);visit(value.expected,fact,depth+1);}
    if(value.type==='VARIABLE_ALIAS'&&fieldKind(path)==='token')add('token',value.id);
    for(const [key,child]of Object.entries(value)){
      if(['styleNames','catalog','sourceHash','compiledHash','collectionKey'].includes(key))continue;
      visit(child,path?path+'.'+key:key,depth+1);
    }
  }
  // Resolve finding evidence before large native baselines consume the bounded scan.
  for(const component of [report,...(report.components || [])]) {
    for(const evaluation of component.result?.engine?.evaluations || []) {
      if(['violation','human-review','allowed'].includes(evaluation.classification))visit(evaluation.trace);
    }
  }
  visit(report);return{references:Array.from(refs.values()),truncated};
}
module.exports={fieldKind,exactKey,collectReferences};
