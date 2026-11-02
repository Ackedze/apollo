// Native binding diagnostics, derived from v3 auditViewBuilder/customStyleFilters.
// Catalog membership is checked only with a verified packaged policy; never infer detach history.
function plain(value){if(typeof value==='symbol')return 'mixed';if(value===undefined)return null;if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(plain);const out={};for(const key of Object.keys(value))out[key]=plain(value[key]);return out;}
function styleValue(node){const out={};for(const key of ['fills','strokes','effects','fillStyleId','strokeStyleId','effectStyleId','textStyleId','characters','fontName','fontSize','lineHeight','letterSpacing','textCase','textDecoration','openTypeFeatures','boundVariables'])if(key in node)out[key]=plain(node[key]);if(node.type==='TEXT'&&typeof node.getStyledTextSegments==='function')out.segments=node.getStyledTextSegments(['textStyleId','fills','fillStyleId','fontName','fontSize','lineHeight','openTypeFeatures','textCase','textDecoration']).map(s=>{const out={};for(const key of ['start','end','textStyleId','fills','fillStyleId','fontName','fontSize','lineHeight','openTypeFeatures','textCase','textDecoration'])out[key]=plain(s[key]);return out;});return out;}
function variableValue(v){return v?{id:v.id,key:v.key||null,name:v.name,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId}:null;}
function linkedStyleValue(s){return s?{id:s.id,key:s.key||null,name:s.name,type:s.type}:null;}
function technicalPaint(node,paints){
 const target=node.type==='VECTOR'&&node.name==='icon'?'747474':node.type==='RECTANGLE'&&node.name==='BgColor'?'F2F3F5':null;
 if(!target||!Array.isArray(paints))return false;
 const visible=paints.filter(p=>p&&p.visible!==false);
 return visible.length>0&&visible.every(p=>p.type==='SOLID'&&p.color&&['r','g','b'].map(k=>Math.round(Math.max(0,Math.min(1,p.color[k]))*255).toString(16).padStart(2,'0')).join('').toUpperCase()===target);
}
async function describeNativeStyles(api,node,{read,styleCache,variableCache,policy={}}){
 const findings=[],resources=[],gaps=[],resolved=new Set();if(node.type==='SECTION')return{findings,resources,gaps,resolved};
 const linked=async(id,type)=>{
  if(typeof id==='symbol'||id&&typeof id!=='string'){gaps.push('linked-style-incompatible');return null;}
  if(typeof id!=='string'||!id)return false;
  if(!styleCache.has(id))styleCache.set(id,read(()=>api.getStyleByIdAsync(id),{operation:'getStyleByIdAsync',nodeId:node.id,resourceId:id}).then(linkedStyleValue).catch(()=>null));
  const value=await styleCache.get(id);resources.push({kind:'style',id,value});
  if(!value||value.id!==id||value.type!==type){gaps.push('linked-style-unavailable');return null;}
  if(policy.resources){if(!/^[a-f0-9]{40}$/.test(value.key)||policy.resources.has('style:'+value.key)&&policy.resources.get('style:'+value.key)!==type){gaps.push('catalog-style-identity-unconfirmed');return null;}return policy.resources.has('style:'+value.key);}
  return true;
 };
 const variable=async id=>{
  if(!variableCache.has(id))variableCache.set(id,read(()=>api.variables.getVariableByIdAsync(id),{operation:'variables.getVariableByIdAsync',nodeId:node.id,resourceId:id}).then(variableValue).catch(()=>null));
  const value=await variableCache.get(id);resources.push({kind:'variable',id,value});
  if(!value||value.resolvedType!=='COLOR'){gaps.push('linked-token-unavailable');return null;}
  if(policy.resources){if(!/^[a-f0-9]{40}$/.test(value.key)||policy.resources.has('variable:'+value.key)&&policy.resources.get('variable:'+value.key)!=='COLOR'){gaps.push('catalog-token-identity-unconfirmed');return null;}return policy.resources.has('variable:'+value.key);}
  return true;
 };
 for(const [property,styleField] of [['fills','fillStyleId'],['strokes','strokeStyleId']]){
  const paints=node[property],ranges=Array.isArray(paints)?[{fills:paints,fillStyleId:node[styleField]}]:property==='fills'&&node.type==='TEXT'&&typeof node.getStyledTextSegments==='function'?node.getStyledTextSegments(['fills','fillStyleId']):null;
  if(!ranges||!ranges.length||ranges.some(s=>!Array.isArray(s.fills))){if(typeof paints==='symbol'){gaps.push('mixed-paints-unavailable');findings.push({property,status:'unknown',evidence:{property,paints:'mixed'}});}continue;}
  if(property==='fills'&&technicalPaint(node,paints)||policy.ignorePaint===true){resolved.add(property);continue;}
  let unbound=0,unknown=false;
  for(const range of ranges)for(const paint of range.fills){if(!paint||paint.visible===false||paint.type!=='SOLID')continue;
   const alias=paint.boundVariables?.color;
   if(alias){if(alias.type!=='VARIABLE_ALIAS'||typeof alias.id!=='string'||!alias.id){unknown=true;gaps.push('paint-binding-incompatible');}else{const state=await variable(alias.id);if(state===false)unbound++;else if(state===null)unknown=true;}continue;}
   const state=await linked(range.fillStyleId,'PAINT');if(state===false)unbound++;else if(state===null)unknown=true;
  }
  if(unbound||unknown)findings.push({property,status:unknown?'unknown':'custom-style',evidence:{property,styleId:plain(node[styleField]),unboundSolidPaints:unbound,linkedResourceUnavailable:unknown}});
  else resolved.add(property);
 }
 const effects=Array.isArray(node.effects)?node.effects.filter(e=>e&&e.visible!==false):[];
 if(effects.length){const state=await linked(node.effectStyleId,'EFFECT');if(state!==true)findings.push({property:'effects',status:state===null?'unknown':'custom-style',evidence:{property:'effects',styleId:plain(node.effectStyleId),effectTypes:effects.map(e=>e.type)}});else resolved.add('effects');}else if(Array.isArray(node.effects))resolved.add('effects');
 if(node.type==='TEXT'&&String(node.characters||'').trim()&&policy.ignoreTypography!==true){
  const segments=typeof node.getStyledTextSegments==='function'?node.getStyledTextSegments(['textStyleId']):null;
  const ids=segments?segments.filter(s=>s.end>s.start).map(s=>s.textStyleId):[node.textStyleId];let unbound=0,unknown=false;
  for(const id of ids){if(typeof id==='symbol'){unknown=true;gaps.push('mixed-text-style-unavailable');continue;}const state=await linked(id,'TEXT');if(state===false)unbound++;if(state===null)unknown=true;}
  if(unbound||unknown)findings.push({property:'typography',status:unknown?'unknown':'custom-style',evidence:{property:'typography',styleId:plain(node.textStyleId),unboundTextRanges:unbound,fontName:plain(node.fontName),fontSize:plain(node.fontSize)}});
  else if(ids.length)resolved.add('typography');
 }
 if(policy.indexId)for(const f of findings){f.evidence.catalogIndexId=policy.indexId;f.evidence.catalogMembership='not-confirmed';}
 return{findings,resources,gaps,resolved};
}
module.exports={styleValue,variableValue,linkedStyleValue,technicalPaint,describeNativeStyles};
