'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const files={frontend:['SKILL.md','references/evals.md'],figma:['SKILL.md','references/evals.md','references/current-profile.md']};
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
/** Trusted local input loader only. It does not plan, render, execute or persist evals. */
function createGenerationSkills({installedSkillsDirectory=path.join(__dirname,'../skills'),profileFile=path.join(__dirname,"../instructions/agent-generation/skill-profile.json")}={}){
 function read(file,code){try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||fs.realpathSync(file)!==path.resolve(file))fail(code);return fs.readFileSync(file);}catch(e){if(e.code===code)throw e;fail(code);}}
 const loaderBytes=read(__filename,'AGENT_GENERATION_SKILL_UNAVAILABLE'),loaderPin={path:__filename,sha256:sha(loaderBytes),bytes:loaderBytes.length};
 function select(target,{executionProfile,sourceHash}={}){
  if(!Object.prototype.hasOwnProperty.call(files,target))fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
  const profileBytes=read(profileFile,'AGENT_GENERATION_SKILL_UNAVAILABLE');let profile;
  try{profile=JSON.parse(profileBytes);}catch{fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');}
  if(!closed(profile,['schemaVersion','version','targets'])||profile.schemaVersion!=='apollo.generation-skill-profile.v1'||profile.version!=='0.1.1'||!closed(profile.targets,['frontend','figma']))fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
  const chosen=profile.targets[target],expectedKeys=target==='figma'?['name','version','profileId','sourceHash','files']:['name','version','profileId','files'];
  if(!closed(chosen,expectedKeys)||chosen.name!=='apollo-generate-'+target||chosen.version!==(target==='figma'?'0.1.4':'0.1.1')||!(target==='figma'?['interface-v7/MAP-02','figma-owned-generic.v1'].includes(chosen.profileId):chosen.profileId==='frontend-workspace.v1')||!Array.isArray(chosen.files)||chosen.files.length!==files[target].length)fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
  if(target==='figma'&&(executionProfile!=='figma-owned-root-v1'||!/^[a-f0-9]{64}$/.test(chosen.sourceHash)||sourceHash!==chosen.sourceHash))fail('AGENT_GENERATION_SKILL_PROFILE_MISMATCH');
  const skillRoot=path.resolve(installedSkillsDirectory,chosen.name),pins=[{path:path.resolve(profileFile),sha256:sha(profileBytes),bytes:profileBytes.length}],skills=[];
  for(let i=0;i<files[target].length;i++){
   const expected=chosen.files[i];if(!closed(expected,['path','sha256','bytes'])||expected.path!==files[target][i]||!/^[a-f0-9]{64}$/.test(expected.sha256)||!Number.isSafeInteger(expected.bytes)||expected.bytes<1||expected.bytes>65536)fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
   const file=path.join(skillRoot,expected.path),bytes=read(file,'AGENT_GENERATION_SKILL_UNAVAILABLE');
   if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('AGENT_GENERATION_SKILL_STALE');
   const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
   if(i===0&&(!text.startsWith('---\nname: '+chosen.name+'\n')||!text.includes('  version: "'+chosen.version+'"\n')))fail('AGENT_GENERATION_SKILL_PROFILE_INVALID');
   pins.push({path:file,sha256:expected.sha256,bytes:bytes.length});skills.push({id:i===0?chosen.name:chosen.name+'/'+expected.path,text,sha256:expected.sha256});
  }
  const metadata={schemaVersion:'apollo.generation-skill-snapshot.v1',name:chosen.name,version:chosen.version,profileId:chosen.profileId,files:pins.slice(1),profile:pins[0],evals:{persistenceOwner:'Proxy',storagePolicy:'outside-pinned-skill-package'}};
  if(target==='figma')metadata.sourceHash=chosen.sourceHash;
  pins.push(loaderPin);
  function assertCurrent(){for(const pin of pins){const bytes=read(pin.path,'AGENT_GENERATION_SKILL_STALE');if(bytes.length!==pin.bytes||sha(bytes)!==pin.sha256)fail('AGENT_GENERATION_SKILL_STALE');}}
  assertCurrent();return{skills,metadata,pins,assertCurrent};
 }
 return{select};
}
module.exports={createGenerationSkills};
