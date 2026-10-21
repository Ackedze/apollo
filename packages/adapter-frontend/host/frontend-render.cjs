'use strict';
const q=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
/** Fixed reviewed recipe and typed caller DTO; never raw JSX from ScreenSpec. */
function render(plan,profile,toolchain,commands){
  const group=plan.spec.nodes.find(n=>n.actions),transitions=Object.fromEntries(plan.spec.events.map(e=>[e.id,Object.fromEntries(plan.spec.transitions.filter(t=>t.eventId===e.id).map(t=>[t.from,t.to]))]));
  const disabled=Object.fromEntries(group.actions.items.map(a=>[a.id,a.disabled===undefined?false:a.disabled]));
  const text=`import {useState} from 'react';
import {ProposedDesktopActions, type Invocation} from './recipe';
import {materializeProposal, type ProposalApplication} from './application';
import {createCommandBank,createProbeCommandBank} from './commands';
const approved=${q(profile.actions)} as const;
const disabled=${q(disabled)};
const transitions:Record<string,Record<string,string>>=${q(transitions)};
const bank=new URLSearchParams(location.search).get('probe')==='1'?createProbeCommandBank((commandRef:string,invocation:Invocation)=>window.dispatchEvent(new CustomEvent('apollo-probe-command',{detail:{commandRef,actionId:invocation.actionId,source:invocation.source,hasMouseEvent:'event' in invocation}}))):createCommandBank();
export function GeneratedScreen({initialState=${q(plan.spec.states.initial)}}:{initialState?:string}){
 const [state,setState]=useState(initialState);
 const commands=Object.fromEntries(approved.map(a=>[a.commandRef,(invocation:Invocation)=>{
  const command=bank[a.commandRef]; if(typeof command!=='function')throw new Error('MISSING_COMMAND_REF');
  command(invocation);setState(current=>transitions[a.eventId]?.[current]??current);
  window.dispatchEvent(new CustomEvent('apollo-plan-event',{detail:{actionId:a.id,eventId:a.eventId,source:invocation.source,hasMouseEvent:invocation.source==='button',trusted:invocation.source==='button'?invocation.event.nativeEvent.isTrusted:null}}));
 }]));
 const input:ProposalApplication={profileId:${q(profile.profileId)},groupId:${q(group.id)},platform:'desktop',size:56,mode:${q(profile.mode)},inlineSize:${profile.inlineSize},actions:approved.map(a=>{
  const value: boolean|{state:Record<string,boolean>}=disabled[a.id];
  return {id:a.id,label:a.label,view:a.view,commandRef:a.commandRef,disabled:typeof value==='boolean'?value:value.state[state]};
 })};
 // plan-node: ${plan.spec.root}
 // plan-node: ${group.id}
 return <div data-generation-plan=${q(profile.authority.planHash)} data-screen-state={state}>
 <ProposedDesktopActions {...materializeProposal(input,commands)} onObservation={o=>window.dispatchEvent(new CustomEvent('apollo-layout',{detail:o}))} onRouting={o=>window.dispatchEvent(new CustomEvent('apollo-routing',{detail:o}))}/>
 </div>;
}
`;
  const lines=text.split('\n'),provenance=plan.spec.nodes.map(n=>({planNodeId:n.id,artifactId:'src/GeneratedScreen.tsx:'+(lines.findIndex(l=>l.includes('plan-node: '+n.id))+1)}));
  for(const a of group.actions.items)provenance.push({planNodeId:a.id,artifactId:'src/GeneratedScreen.tsx:'+ (lines.findIndex(l=>l.startsWith('const approved='))+1)});
  const files=[{path:'src/GeneratedScreen.tsx',text},{path:'src/recipe.tsx',text:toolchain.recipe},{path:'src/application.ts',text:toolchain.application},{path:'src/commands.ts',text:commands},
    {path:'src/main.tsx',text:`import {createRoot} from 'react-dom/client';import {GeneratedScreen} from './GeneratedScreen';import './styles.css';
const root=createRoot(document.getElementById('root')!);const state=new URLSearchParams(location.search).get('state')||undefined;root.render(<GeneratedScreen initialState={state}/>);`},
    {path:'src/styles.css',text:'html,body{margin:0;font-family:"Alfa Interface Sans",sans-serif;}#root{min-height:100vh;}'},
    {path:'index.html',text:'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apollo generated screen</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>'},
    {path:'package.json',text:JSON.stringify({name:'apollo-private-generated-screen',private:true,type:'module',dependencies:{react:toolchain.versions.react,'react-dom':toolchain.versions['react-dom'],'arui-private':toolchain.evidence.packageVersion},devDependencies:{typescript:toolchain.versions.typescript,vite:toolchain.versions.vite}})},
    {path:'tsconfig.json',text:JSON.stringify({compilerOptions:{target:'ES2020',lib:['ES2020','DOM','DOM.Iterable'],module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,esModuleInterop:true,noEmit:true,types:['react','react-dom']},include:['src']})},
    {path:'vite.config.mjs',text:"export default {base:'./',build:{outDir:'dist',emptyOutDir:true},css:{postcss:{plugins:[]}},resolve:{dedupe:['react','react-dom']}};"}];
  return {planHash:profile.authority.planHash,files,provenance};
}
module.exports={render};
