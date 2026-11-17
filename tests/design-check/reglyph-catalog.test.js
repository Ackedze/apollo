const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPickerCatalog}=require('../../src/skills/reglyph/catalog');
const icons=[
  {key:'solid',name:'Card Solid',baseName:'Карточка',familyId:'card',properties:{Style:'Solid'}},
  {key:'line',name:'Card Line',baseName:'Карточка',searchDescription:'Оплата ёлки',familyId:'card',width:24,height:24,properties:{Style:'Line',Color:'False'}},
  {key:'ten',name:'Test 10',familyId:'ten'},
  {key:'two',name:'Test 2',familyId:'two'},
  {key:'other',name:'Other',familyId:'other'}
];
const catalog={newIcons:icons,iconCategories:[
  {id:'payments',name:'Платежи',familyIds:['card']},
  {id:'shared',name:'Общие',familyIds:['card']},
  {id:'numbers',name:'Номера',familyIds:['ten','two']}
]};
const keys=groups=>groups.map(group=>[group.id,group.items.map(icon=>icon.key)]);
test('search preserves category order, overlapping categories, normalized words and numeric sorting',()=>{
  const index=createPickerCatalog(catalog,'default'),row={oldKey:'old'};
  assert.deepEqual(keys(index.options(row,'ОПЛ ёлк')),[['payments',['line']],['shared',['line']]]);
  assert.deepEqual(keys(index.options(row,'test')),[['numbers',['two','ten']]]);
  assert.deepEqual(keys(index.options(row,'other')),[['uncategorized',['other']]]);
  assert.deepEqual(index.options(row,'absent'),[]);
});
test('source identity and each source override are excluded even across repeated queries',()=>{
  const index=createPickerCatalog(catalog,'default'),row={oldKey:'line',sourceKeys:{a:'two',b:'other'}};
  assert.deepEqual(keys(index.options(row,'')),[['numbers',['ten']]]);
  assert.deepEqual(keys(index.options(row,'test')), [['numbers',['ten']]]);
  assert.deepEqual(keys(index.options({oldKey:'old'},'test')), [['numbers',['two','ten']]]);
});
test('service recommendations retain their names/IDs and do not mix with the remaining options',()=>{
  const index=createPickerCatalog(catalog,'services');
  const row={oldKey:'old',candidates:[{newKey:'two',serviceNames:['Тест ёлки'],serviceIds:['service-1']},{newKey:'ten',serviceNames:['Тест ёлки'],serviceIds:['selected-token']}]};
  assert.deepEqual(keys(index.options(row,'тест ёлк')),[['recommended',['two','ten']]]);
  assert.deepEqual(keys(index.options(row,'selected token')),[['recommended',['ten']]]);
  assert.deepEqual(keys(index.options(row,'other')),[['all',['other']]]);
});
