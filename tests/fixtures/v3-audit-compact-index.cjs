'use strict';
const {createHash}=require('node:crypto');

const legacyKey='a'.repeat(40),targetKey='b'.repeat(40),ambiguousKey='c'.repeat(40);
const legacyParent='d'.repeat(40),targetParent='e'.repeat(40),tokenKey='f'.repeat(40);
const schema='apollo.offline-audit-index.v1';
const parent=name=>({type:'component',name,library:'Fixture Core',status:'active',role:'main',
  platforms:['Desktop','MobileWeb'],sources:[0]});
const variant=componentKey=>({type:'variant',name:'Size=40',componentKey});
const payload={
  manifest:{schema,version:1,coverage:Object.fromEntries(['Desktop','MobileWeb','iOS','Android'].map(platform=>
    [platform,{loaded:1,expected:1,unclassified:0,gaps:[]}]))},
  components:{rows:{
    [legacyParent]:parent('[D][Corporate] Button'),[targetParent]:parent('[D] Button'),
    [legacyKey]:variant(legacyParent),[targetKey]:variant(targetParent),[ambiguousKey]:{type:'ambiguous'},
  }},
  sources:{sources:[{id:0,catalogPath:'web/components/Button.json'}]},
  theming:{pairs:[{sourceKey:legacyParent,targetKey:targetParent,platform:'Desktop',state:'verified-family',
    mapped:{[legacyKey]:{targetKey,properties:{}}}}]},
  resources:{styles:{},tokens:{[tokenKey]:{status:'active',closed:false}}},
  styleCatalogs:[{meta:{fileName:'Fixture styles'},styles:[]}],
  tokenCatalogs:[{meta:{fileName:'Fixture tokens'},collections:[{name:'Interface Dynamic',
    variables:[{id:'VariableID:123:1',key:tokenKey,name:'Цвет',resolvedType:'COLOR'}]}]}],
  policy:{schemaVersion:1,rawTypography:{rules:[]}},
  remediations:{schemaVersion:1,components:{},styles:{}},
};
const data={schema:'apollo.embedded-audit.v1',dataId:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),payload};
module.exports={data,legacyKey,targetKey};
