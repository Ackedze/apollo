import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FindingCard, FindingComparison } from "./FindingCard";
import { buildFindingDetails, formatFindingValue } from "../finding-details";
import { findingDisplaySummary, findingCompactValue, modeCollectionLabel } from "../finding-display";
import { compactFindingDetails } from "../finding-presentation";
import { componentLibrary } from "./finding-library";

const roots = new WeakMap<HTMLElement, Root>();
function readable(value: unknown, detail: any, metadata: any) {
  const text = findingCompactValue(value, detail, metadata) || formatFindingValue(value, detail);
  return /^[\[{]/.test(text.trim()) && typeof value === 'object' ? 'Составное значение — в сведениях' : text.replace(/\n+/g,' · ');
}
function property(detail: any, metadata: any) {
  const modeKey = /^variable\.modes\.([a-f0-9]{40})$/i.exec(detail.factPath)?.[1]?.toLowerCase();
  return modeKey ? `Режим · ${modeCollectionLabel(metadata, modeKey) || 'коллекция без названия'}` : detail.property;
}
function compactPaint(detail: any) {
  return ['appearance.fill','appearance.stroke'].includes(detail.factPath) && [detail.expected,detail.actual].every(value => Array.isArray(value) && value.length && value.every(paint => paint?.type === 'SOLID'));
}
function hiddenPaintDifference(detail: any, metadata: any) {
  return compactPaint(detail) && readable(detail.expected,detail,metadata) === readable(detail.actual,detail,metadata) && JSON.stringify(detail.expected) !== JSON.stringify(detail.actual);
}
export function ContractFindings({ data, focusClient }: { data: any; focusClient: any }) {
  const rules = new Map(data.rules.map((rule: any) => [`${rule.componentScopeId || ''}:${rule.ruleId}`, rule]));
  return <>{data.audit.result.engine.evaluations.filter((entry: any) => !['compliant','allowed','not-applicable'].includes(entry.classification)).map((entry: any) => {
    const rule: any = rules.get(`${entry.componentScopeId || ''}:${entry.ruleId}`), details = buildFindingDetails(entry, rule), compactDetails = compactFindingDetails(entry, rule, data.audit.findingPresentation);
    const targets = focusClient.targets(entry.evaluationId), gaps = focusClient.gaps(entry.evaluationId);
    const stale = data.staleScopeIds?.includes(entry.componentScopeId) === true;
    const name = entry.componentScopeName || entry.focusNodeName || entry.subjectNodeName || 'Объект проверки';
    return <FindingCard key={entry.evaluationId} title={rule?.title || (entry.classification === 'violation' ? 'Нарушение правила компонента' : 'Требуется проверка правила компонента')}
      tone={entry.classification === 'violation' ? 'violation' : 'warning'}
      library={componentLibrary(data.audit, entry.componentScopeId)}
      location={targets.length ? <button type="button" data-audit-focus data-finding-focus disabled={stale} title={`Найти в макете: ${name}`}
        aria-label={`Найти в макете: ${name}`} onClick={() => focusClient.focus(entry.evaluationId, targets[0].id)}>{name}</button> : <span>{name}</span>}
      information={<>
        <p className="apollo-rule-identity">{entry.ruleId}</p>
        {details.map((detail: any, index: number) => <div key={index}><p className="apollo-rule-identity">{detail.factPath}</p>
          {[['Эталон / требование',detail.expected],['В макете',detail.actual]].map(([label,value], i) => <section key={i}><h3>{String(label)}</h3>
            <p>{hiddenPaintDifference(detail,data.displayMetadata) ? formatFindingValue(value,detail) : findingDisplaySummary(value,detail,data.displayMetadata) || formatFindingValue(value,detail)}</p></section>)}
          {detail.note && <p>{detail.note}</p>}</div>)}
      </>}>
      {compactDetails.map((detail: any, index: number) => <div key={index}>
        <FindingComparison property={compactPaint(detail) ? 'Цвет' : property(detail,data.displayMetadata)} separator=":" before={readable(detail.expected,detail,data.displayMetadata)} after={readable(detail.actual,detail,data.displayMetadata)} beforeLabel={detail.expectedLabel} afterLabel={detail.actualLabel} />
        {detail.context && <p className="apollo-finding-note">{detail.context}</p>}
        {hiddenPaintDifference(detail,data.displayMetadata) && <p className="apollo-finding-note">Цвет совпадает. Привязки и параметры — в сведениях проверки.</p>}
      </div>)}
      {!details.length && <p className="apollo-finding-note">Нет подтверждённых данных для сравнения.</p>}
      {stale && <p className="apollo-finding-warning" role="status">Предыдущее нарушение сохранено: перепроверка этого компонента не завершена. Его актуальность не подтверждена.</p>}
      {!targets.length && <p className="apollo-finding-warning">Нет подтверждённой связи с объектом нарушения. Нужен новый захват точного слоя.</p>}
      {!!gaps.length && <p className="apollo-finding-warning">Часть объектов не связана с захваченными слоями или достигнут лимит переходов. Доступны только подтверждённые объекты.</p>}
    </FindingCard>;
  })}</>;
}
export function renderContractFindings(container: HTMLElement, data: any, focusClient: any) {
  let root = roots.get(container);
  if (!root) { root = createRoot(container); roots.set(container,root); }
  root.render(<ContractFindings data={data} focusClient={focusClient} />);
}
