import React from 'react';
import {FindingInformation} from '../design-check/FindingCard';
import assets from '../design-check/assets/finding-assets.json';
import {ResultCard} from '../design-check/v3/ui-app/components/ResultCard';
import {ResultSubCard} from '../design-check/v3/ui-app/components/ResultSubCard';
import {SmallButton} from '../design-check/v3/ui-app/components/SmallButton';
import './text-review-table.css';

type TextFact = {node: {id: string; name?: string}; text: string};
type ReviewFinding = {
  nodeId: string;
  priority: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  replacement: string | null;
  sources: {path: string; ruleId: string}[];
};

const labels = {error: 'Нарушение', warning: 'Правка', info: 'Уточнение'};

export function TextReviewTable({findings, facts, coverageGaps, canFocus, focus}: {
  findings: ReviewFinding[];
  facts: TextFact[];
  coverageGaps: string[];
  canFocus: (nodeId: string) => boolean;
  focus: (nodeId: string) => void;
}) {
  const byId = new Map(facts.map(fact => [fact.node.id, fact]));
  return <>
    {coverageGaps.length > 0 && <details className="design-check-note">
      <summary>Часть правил не проверена</summary>
      <ul>{coverageGaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
    </details>}
    {findings.length === 0 ? <p className="design-check-note">
      {coverageGaps.length ? 'По доступным правилам замечаний нет.' : 'Замечаний нет.'}
    </p> : <section className="apollo-findings apollo-v3-findings" aria-label="Замечания к текстам">
      {findings.map(finding => {
        const fact = byId.get(finding.nodeId);
        const label = fact?.node.name || 'Текстовый слой';
        const focusLayer = () => focus(finding.nodeId);
        const focusAvailable = canFocus(finding.nodeId);
        const violation = finding.priority === 'error';
        return <ResultCard key={finding.nodeId} title={label} onFocus={focusAvailable ? focusLayer : undefined}
          indicator={<span className={`apollo-finding-status ${violation ? 'violation' : 'warning'}`} aria-hidden="true">
            <img src={violation ? assets.imgStatusCircle : assets.imgStatusWarning} width={36} height={36} alt="" />
          </span>}
          actions={<>
            {finding.sources.length > 0 && <FindingInformation label="Источники">
              <ul className="apollo-text-review-sources">{finding.sources.map(source =>
                <li key={source.path + ':' + source.ruleId}><strong>{source.ruleId}</strong>
                  <p className="apollo-rule-identity">{source.path}</p>
                </li>)}</ul>
            </FindingInformation>}
            <SmallButton focusTarget ariaLabel={'Показать в макете: ' + label} title="Показать в макете"
              disabled={!focusAvailable} onPress={focusLayer} icon={<svg viewBox="0 0 16 16" width={16} height={16} fill="none" aria-hidden="true">
                <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>} />
          </>}>
          <ResultSubCard name={finding.message}>
            <p className={`apollo-v3-finding-message ${violation ? 'is-violation' : 'is-warning'}`}>{labels[finding.priority]} · {finding.category}</p>
            {(fact || finding.replacement !== null) && <dl className="apollo-text-review-values">
              {fact && <><dt>Исходный текст</dt><dd>{fact.text}</dd></>}
              {finding.replacement !== null && <><dt>Предложение</dt><dd>{finding.replacement}</dd></>}
            </dl>}
          </ResultSubCard>
        </ResultCard>;
      })}
    </section>}
  </>;
}
