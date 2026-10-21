// Narrow native provenance transfer from v3 services/detachedComponentSource.ts.
// Names, FRAME shape, empty style IDs and local detach history prove no library origin.
function detachedValue(node){
 if(node.type!=='FRAME'&&node.type!=='GROUP')return null;
 const info=node.detachedInfo;
 if(info?.type==='library'&&typeof info.componentKey==='string'&&info.componentKey.trim())return{type:'library',componentKey:info.componentKey};
 return null;
}
function getDetachedLibraryComponentKey(node){return detachedValue(node)?.componentKey||null;}
module.exports={detachedValue,getDetachedLibraryComponentKey};
