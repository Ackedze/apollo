function publishedSet(set,key){
 if(set?.type!=='COMPONENT_SET'||set.remote!==true||set.key!==key||typeof set.id!=='string')throw Error('PUBLISHED_SET_RESPONSE_INVALID');
 return set;
}
function publishedVariant(set,setKey,key){
 publishedSet(set,setKey);
 const matches=Array.from(set.children).filter(c=>c.type==='COMPONENT'&&c.remote===true&&c.key===key&&c.parent?.id===set.id);
 if(matches.length!==1)throw Object.assign(Error('PUBLISHED_VARIANT_UNAVAILABLE'),{componentSetKey:setKey});
 return matches[0];
}
module.exports={publishedSet,publishedVariant};
