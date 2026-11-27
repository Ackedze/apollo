import React from 'react';
import { AuditMascot } from "./AuditMascot";
import { auditQuality } from "./result-groups";
type Category = { id: string; title: string; count: number | null; connected: boolean; entries: any[]; issues: any[]; incomplete: boolean };
export type ResultGroup = { id: string; title: string; description: string; count: number | null; connected: boolean; categories: Category[] };
export type ResultGroups = { groups: ResultGroup[]; theme: Category | null; baseCategories?: Category[]; total: number | null; stale: boolean; incomplete: boolean; coverageDetails?: {id:string;title:string;reason:string}[] };
export function AuditOverview({ progress, summary, busy, selectedScope, checkedScope, onOpen, onBase, resultId, newNavigation = false }: {
  progress: string; summary: ResultGroups; busy: boolean; selectedScope?: string; checkedScope: string; onOpen: (group: ResultGroup) => void; onBase: () => void; resultId?: string | null; newNavigation?: boolean;
}) {
  const visual = React.useRef<HTMLDivElement>(null);
  const mascotBounds = React.useRef<DOMRect | null>(null);
  const lastResultId = React.useRef(resultId);
  React.useLayoutEffect(() => {
    if (!newNavigation || !busy) return;
    const bounds = visual.current?.querySelector('.apollo-mascot-body')?.getBoundingClientRect();
    if (bounds?.width && bounds.height) mascotBounds.current = bounds;
  }, [busy, newNavigation, progress, selectedScope]);
  React.useLayoutEffect(() => {
    if (!newNavigation || busy) return;
    const isNewResult = !!resultId && resultId !== lastResultId.current;
    lastResultId.current = resultId;
    const origin = mascotBounds.current;
    mascotBounds.current = null;
    if (!isNewResult || !origin || summary.stale || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const tiles = Array.from(visual.current?.querySelectorAll<HTMLButtonElement>('.apollo-overview-tile') ?? []);
    const animations: Animation[] = [];
    const timing = { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' };
    for (const tile of tiles) {
      const bounds = tile.getBoundingClientRect();
      if (!bounds.width || !bounds.height || typeof tile.animate !== 'function') continue;
      const x = origin.left + origin.width / 2 - bounds.left - bounds.width / 2;
      const y = origin.top + origin.height / 2 - bounds.top - bounds.height / 2;
      animations.push(tile.animate([
        { transform: `translate3d(${x}px,${y}px,0) scale(.96)`, opacity: .52 },
        { offset: .3, opacity: 1 },
        { transform: 'none', opacity: 1 },
      ], timing));
      for (const label of Array.from(tile.children)) {
        animations.push(label.animate([
          { opacity: 0 }, { offset: .24, opacity: 0 }, { opacity: 1 },
        ], { duration: timing.duration, easing: 'ease-out' }));
      }
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [busy, newNavigation, resultId, summary.stale]);

  const theme = summary.theme, quality = auditQuality(summary, busy);
  const overviewGroups = summary.groups.filter(group => group.id !== 'patterns');
  const qualityLabel = busy ? 'Проверка выполняется' : summary.stale ? 'Предыдущий результат требует повторной проверки' : quality === 'unchecked' ? 'Проверка ещё не запускалась'
    : quality === 'clean' ? 'В проверенных данных нарушений нет' : quality === 'violation' ? 'Найдены нарушения' : summary.incomplete ? 'Проверка неполная' : 'Есть замечания, требующие проверки';
  const hasResult = summary.total !== null;
  const title = busy ? progress || 'Проверяем область…'
    : hasResult && summary.stale ? 'Нужно повторить проверку'
    : !hasResult ? (newNavigation ? 'Проверю шрифты, токены, темы и компоненты' : 'Давай проверим твой макет')
    : quality === 'clean' ? 'Всё в порядке'
    : summary.incomplete && summary.total === 0 ? 'Проверка неполная'
    : 'Нужно кое-что поправить';
  const scopeName = hasResult && !busy ? checkedScope || 'Проверенная область' : selectedScope;
  const description = <>
      <h2 className="apollo-overview-caption" role={busy ? 'status' : undefined}>{title}</h2>
      {(scopeName || !busy) && <p className="apollo-overview-scope">{scopeName || 'Выбери область и запусти проверку'}</p>}
      {summary.incomplete && !busy && <details className="apollo-overview-coverage">
        <summary>{summary.coverageDetails?.length ? `Не полностью проверены: ${summary.coverageDetails.map(item=>item.title).join(', ')}` : 'Есть непроверенные данные'}</summary>
        <ul>{summary.coverageDetails?.length ? summary.coverageDetails.map(item=><li key={item.id}><strong>{item.title}:</strong> {item.reason}</li>) : <li>Подробности доступны в соответствующих разделах результатов.</li>}</ul>
      </details>}
  </>;
  if (newNavigation) {
    const tiles = [
      ...(theme ? [{ id: 'base', title: 'База', count: theme.count, categories: [theme], open: onBase }] : []),
      ...overviewGroups.filter(group => group.connected).map(group => ({
        id: group.id, title: group.title, count: group.count, categories: group.categories, open: () => onOpen(group),
      })),
    ];
    return <section className="apollo-overview apollo-overview-redesign" aria-label="Обзор проверки">
      <div className="apollo-overview-total" ref={visual}>
        {hasResult && !busy ? <div className="apollo-overview-tiles" aria-label="Результаты проверки">
          {tiles.map(tile => {
            const hasViolation = tile.categories.some(category =>
              category.issues.some(issue => issue.classification === 'violation'));
            const tone = !tile.count ? 'neutral' : hasViolation ? 'critical' : 'attention';
            return <button key={tile.id} type="button" className="apollo-overview-tile" data-tone={tone}
              aria-haspopup="dialog" onClick={tile.open} aria-label={tile.title + ': ' + (tile.count ?? 0) + ' замечаний'}>
              <span className="apollo-overview-tile-count">{tile.count ?? 0}</span><span>{tile.title}</span>
            </button>;
          })}
        </div> : <AuditMascot checking={busy} quality={quality} label={qualityLabel} />}
        {description}
      </div>
    </section>;
  }
  return <section className="apollo-overview" aria-label="Обзор проверки">
    <div className="apollo-overview-total">
      <AuditMascot checking={busy} quality={quality} label={qualityLabel + (summary.total === null || busy ? '' : ` · замечаний: ${summary.total}`)} />
      {description}
    </div>
    {theme && <button className="apollo-base-result" disabled={!theme.count} onClick={onBase} type="button" aria-label={'База: ' + (theme.count === null ? 'проверка ещё не запускалась' : theme.count + ' замечаний')}>
      <span>База</span>
      {theme.count !== null && theme.count > 0 && <span className="apollo-group-count has-issues">{theme.count}</span>}
    </button>}
    <div className="apollo-overview-groups">
      {overviewGroups.map(group => <button key={group.id} type="button" className="apollo-overview-group" disabled={!group.connected || !group.count} onClick={() => onOpen(group)}
        aria-label={group.title + ': ' + (group.count === null ? 'проверка не подключена' : group.count + ' замечаний')}>
        <span className="apollo-overview-group-heading"><strong>{group.title}</strong>{group.count !== null && group.count > 0 && <span className="apollo-group-count has-issues">{group.count}</span>}</span>
        <span className="apollo-overview-group-description">{group.id === 'icons' ? group.description.split('\n').map((line,index)=><React.Fragment key={index}>{index>0&&<br/>}{line}</React.Fragment>) : group.id === 'styles' ? 'Детачи, переменные, устаревшие, кастомные стили и токены' : group.id === 'components' ? 'Детачи, локальные компоненты и нарушение правил применения' : group.description}</span>
      </button>)}
    </div>
  </section>;
}
