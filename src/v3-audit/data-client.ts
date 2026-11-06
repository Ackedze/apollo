const p = require('./protocol');
export type AuditDataFile = { id:string; sha256:string; bytes:number; urls:string[] };
export type AuditDataManifest = { schemaVersion:string; dataId:string; entryUrl:string; policyFileId:string; files:AuditDataFile[]; [key:string]:any };
export type AuditDataTransport = {
  loadManifest():Promise<unknown>;
  readAsset(dataId:string,fileId:string):Promise<unknown>;
  hashText(text:string):string|Promise<string>;
  yieldControl?():Promise<void>;
};

/** Existing V3 readers use URLs as package lookup keys; there is no network fallback. */
export function createAuditDataClient(transport:AuditDataTransport) {
  if (!transport || !['loadManifest','readAsset','hashText'].every(k=>typeof (transport as any)[k]==='function')) throw Error('AUDIT_PACKAGE_TRANSPORT_REQUIRED');
  let manifest:AuditDataManifest|null=null, stale=false;
  const byUrl=new Map<string,AuditDataFile>(),byId=new Map<string,AuditDataFile>(),pending=new Map<string,Promise<string>>();
  async function validate(value:any,assertCurrent:()=>void):Promise<AuditDataManifest> {
    if (!value || value.schemaVersion!==p.SCHEMA || !p.HASH.test(value.dataId||'') || typeof value.entryUrl!=='string'
      || !Array.isArray(value.files) || !value.files.length || value.files.length>20000 || !p.HASH.test(value.policyFileId||'')) throw Error('AUDIT_DATA_INVALID');
    const body=Object.assign({},value);delete body.dataId;
    const hash=await transport.hashText(p.canonical(body));assertCurrent();
    if (hash!==value.dataId) throw Error('AUDIT_DATA_MANIFEST_MISMATCH');
    const ids=new Set<string>(),urls=new Map<string,string>();
    for (const [index,file] of value.files.entries()) {
      if(index%256===0){await transport.yieldControl?.();assertCurrent();}
      if (!file || !p.HASH.test(file.id||'') || !p.HASH.test(file.sha256||'') || !Number.isSafeInteger(file.bytes)
        || file.bytes<0 || file.bytes>p.MAX_FILE_BYTES || !Array.isArray(file.urls) || !file.urls.length || file.urls.length>16
        || ids.has(file.id)) throw Error('AUDIT_DATA_INVALID');
      ids.add(file.id);
      for (const url of file.urls) {
        const key=p.lookupUrl(url),prior=urls.get(key);
        if (prior && prior!==file.id) throw Error('AUDIT_DATA_URL_AMBIGUOUS');
        urls.set(key,file.id);
      }
    }
    if (!ids.has(value.policyFileId) || !urls.has(p.lookupUrl(value.entryUrl))) throw Error('AUDIT_DATA_CLOSURE_INCOMPLETE');
    return value;
  }
  function guard() { if(stale)throw Error('AUDIT_DATA_CHANGED_RELOAD_REQUIRED');if(!manifest)throw Error('AUDIT_DATA_NOT_OPEN'); }
  async function open(assertCurrent:()=>void=()=>{}) {
    assertCurrent();
    const loaded=await transport.loadManifest();assertCurrent();
    const document=JSON.parse(JSON.stringify(loaded));
    const next=await validate(document,assertCurrent);assertCurrent();
    if (stale || manifest && manifest.dataId!==next.dataId) {stale=true;throw Error('AUDIT_DATA_CHANGED_RELOAD_REQUIRED');}
    if (!manifest) {
      manifest=JSON.parse(JSON.stringify(next));
      for(const file of manifest!.files) {byId.set(file.id,file);for(const url of file.urls)byUrl.set(p.lookupUrl(url),file);}
    }
    return JSON.parse(JSON.stringify(manifest!)) as AuditDataManifest;
  }
  async function readFile(file:AuditDataFile):Promise<string> {
    guard();const dataId=manifest!.dataId;
    let task=pending.get(file.id);
    if (!task) {
      task=(async()=>{
        const result:any=await transport.readAsset(dataId,file.id);guard();
        if(result?.dataId!==dataId || result.fileId!==file.id || result.sha256!==file.sha256
          || typeof result.text!=='string') throw Error('AUDIT_DATA_ASSET_MISMATCH');
        const text=result.text;
        let bytes=0,count=0;
        for(const char of text){const point=char.codePointAt(0)!;bytes+=point<=127?1:point<=2047?2:point<=65535?3:4;
          if((++count&16383)===0){await transport.yieldControl?.();guard();}}
        await transport.yieldControl?.();guard();
        const hash=await transport.hashText(text);guard();
        if(bytes!==file.bytes || hash!==file.sha256)throw Error('AUDIT_DATA_ASSET_MISMATCH');
        return text;
      })().finally(()=>pending.delete(file.id));
      pending.set(file.id,task);
    }
    return task;
  }
  async function readText(url:string):Promise<string> {
    guard();const file=byUrl.get(p.lookupUrl(url));
    if(!file)throw Error('AUDIT_DATA_URL_UNDECLARED');
    return readFile(file);
  }
  return {
    open,readText,
    async readPolicies() {guard();return JSON.parse(await readFile(byId.get(manifest!.policyFileId)!));},
    async assertCurrent() {guard();await open();},
    identity() {guard();return manifest!.dataId;},
  };
}
