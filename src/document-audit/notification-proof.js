// Notifications indicate when to verify an observation, not whether it changed.
// These synchronous fields cover the native scene projections read by the consumer.
// Async identities/resources still require guarded native/contract rechecks below.
const sceneFields=['visible','x','y','width','height','rotation','relativeTransform','absoluteTransform','opacity','fills','strokes','effects','fillStyleId','strokeStyleId','effectStyleId','textStyleId','characters','fontName','fontSize','fontWeight','lineHeight','letterSpacing','textCase','textDecoration','textAlignHorizontal','textAlignVertical','textAutoResize','textTruncation','maxLines','paragraphSpacing','paragraphIndent','listSpacing','hangingPunctuation','hangingList','boundVariables','resolvedVariableModes','explicitVariableModes','componentProperties','componentPropertyDefinitions','componentPropertyReferences','overrides','variantProperties','key','remote','detachedInfo','layoutMode','layoutWrap','itemSpacing','counterAxisSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','primaryAxisAlignItems','counterAxisAlignItems','counterAxisAlignContent','primaryAxisSizingMode','counterAxisSizingMode','layoutSizingHorizontal','layoutSizingVertical','layoutAlign','layoutGrow','layoutPositioning','minWidth','maxWidth','minHeight','maxHeight','clipsContent','gridStyleId','layoutGrids','strokeWeight','strokeTopWeight','strokeRightWeight','strokeBottomWeight','strokeLeftWeight','strokeAlign','dashPattern','cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','cornerSmoothing','constraints','scaleFactor'];
function plain(value,seen=new Set()){
 if(value===undefined)return{$state:'undefined'};if(typeof value==='symbol')return{$state:'mixed'};
 if(value===null||typeof value!=='object')return value;
 // SLOT values contain live SceneNode references; identity is the observed value.
 if(typeof value.id==='string'&&typeof value.type==='string'&&('parent'in value))return{$node:value.id,$type:value.type};
 if(seen.has(value))throw Error('NATIVE_OBSERVATION_UNAVAILABLE');seen.add(value);
 const result=Array.isArray(value)?value.map(v=>plain(v,seen)):Object.fromEntries(Object.keys(value).sort().map(k=>[k,plain(value[k],seen)]));seen.delete(value);return result;
}
function nodeEvidence(n){
 const value={id:n.id,type:n.type,name:n.name,removed:!!n.removed,parent:n.parent?.id||null};
 if(n.removed)return value;
 if(n.type==='PAGE'||n.type==='DOCUMENT'){if(n.type==='PAGE')value.explicitVariableModes=plain(n.explicitVariableModes);return value;}
 if('children'in n)value.children=Array.from(n.children).map(c=>c.id);
 for(const field of sceneFields)if(field in n)value[field]=plain(n[field]);
 if(n.type==='TEXT'&&typeof n.getStyledTextSegments==='function')value.textSegments=plain(n.getStyledTextSegments(['textStyleId','fontName','fontSize','lineHeight','letterSpacing','textDecoration','textCase','fills']));
 return value;
}
function observationNodes(nodes,roots=[]){
 const map=new Map();for(const n of nodes)if(n)map.set(n.id,n);
 const stack=roots.slice(),seen=new Set();while(stack.length){const n=stack.pop();if(!n||seen.has(n.id))continue;seen.add(n.id);if(seen.size>10000)throw Error('NATIVE_OBSERVATION_LIMIT');map.set(n.id,n);if(!n.removed&&'children'in n)stack.push(...n.children);}
 for(const n of Array.from(map.values())){let p=n.parent,seenParents=new Set();while(p&&!seenParents.has(p.id)){seenParents.add(p.id);map.set(p.id,p);if(p.type==='PAGE'||p.type==='DOCUMENT')break;p=p.parent;}}
 return Array.from(map.values());
}
function createNotificationProof({nodes,hash,guard=()=>{},verify=async()=>{},onError=()=>{},timeoutMs=15000}){
 const baseline=new Map(nodes.map(n=>[n,hash(nodeEvidence(n))]));let serial=0,verified=0,pending=null,closed=false,failure=null;
 function assertCurrent(){guard();if(closed||failure)throw failure||Error('NATIVE_RESULT_STALE');}
 function assertStable(){assertCurrent();for(const [n,value]of baseline)if(hash(nodeEvidence(n))!==value)throw Error('NATIVE_FACTS_CHANGED');}
 function invalidate(error){if(closed)return;failure=error;closed=true;onError(error);}
 function notify(){
  if(closed)return Promise.resolve(false);
  try{assertStable();}catch(e){invalidate(e);return Promise.resolve(false);}
  serial++;
  if(!pending){const work=async()=>{for(let attempt=0;attempt<32;attempt++){const version=serial;assertStable();let timer;
   try{await Promise.race([verify(assertCurrent),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_TIMEOUT')),timeoutMs);})]);assertStable();}finally{clearTimeout(timer);}
   if(version===serial){verified=version;return true;}
  }throw Error('NATIVE_OBSERVER_SUPERSEDED');};
   pending=work().catch(e=>{invalidate(e);return false;}).finally(()=>{pending=null;});
  }
  return pending;
 }
 async function settle(){if(pending)await pending;assertStable();}
 async function finish(publish){for(let attempt=0;attempt<32;attempt++){await settle();if(!pending&&verified===serial){assertStable();return publish();}}throw Error('NATIVE_OBSERVER_SUPERSEDED');}
 return{notify,settle,finish,assertCurrent,assertStable,hasPending:()=>Boolean(pending),close:()=>{closed=true;}};
}
module.exports={createNotificationProof,observationNodes};
