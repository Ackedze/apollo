import {transformValue} from '../../generation-core/src/planning';
import type { CompositionPlan, GenerationContext, Hash } from '../../generation-core/src/planning';
export type FrontendProfileId='desktop-size56.baseline-no-overflow.v1'|'desktop-size56.opt-in-overflow-commands.v1';
export type FrontendProfile = {
  version:1;profileId:FrontendProfileId;mode:'baseline-no-overflow'|'opt-in-auto-overflow-commands';
  authority:{status:'accepted';scope:'accepted-source'|'synthetic-local';planHash:string;contextHash:string;evidenceHash:string};
  presentation:{version:1;id:string;fontFamily:'Alfa Interface Sans';evidenceHash:string};
  inlineSize:number;
  actions:Array<{id:string;label:string;eventId:string;commandRef:string;view:'primary'|'secondary'}>;
  commandModule:{path:string;sha256:string;invocationVersion:1;probeVersion:1;eventPolicy:'event-optional-business-command'};
};
const closed=(x:unknown,k:string[])=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===k.length&&k.every(key=>Object.prototype.hasOwnProperty.call(x,key));
export function assertFrontendProfile(plan:CompositionPlan,context:GenerationContext,p:FrontendProfile|null,hash:Hash,syntheticLocal=false):FrontendProfile {
  const fail=(reason:string):never=>{throw new Error(reason);};
  if(!p)fail('FRONTEND_PROFILE_NOT_ACCEPTED');
  if(!closed(p,['version','profileId','mode','authority','presentation','inlineSize','actions','commandModule'])||p!.version!==1)fail('FRONTEND_PROFILE_VERSION_UNSUPPORTED');
  const profile=p!;
  if(!closed(profile.authority,['status','scope','planHash','contextHash','evidenceHash'])||profile.authority.status!=='accepted'
    ||profile.authority.planHash!==hash(plan)||profile.authority.contextHash!==hash(context)||! /^[a-f0-9]{64}$/.test(profile.authority.evidenceHash)
    ||!['accepted-source','synthetic-local'].includes(profile.authority.scope)||profile.authority.scope==='synthetic-local'&&!syntheticLocal)fail('FRONTEND_PROFILE_AUTHORITY_MISSING');
  if(plan.spec.platform!=='desktop'||!['desktop-size56.baseline-no-overflow.v1','desktop-size56.opt-in-overflow-commands.v1'].includes(profile.profileId)
    ||profile.mode!==(profile.profileId==='desktop-size56.baseline-no-overflow.v1'?'baseline-no-overflow':'opt-in-auto-overflow-commands'))fail('FRONTEND_PROFILE_MISMATCH');
  if(!closed(profile.presentation,['version','id','fontFamily','evidenceHash'])||profile.presentation.version!==1||!profile.presentation.id||profile.presentation.fontFamily!=='Alfa Interface Sans'||! /^[a-f0-9]{64}$/.test(profile.presentation.evidenceHash))fail('FRONTEND_PRESENTATION_NOT_ACCEPTED');
  if(!Number.isFinite(profile.inlineSize)||profile.inlineSize<=0||profile.inlineSize>plan.spec.viewport.width)fail('FRONTEND_ALLOCATION_NOT_ACCEPTED');
  if(!closed(profile.commandModule,['path','sha256','invocationVersion','probeVersion','eventPolicy'])||profile.commandModule.invocationVersion!==1||profile.commandModule.probeVersion!==1||profile.commandModule.eventPolicy!=='event-optional-business-command'||typeof profile.commandModule.path!=='string'||! /^[a-f0-9]{64}$/.test(profile.commandModule.sha256))fail('FRONTEND_COMMAND_BANK_MISSING');
  const components=plan.spec.nodes.filter(n=>n.kind==='component');
  const content=components.find(n=>context.registry.entries.find(m=>m.id===n.mappingId)?.code.module==='arui-private/corporate-content');
  const group=components.find(n=>context.registry.entries.find(m=>m.id===n.mappingId)?.code.module==='arui-private/button-group');
  if(plan.spec.nodes.length!==2||components.length!==2||content?.id!==plan.spec.root||!group?.actions||group.actions.items.length<1||group.actions.items.length>4
    ||Object.values(content.slots).flat().length!==1||Object.values(content.slots).flat()[0]!==group.id||Object.keys(group.slots).length||Object.keys(content.props).length||!Object.prototype.hasOwnProperty.call(content.slots,'Body')||Object.keys(content.slots).length!==1
    ||profile.mode==='baseline-no-overflow'&&group.actions.items.length!==2)fail('FRONTEND_COMPOSITION_UNSUPPORTED');
  if(!group||!group.actions)throw new Error('FRONTEND_COMPOSITION_UNSUPPORTED');
  // The exact accepted port approves plaintext labels and command semantics.
  if(!Array.isArray(profile.actions)||profile.actions.length!==group.actions.items.length||new Set(profile.actions.map(a=>a.id)).size!==profile.actions.length)fail('FRONTEND_ACTION_AUTHORITY_MISSING');
  for(const [i,a] of profile.actions.entries()){
    const n=group.actions.items[i];
    if(!closed(a,['id','label','eventId','commandRef','view'])||!a.commandRef||a.id!==n.id||a.label!==n.label||a.eventId!==n.eventId||a.view!==n.view
      ||!['primary','secondary'].includes(a.view)||i>0&&a.view==='primary')fail('FRONTEND_ACTION_AUTHORITY_MISSING');
  }
  const mapping=context.registry.entries.find(m=>m.id===group.mappingId)!;
  const size=Object.entries(group.props).find(([id])=>mapping.props[id]?.code.prop==='size');
  if(Object.keys(group.props).length!==(size?1:0)||! /^[A-Za-z][A-Za-z0-9_-]*$/.test(group.id)||group.actions.items.some(a=>! /^[A-Za-z][A-Za-z0-9_-]*$/.test(a.id)))fail('FRONTEND_COMPOSITION_UNSUPPORTED');
  if(size&&transformValue(size[1] as string,mapping.props[size[0]].code.transform)!==56)fail('FRONTEND_PROFILE_SIZE_MISMATCH');
  if(mapping.profile?.code.size!==56&&Object.entries(group.props).find(([id])=>mapping.props[id]?.code.prop==='size')?.[1]!=='56')fail('FRONTEND_PROFILE_SIZE_MISMATCH');
  return JSON.parse(JSON.stringify(profile));
}
