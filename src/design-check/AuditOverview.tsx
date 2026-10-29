import React from 'react';
import type { ControllerState } from "./controller";
import { AuditMascot } from "./AuditMascot";
import { auditQuality } from "./result-groups";
type Category = { id: string; title: string; count: number | null; connected: boolean; entries: any[]; issues: any[]; incomplete: boolean };
export type ResultGroup = { id: string; title: string; description: string; count: number | null; connected: boolean; categories: Category[] };
export type ResultGroups = { groups: ResultGroup[]; theme: Category | null; total: number | null; stale: boolean; incomplete: boolean; coverageDetails?: {id:string;title:string;reason:string}[] };
export function AuditOverview({ state, summary, busy, checkedScope, onOpen, onBase }: {
  state: ControllerState; summary: ResultGroups; busy: boolean; checkedScope: string; onOpen: (group: ResultGroup) => void; onBase: () => void;
}) {
  const theme = summary.theme, quality = auditQuality(summary, busy);
  const qualityLabel = busy ? 'Проверка выполняется' : summary.stale ? 'Предыдущий результат требует повторной проверки' : quality === 'unchecked' ? 'Проверка ещё не запускалась'
    : quality === 'clean' ? 'В проверенных данных нарушений нет' : quality === 'violation' ? 'Найдены нарушения' : summary.incomplete ? 'Проверка неполная' : 'Есть замечания, требующие проверки';
  return <section className="apollo-overview" aria-label="Обзор проверки">
    <div className="apollo-overview-total">
      <AuditMascot checking={busy} quality={quality} label={qualityLabel + (summary.total === null || busy ? '' : ` · замечаний: ${summary.total}`)} />
      <p className="apollo-overview-caption" role={busy ? 'status' : undefined}>{busy ? state.auditProgress || 'Проверяем область…' : summary.total === null ? 'Выбери область и нажми Проверить' : checkedScope || 'Проверенная область'}</p>
      {summary.incomplete && !busy && <details className="apollo-overview-coverage">
        <summary>{summary.coverageDetails?.length ? `Не полностью проверены: ${summary.coverageDetails.map(item=>item.title).join(', ')}` : 'Есть непроверенные данные'}</summary>
        <ul>{summary.coverageDetails?.length ? summary.coverageDetails.map(item=><li key={item.id}><strong>{item.title}:</strong> {item.reason}</li>) : <li>Подробности доступны в соответствующих разделах результатов.</li>}</ul>
      </details>}
    </div>
    {theme && <button className="apollo-base-result" onClick={onBase} type="button" aria-label={'База: ' + (theme.count === null ? 'проверка ещё не запускалась' : theme.count + ' замечаний')}>
      <span>База</span>
      {theme.count !== null && theme.count > 0 && <span className="apollo-group-count has-issues">{theme.count}</span>}
    </button>}
    <div className="apollo-overview-groups">
      {summary.groups.map(group => <button key={group.id} type="button" className="apollo-overview-group" onClick={() => onOpen(group)}
        aria-label={group.title + ': ' + (group.count === null ? 'проверка не подключена' : group.count + ' замечаний')}>
        <span className="apollo-overview-group-heading"><strong>{group.title}</strong>{group.count !== null && group.count > 0 && <span className="apollo-group-count has-issues">{group.count}</span>}</span>
        <span className="apollo-overview-group-description">{group.id === 'styles' ? 'Детачи, переменные, устаревшие, кастомные стили и токены' : group.id === 'components' ? 'Детачи, локальные компоненты и нарушение правил применения' : 'Ошибки применения компонентных и проектировочных паттернов'}</span>
      </button>)}
    </div>
  </section>;
}
