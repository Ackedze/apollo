const WIRE = 'apollo.task-passport.v1';
const MAX_BRIEF = 8000;
const SOURCE = { brief:'Из брифа', layout:'Из макета', hypothesis:'Гипотеза — подтвердите', missing:'Нужно заполнить', none:'' };
const BRIEF_HINTS = [
  'Это новая фича, доработка или редизайн?',
  'Какую задачу бизнеса решает флоу?',
  'Откуда пользователь приходит и что видит до флоу?',
  'Что пользователь может потерять или в чём его ограничивают?',
  'Какие условия и исключения нужно учесть?',
];
const PLACEHOLDER = 'Доработка: …\nЦель бизнеса: …\nПользователь приходит из…\nМожет потерять… / Ограничения…\nУсловия и исключения…';
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
const list = (value, max, test) => Array.isArray(value) && value.length > 0 && value.length <= max && value.every(test);

function briefError(brief) {
  return brief.trim().length > MAX_BRIEF ? 'Сократите бриф до 8 000 символов.' : '';
}

function resultValid(value) {
  if (value?.status === 'brief_insufficient') return list(value.questions, 32, question => text(question,500));
  return value?.status === 'draft' && list(value.sections, 7, section =>
    text(section?.title, 80) && list(section.rows, 5, row =>
      text(row?.label, 100) && list(row.items, 180, item =>
        text(item?.value, 1200) && typeof item.source === 'string' && Object.prototype.hasOwnProperty.call(SOURCE,item.source) &&
        (item.screen === null || text(item.screen,240)) && (item.quote === null || text(item.quote,400)))));
}

function itemSource(item) {
  return [item.source === 'missing' ? '' : SOURCE[item.source], item.screen].filter(Boolean).join(' · ');
}

function passportCsv(result) {
  if (!resultValid(result) || result.status !== 'draft') throw Error('Паспорт недоступен.');
  const field = value => {
    // Keep copied briefs and layer names literal when a spreadsheet opens the CSV.
    const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return '\ufeff' + [['Раздел','Пункт','Значение','Источник','Цитата'], ...result.sections.flatMap(section =>
    section.rows.flatMap(row => row.items.map(item => [
      section.title, row.label, item.value, itemSource(item) || SOURCE[item.source], item.quote || '',
    ])))].map(line => line.map(field).join(',')).join('\r\n');
}

module.exports = { WIRE, MAX_BRIEF, BRIEF_HINTS, PLACEHOLDER, briefError, resultValid, itemSource, passportCsv };
