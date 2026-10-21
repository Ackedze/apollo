const { resourceKey, resourceId } = require("./resource-identity");
const {fieldKind}=require("./v3-binding/resource-labels");
function labelFor(metadata, kind, value) {
  const id = resourceId(kind, value);
  const rows = metadata?.schemaVersion === 'apollo.audit-display-metadata.v1' && Array.isArray(metadata.resources)
    ? metadata.resources.filter(row => row?.kind === kind && typeof row.id === 'string' && typeof row.name === 'string' && row.name.trim() && row.name.length <= 500) : [];
  const exact = rows.filter(row => row.id === id), key = resourceKey(kind, id);
  const native=rows.filter(r=>r.origin!=='catalog-export');
  const nativeMatches=native.filter(r=>r.id===id||key&&r.key===key);
  const matches = nativeMatches.length ? nativeMatches : exact.length ? exact : key ? rows.filter(row => row.key === key) : [];
  const catalogMatches=rows.filter(r=>r.origin==='catalog-export'&&(r.id===id||key&&r.key===key));
  if(nativeMatches.length&&catalogMatches.some(c=>nativeMatches.some(n=>n.name!==c.name||n.collectionName&&c.collectionName&&n.collectionName!==c.collectionName)))return null;
  const labels = Array.from(new Set(matches.map(row => row.name + (typeof row.collectionName === 'string' && row.collectionName ? ` · ${row.collectionName}` : ''))));
  return labels.length === 1 ? labels[0] : null;
}
function readableResource(metadata, kind, id) {
  if (!id) return kind === 'token' ? 'Нет привязки к токену' : 'Стиль не применён';
  const label = labelFor(metadata, kind, id);
  if(!label){const key=resourceKey(kind,id),rows=metadata?.resources||[],native=rows.filter(r=>r.kind===kind&&r.origin!=='catalog-export'&&(r.id===resourceId(kind,id)||key&&r.key===key)),catalog=rows.filter(r=>r.kind===kind&&r.origin==='catalog-export'&&r.key===key);if(native.length&&catalog.some(c=>native.some(n=>n.name!==c.name||n.collectionName&&c.collectionName&&n.collectionName!==c.collectionName)))return `${kind==='token'?'Токен':'Стиль'} · названия в документе и каталоге различаются`;}
  if(!label&&metadata?.catalogStates?.some(r=>r.kind===kind&&r.key===resourceKey(kind,id)&&r.state==='ambiguous'))return `${kind==='token'?'Токен':'Стиль'} · название неоднозначно`;
  return label ? `${kind === 'token' ? 'Токен' : 'Стиль'}: ${label}` : `${kind === 'token' ? 'Токен привязан' : 'Стиль применён'} · название недоступно`;
}
function percent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number((value * 100).toFixed(2)).toString().replace('.', ',')}%` : 'нет данных';
}
function hex(color, normalized = false) {
  return color && ['r', 'g', 'b'].every(key => typeof color[key] === 'number' && Number.isFinite(color[key]))
    ? '#' + ['r', 'g', 'b'].map(key => Math.round(color[key] * (normalized ? 255 : 1)).toString(16).padStart(2, '0')).join('').toUpperCase() : '';
}
function findingDisplaySummary(value, detail, metadata, depth=0) {
  if(depth>16)return null;
  const modeKey = /^variable\.modes\.([a-f0-9]{40})$/i.exec(detail.factPath || '')?.[1]?.toLowerCase();
  if (modeKey) {
    const label = id => modeLabel(metadata, modeKey, id) || `Режим ${id}`;
    if (typeof value === 'string') return label(value);
    if (Array.isArray(value) && value.every(id => typeof id === 'string')) return value.map(label).join(', ');
  }
  if(Array.isArray(value)&&value.length&&value.every(v=>Array.isArray(v))){const options=value.map(v=>findingDisplaySummary(v,detail,metadata,depth+1));if(options.every(Boolean))return options.map((v,i)=>options.length===1?v:`Вариант ${i+1}\n${v}`).join("\n\n");}
  const path = detail.factPath || '',kind=fieldKind(path);
  if(kind&&typeof value==='string')return readableResource(metadata,kind,value);
  if(kind&&Array.isArray(value)&&value.every(v=>typeof v==='string'))return value.length?value.map(v=>readableResource(metadata,kind,v)).join('\n'):kind==='token'?'Нет привязки к токену':'Стиль не применён';
  if(value&&typeof value==='object'&&Array.isArray(value.styleKeys)&&value.styleKeys.every(v=>typeof v==='string'))return value.styleKeys.length?value.styleKeys.map(v=>readableResource(metadata,'style',v)).join('\n'):'Стиль не применён';
  if (/styleId$/i.test(path) && typeof value === 'string') return readableResource(metadata, 'style', value);
  if (value && typeof value === 'object' && typeof value.styleId === 'string') return readableResource(metadata, 'style', value.styleId);
  if (typeof value === 'string' && (value.startsWith('VariableID:') || path.startsWith('variable.bindings.'))) return readableResource(metadata, 'token', value);
  if (value && !Array.isArray(value) && typeof value === 'object' && Array.isArray(value.tokenIds)) {
    if (!value.tokenIds.every(id => typeof id === 'string')) return null;
    return value.tokenIds.length ? value.tokenIds.map(id => readableResource(metadata, 'token', id)).join('\n') : 'Нет привязки к токену';
  }
  if (!['appearance.fill', 'appearance.stroke'].includes(path) || !Array.isArray(value) || !value.length
    || !value.every(paint => paint && typeof paint.type === 'string')) return null;
  const types = { SOLID: 'Цвет', GRADIENT_LINEAR: 'Линейный градиент', GRADIENT_RADIAL: 'Радиальный градиент', GRADIENT_ANGULAR: 'Угловой градиент', GRADIENT_DIAMOND: 'Ромбовидный градиент', IMAGE: 'Изображение', VIDEO: 'Видео' };
  return value.map((paint, index) => {
    const lines = [`${value.length > 1 ? `${index + 1}. ` : ''}${types[paint.type] || paint.type}${hex(paint.color) ? ' · ' + hex(paint.color) : ''}`];
    if (paint.type.startsWith('GRADIENT_')) {
      if (Array.isArray(paint.gradientStops)) for (const [i, stop] of paint.gradientStops.entries()) {
        lines.push(`Точка ${i + 1} · ${percent(stop.position)} · ${hex(stop.color, true) || 'цвет не получен'}`);
        if (typeof stop.tokenId === 'string') lines.push(readableResource(metadata, 'token', stop.tokenId));
        if (typeof stop.color?.a === 'number') lines.push(`Непрозрачность цвета: ${percent(stop.color.a)}`);
      } else lines.push('Точки градиента не получены');
      if (paint.gradientTransform) lines.push('Положение градиента — во всех параметрах');
    } else if (paint.type === 'SOLID') lines.push(readableResource(metadata, 'token', typeof paint.tokenId === 'string' ? paint.tokenId : null));
    if (typeof paint.opacity === 'number') lines.push(`Непрозрачность: ${percent(paint.opacity)}`);
    if (paint.visible === false) lines.push('Скрыта');
    return lines.join('\n');
  }).join('\n\n');
}
function modeCollectionLabel(metadata, key) {
  const rows = metadata?.modeCollections?.filter(row => row.key === key && typeof row.name === 'string' && row.name.trim()) || [];
  const names = [...new Set(rows.map(row => row.name))];
  return names.length === 1 ? names[0] : null;
}
function modeLabel(metadata, key, id) {
  if (!modeCollectionLabel(metadata, key)) return null;
  const names = [...new Set(metadata.modeCollections.filter(row => row.key === key).flatMap(row => row.modes || [])
    .filter(mode => mode.modeId === id && typeof mode.name === 'string' && mode.name.trim()).map(mode => mode.name))];
  return names.length === 1 ? names[0] : null;
}
function findingCompactValue(value, detail, metadata) {
  if(detail.factPath==='appearance.typography' && typeof value?.styleId==='string') {
    const label=labelFor(metadata,'style',value.styleId);
    return label ? label.replace(/\s*\(Typography\.[^)]*\)\s*$/,'') : readableResource(metadata,'style',value.styleId);
  }
  if (!['appearance.fill','appearance.stroke'].includes(detail.factPath) || !Array.isArray(value) || !value.length || !value.every(p => p?.type === 'SOLID')) return findingDisplaySummary(value, detail, metadata);
  return value.map(paint => {
    const name = paint.tokenId && labelFor(metadata, 'token', paint.tokenId);
    const text = name ? name.split(' · ')[0] : hex(paint.color) || 'Цвет не получен';
    const other = (value===detail.expected?detail.actual:detail.expected);
    const namesExplainChange = value.length===1 && other?.length===1 && name && other[0]?.tokenId && labelFor(metadata,'token',other[0].tokenId) && labelFor(metadata,'token',other[0].tokenId).split(' · ')[0]!==text;
    return text + (!namesExplainChange && typeof paint.opacity === 'number' && paint.opacity !== 1 ? ` · ${percent(paint.opacity)}` : '') + (paint.visible === false ? ' · скрыта' : '');
  }).join(', ');
}
module.exports = { findingDisplaySummary, findingCompactValue, modeCollectionLabel, readableResource, labelFor, percent };
