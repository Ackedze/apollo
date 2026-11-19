const test=require('node:test'),assert=require('node:assert/strict');
const {textReviewGroups,textReplacements,safeReplacement}=require('../src/v3-audit/text-review-model');
const {command,BRIDGE}=require('../src/v3-audit/transport');
test('text groups use explicit layer coverage, never generic gaps or intentional skips',()=>{
 const error={nodeId:'error',priority:'error'},warning={nodeId:'warning',priority:'warning'},info={nodeId:'question',priority:'info'};
 const unchecked={nodeId:'stub',reason:'Заглушка вместо текста — не проверялась'};
 assert.deepEqual(textReviewGroups({findings:[error,warning,info],unverifiedTexts:[unchecked,unchecked,{nodeId:'error',reason:'Заглушка'}],coverageGaps:['Не прочитано правило'],excludedTextCount:20}),{errors:[error,warning],clarifications:[info],unchecked:[unchecked]});
 assert.deepEqual(textReviewGroups({findings:[info],coverageGaps:['Общее сообщение']}),{errors:[],clarifications:[info],unchecked:[]});
 assert.deepEqual(textReviewGroups({findings:[{nodeId:'stub',priority:'info'}],unverifiedTexts:[unchecked]}),{errors:[],clarifications:[],unchecked:[unchecked]});
 assert.deepEqual(Object.values(textReviewGroups(null)).map(items=>items.length),[0,0,0]);
});
function texts(){return{capture:{mutationAvailable:true,textTargets:[{nodeId:'text;deep:1',focusActionId:'v3-focus-0'}],textReport:{facts:{texts:[{node:{id:'text;deep:1'},text:'Для кого'}]}}},result:{findings:[{nodeId:'text;deep:1',replacement:'Для\u00a0кого'}]},drafts:{}};}
test('replacement uses native-owned targets, exact editable Unicode and eligible empty strings',()=>{
 const state=texts();assert.deepEqual(textReplacements(state),[{focusActionId:'v3-focus-0',before:'Для кого',after:'Для\u00a0кого'}]);
 state.drafts['text;deep:1']='';assert.equal(textReplacements(state)[0].after,'');
 state.drafts['text;deep:1']='Для кого';assert.deepEqual(textReplacements(state),[]);
 state.drafts['text;deep:1']='Для\u202fкого – 🧑';assert.equal(textReplacements(state)[0].after,'Для\u202fкого – 🧑');
 state.stale=true;assert.deepEqual(textReplacements(state),[]);state.stale=false;state.capture.mutationAvailable=false;assert.deepEqual(textReplacements(state),[]);
});
test('strict text command rejects arbitrary IDs, duplicate targets, extra keys, unsafe or huge values',()=>{
 const row={focusActionId:'v3-focus-0',before:'Для кого',after:'Для\u00a0кого'};
 const payload=rows=>({type:'v3-audit-text-replace',schemaVersion:BRIDGE,requestId:'replace',runId:'run',replacements:rows});
 assert(command(payload([row])));assert(command(payload([{...row,after:''}])));
 for(const rows of [[],[row,row],[{...row,nodeId:'arbitrary'}],[{...row,focusActionId:'text;deep:1'}],[{...row,after:'bad\u0000'}],[{...row,after:'bad\ud800'}],[{...row,after:'x'.repeat(2000001)}]])assert.equal(command(payload(rows)),false);
 assert.equal(command({...payload([row]),rootIds:['root']}),false);
 assert(safeReplacement('Для\u00a0кого\u202f–\n👩🏽‍💻\t'));
 assert.equal(safeReplacement('x\u009f'),false);
});

test('confirmed completed targets disappear from groups and pending replacement payloads, including empty text',()=>{
 const state=texts();state.result.findings[0].priority='warning';state.result.unverifiedTexts=[{nodeId:'skipped',reason:'Заглушка'}];
 state.applied={'text;deep:1':''};const groups=textReviewGroups(state.result,state.applied);
 assert.equal(groups.errors.length,0);assert.equal(groups.unchecked.length,1);assert.deepEqual(textReplacements(state),[]);
 assert.equal(state.result.findings.length,1);assert.equal(state.capture.textReport.facts.texts[0].text,'Для кого');
});
