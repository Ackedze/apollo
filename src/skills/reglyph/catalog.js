'use strict';
function pickerRepresentatives(icons) {
  const families = new Map();
  const rank = icon => [icon.properties?.Style === 'Line' ? 0 : 1,icon.properties?.Color === 'False' ? 0 : 1,Math.abs((icon.width || 24)-24)+Math.abs((icon.height || 24)-24)];
  const compare = (a,b) => {const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return a.key.localeCompare(b.key);};
  for (const icon of icons) {const id=icon.familyId || icon.key,previous=families.get(id);if(!previous || compare(icon,previous)<0)families.set(id,icon);}
  return Array.from(families.values());
}
const searchText = value => String(value || '').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const rowIdentity = row => row.rowId || row.oldKey;
const reviewGroup = row => (row.outsideCatalog && !row.verifiedCurrency) || row.category === 'unknown' ? 'unknown' : row.category === 'unused' ? 'unused' : new Set((row.candidates || []).map(c=>c.newKey)).size>1 ? 'ambiguous' : row.newKey ? 'ready' : 'unresolved';

// Immutable catalogue work is shared by preview warmup and every search.
function createPickerCatalog(catalog, scenario) {
  const representatives = scenario === 'services' ? catalog.newIcons : pickerRepresentatives(catalog.newIcons);
  const compare = new Intl.Collator('ru', {sensitivity:'base', numeric:true}).compare;
  const sorted = representatives.slice().sort((a,b) => compare(a.baseName || a.name, b.baseName || b.name));
  const text = new Map(sorted.map(icon => [icon.key, searchText([icon.name, icon.baseName, icon.searchDescription].join(' '))]));
  const categories = (catalog.iconCategories || []).map(category => Object.assign({}, category, {families:new Set(category.familyIds)}));
  return {representatives, options(row, query) {
    const words = searchText(query).split(' ').filter(Boolean), excluded = new Set([row.oldKey, ...Object.values(row.sourceKeys || {})]);
    const suggestions = new Map((row.candidates || []).map(candidate => [candidate.newKey, candidate]));
    const matches = sorted.filter(icon => {
      if (excluded.has(icon.key)) return false;
      const suggestion = suggestions.get(icon.key);
      const searchable = suggestion ? text.get(icon.key) + ' ' + searchText([...(suggestion.serviceNames || []), ...(suggestion.serviceIds || [])].join(' ')) : text.get(icon.key);
      return words.every(word => searchable.includes(word));
    });
    if (scenario === 'services' && suggestions.size > 1) return [
      {id:'recommended', name:'Рекомендованные иконки', items:matches.filter(icon => suggestions.has(icon.key))},
      {id:'all', name:'Все иконки', items:matches.filter(icon => !suggestions.has(icon.key))}
    ].filter(group => group.items.length);
    if (scenario !== 'services' && categories.length) {
      const covered = new Set(), groups = categories.map(category => {
        const items = matches.filter(icon => category.families.has(icon.familyId));
        items.forEach(icon => covered.add(icon.key));
        return {id:category.id, name:category.name, items};
      }).filter(group => group.items.length);
      const items = matches.filter(icon => !covered.has(icon.key));
      if (items.length) groups.push({id:'uncategorized', name:'Без категории', items});
      return groups;
    }
    return [{id:'all', name:'', items:matches}];
  }};
}
module.exports = {createPickerCatalog, pickerRepresentatives, searchText, rowIdentity, reviewGroup};
