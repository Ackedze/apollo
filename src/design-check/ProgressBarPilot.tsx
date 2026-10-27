import React, { useSyncExternalStore } from 'react';
import { FindingCard } from './FindingCard';
import { AuditMascot } from './AuditMascot';
import './progressbar-pilot.css';

const labels: Record<string, string> = { compliant: 'Соответствует', violation: 'Нарушение', 'insufficient-data': 'Недостаточно данных', 'not-applicable': 'Неприменимо' };
type PilotState = { phase: string; busy: boolean; message: string; error: string; report: any; capture: any };
export function ProgressBarPilot({ client, blocked = false }: { client: any; blocked?: boolean }) {
  const state = useSyncExternalStore<PilotState>(client.subscribe, client.getState), report = state.report;
  const stale = state.phase !== 'complete';
  return <section className="apollo-progressbar-pilot" aria-label="Агентская проверка ProgressBar">
    <h2>ProgressBar · Goal / Limit</h2>
    <p className="apollo-progressbar-caption">Агент проверяет смысловой выбор компонента по выделенной области, скриншоту и подключённым нормам.</p>
    <button type="button" className="apollo-progressbar-start" disabled={state.busy || blocked} onClick={() => void client.start()}>{state.busy ? 'Проверяем ProgressBar…' : report ? 'Перепроверить ProgressBar' : 'Проверить ProgressBar'}</button>
    {state.busy && <div className="apollo-progressbar-progress"><AuditMascot checking /><p role="status">{state.message}</p></div>}
    {!state.busy && state.message && <p role="status">{state.message}</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {report && <>
      {stale && <p className="apollo-progressbar-caption">Показан предыдущий агентский отчёт. Для актуального результата повторите проверку.</p>}
      <p className="apollo-progressbar-caption">Версия знаний: {report.knowledge.contentVersion}. Эта проверка не входит в результаты детерминированных правил.</p>
      {!report.assessments.length && <p>Подключённые ProgressBar Goal / Limit в выбранной области не найдены.</p>}
      {report.assessments.map((item: any) => {
        const node = state.capture?.nodes.find((n: any) => n.id === item.nodeId), focus = <button type="button" data-finding-focus disabled={stale || blocked || state.busy} onClick={() => void client.focus(item.nodeId)}>Показать в макете</button>;
        if (item.outcome === 'not-applicable') return <article key={item.nodeId} className="apollo-progressbar-not-applicable"><h3>{labels[item.outcome]}</h3><p>{item.reason}</p>{focus}</article>;
        return <FindingCard key={item.nodeId} title={labels[item.outcome]} tone={item.outcome === 'violation' ? 'violation' : item.outcome === 'compliant' ? 'current' : 'warning'}
          location={<span title={item.nodeId}>{node?.name || item.nodeId} · {item.nodeId}</span>} library="Web :: Corp Presets" actions={focus}
          information={<><p>{item.observation}</p><h3>Правила</h3>{item.ruleResults.map((rule: any) => <p key={rule.ruleId}>{rule.ruleId} · {labels[rule.outcome]}<br />{rule.reason}</p>)}<h3>Источники</h3>{item.sourceRefs.map((source: any) => <p key={source.sourceId + source.ruleId}>{report.sources.find((s: any) => s.sourceId === source.sourceId)?.path}<br />{source.sha256}</p>)}</>}>
          <p>{item.reason}</p>
        </FindingCard>;
      })}
      {report.usage && <p className="apollo-progressbar-caption">{report.usage.provider} · {Math.round(report.usage.durationMs / 1000)} с · Токены: {report.usage.actualInputTokens ?? 'нет данных'} вход / {report.usage.actualOutputTokens ?? 'нет данных'} выход</p>}
    </>}
  </section>;
}
