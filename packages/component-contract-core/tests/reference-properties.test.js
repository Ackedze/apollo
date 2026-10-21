const test=require('node:test'),assert=require('node:assert/strict');
const {referenceProperties}=require('../dist/capture.cjs');
test('reference copies only native swap ports owned and used by the selected configuration',()=>{
 const prop=(type,value)=>({type,value});
 const properties={Size:prop('VARIANT','S'),Label:prop('TEXT','Details'),Enabled:prop('BOOLEAN',false),Icon16:prop('INSTANCE_SWAP','chosen16'),Icon24:prop('INSTANCE_SWAP','chosen24'),Denied:prop('INSTANCE_SWAP','denied'),Unbound:prop('INSTANCE_SWAP','unbound')};
 const actual={componentProperties:properties,children:[{type:'FRAME',children:[{type:'INSTANCE',visible:false,componentPropertyReferences:{mainComponent:'Icon16'}}]},{type:'INSTANCE',componentPropertyReferences:{mainComponent:'Denied'},children:[{type:'INSTANCE',componentPropertyReferences:{mainComponent:'Icon24'}}]}]};
 const reference={componentProperties:structuredClone(properties)};
 const before=JSON.stringify({actual,reference});
 assert.deepEqual(referenceProperties(actual,reference,['Label','Enabled','Icon16','Icon24','Unbound']),{Size:'S',Label:'Details',Enabled:false,Icon16:'chosen16'});
 assert.equal(JSON.stringify({actual,reference}),before);
});
