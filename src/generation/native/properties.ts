export type DeclaredDiagnosticProperty={property:string;propertyType:string};
export type ObservedDiagnosticProperty={
 property:string;expectedTypes:string[];readStatus:'observed'|'missing'|'unreadable';
 typeStatus:'matches'|'mismatch'|'unknown'|'ambiguous';valueStatus:'observed'|'unknown'|'omitted';
 observed:{type:string|null;value:string|boolean|null;omitted:boolean;characters:number|null}|null;
};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
/** Read only exact declared property names, independent of occurrence identity.
 * No fallback to names, sibling indexes or undeclared component properties. */
export function observeDeclaredNativeProperties(node:Pick<InstanceNode,'componentProperties'>,declarations:DeclaredDiagnosticProperty[]){
 const expected=new Map<string,string[]>();
 for(const declaration of declarations){
  const types=expected.get(declaration.property)||[];
  if(!types.includes(declaration.propertyType))types.push(declaration.propertyType);
  expected.set(declaration.property,types);
 }
 const all=Array.from(expected.entries()),bounded=all.slice(0,12),fields:ObservedDiagnosticProperty[]=[];
 let raw:unknown;try{raw=node.componentProperties;}catch{raw=null;}
 for(const [property,expectedTypes]of bounded){
  const field:ObservedDiagnosticProperty={property,expectedTypes:Array.from(expectedTypes),readStatus:'unreadable',typeStatus:'unknown',valueStatus:'unknown',observed:null};
  try{
   if(record(raw)){
    if(!Object.prototype.hasOwnProperty.call(raw,property))field.readStatus='missing';
    else{
     const value=raw[property];
     if(record(value)){
      const type=value.type,observedValue=value.value;
      const actualType=typeof type==='string'?type:null;
      const isScalar=typeof observedValue==='string'||typeof observedValue==='boolean';
      const omitted=typeof observedValue==='string'&&observedValue.length>8192;
      field.readStatus='observed';
      field.typeStatus=expectedTypes.length!==1?'ambiguous':actualType===null?'unknown':actualType===expectedTypes[0]?'matches':'mismatch';
      field.valueStatus=omitted?'omitted':isScalar?'observed':'unknown';
      field.observed={type:actualType,value:!omitted&&isScalar?observedValue:null,omitted,characters:typeof observedValue==='string'?observedValue.length:null};
     }
    }
   }
  }catch{field.readStatus='unreadable';field.typeStatus='unknown';field.valueStatus='unknown';field.observed=null;}
  fields.push(field);
 }
 const declarationsComplete=all.length>0&&all.length<=12;
 return{scope:'declared-api-observation-only',provenance:'observed-not-accepted',declarationsComplete,declarationsTotal:all.length,queryComplete:declarationsComplete&&fields.every(f=>f.readStatus!=='unreadable'),valuesComplete:declarationsComplete&&fields.every(f=>f.readStatus==='observed'&&f.valueStatus==='observed'),typesMatch:declarationsComplete&&fields.every(f=>f.typeStatus==='matches'),fields};
}
