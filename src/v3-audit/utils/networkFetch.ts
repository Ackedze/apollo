/// <reference types="@figma/plugin-typings" />
let packageReader: ((url:string)=>Promise<string>) | null = null;
/** V3 URL strings are lookup identities; only the pinned Proxy package reader may resolve them. */
export function configureAuditPackageReader(read: (url:string)=>Promise<string>):void {
 if(typeof read !== 'function')throw Error('AUDIT_PACKAGE_READER_REQUIRED');
 packageReader=read;
}
export function appendCacheBustingQuery(url:string,key:string,value:string|number=Date.now()):string {
 return `${url}${url.includes('?')?'&':'?'}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}
export async function fetchDirect(url:string):Promise<string> {
 if(!packageReader)throw Error('AUDIT_PACKAGE_READER_REQUIRED');
 return packageReader(url);
}
