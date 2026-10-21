// Exact-ID port from v3 sceneNodeResolver. Never resolve by a layer name.
async function resolveNativeNode(api,id,{read=fn=>fn(),guard=()=>{}}={}){
 guard();let node;
 try{node=await read(()=>api.getNodeByIdAsync(id));}catch(e){if(!/^I[^;]+;/.test(id)||e.message==='NATIVE_READ_TIMEOUT')throw e;}
 guard();if(node){if(node.id!==id)throw Error('CANVAS_IDENTITY_MISMATCH');return node;}
 const match=/^I([^;]+);/.exec(id);if(!match)return null;
 const owner=await read(()=>api.getNodeByIdAsync(match[1]));guard();
 if(!owner||owner.id!==match[1]||owner.type!=='INSTANCE'||owner.removed)return null;
 let found=null;
 if(typeof owner.findOne==='function')found=owner.findOne(n=>n.id===id);
 else{const stack=Array.from(owner.children||[]),seen=new Set();while(stack.length){guard();const n=stack.pop();if(seen.has(n.id))continue;seen.add(n.id);if(seen.size>10000)throw Error('CANVAS_TARGET_LIMIT');if(n.id===id){found=n;break;}stack.push(...Array.from(n.children||[]));}}
 guard();if(!found||found.id!==id||found.removed)return null;
 let parent=found.parent,seen=new Set();while(parent&&!seen.has(parent.id)){if(parent===owner||parent.id===owner.id)return found;seen.add(parent.id);parent=parent.parent;}
 return null;
}
function currentPageTarget(node,pageId){
 if(!node||node.removed||['PAGE','DOCUMENT'].includes(node.type))return false;
 const seen=new Set();let n=node;
 while(n&&!seen.has(n.id)){if(n.type==='PAGE')return n.id===pageId;if(n.removed||n.visible===false)return false;seen.add(n.id);n=n.parent;}
 return false;
}
module.exports={resolveNativeNode,currentPageTarget};
