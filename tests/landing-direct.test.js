'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLandingCanvasBridge}=require('../src/landing/context-native');
test('plugin generation bridge supplies context and cannot create, observe or assemble a landing',()=>{
 const replies=[],section={id:'2:3',type:'SECTION',name:'Selected',children:[]},page={id:'1:2',type:'PAGE',children:[section],selection:[section]};section.parent=page;
 const bridge=createLandingCanvasBridge({api:{currentPage:page,fileKey:'FixtureFile',createFrame(){throw Error('Unexpected write');}},post:value=>replies.push(value),buildId:'build'});
 for(const operation of ['context','open','assemble','observe','release'])bridge.accept({type:'landing-canvas',requestId:'request:'+operation,operation,payload:{}});
 assert.equal(replies[0].value.flow,'direct-cli-mcp-v1');assert.equal(replies[0].value.selectedSectionId,'2:3');assert.equal(replies[0].value.buildId,'build');for(const reply of replies.slice(1,4))assert.equal(reply.error.code,'LANDING_LEGACY_FLOW_RETIRED');assert.equal(replies[4].value.preserved,true);assert.equal(bridge.busy(),false);
});
