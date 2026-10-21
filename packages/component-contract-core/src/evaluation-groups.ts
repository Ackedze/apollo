import type { EvaluationDetail } from './evaluation-view';
import { stableStringify } from './stable';

/** Presentation only. Engine evaluations, coverage and exported details stay raw. */
export type EvaluationGroup = EvaluationDetail & { evaluations: EvaluationDetail[] };

const severityRank: Record<string, number> = { info: 0, warning: 1, error: 2 };

export function groupEvaluationDetails(details: EvaluationDetail[]): EvaluationGroup[] {
  const groups: EvaluationGroup[] = [];
  const byDifference = new Map<string, EvaluationGroup>();
  for (const detail of details) {
    // Only atomic effective-baseline diffs are known equivalent here. Never fold
    // missing evidence, applicability, compound constraints or competing expectations.
    const canGroup = detail.classification === 'violation' && Boolean(detail.nodeId && detail.factPath)
      && detail.reason === 'actual value differs from effective baseline'
      && detail.showComparison && !detail.scopeMismatch
      && detail.actual !== undefined && detail.expected !== undefined
      && Object.prototype.hasOwnProperty.call(severityRank, detail.severity);
    const key = canGroup ? stableStringify({
      nodeId: detail.nodeId, nodePath: detail.nodePath, factPath: detail.factPath,
      actual: detail.actual, expected: detail.expected, reason: detail.reason,
      actualLabel: detail.actualLabel, expectedLabel: detail.expectedLabel,
      comparisonSymbol: detail.comparisonSymbol,
    }) : '';
    const existing = key ? byDifference.get(key) : undefined;
    if (existing) {
      existing.evaluations.push(detail);
      if (severityRank[detail.severity] > severityRank[existing.severity]) existing.severity = detail.severity;
    } else {
      const group = { ...detail, evaluations: [detail] };
      groups.push(group);
      if (key) byDifference.set(key, group);
    }
  }
  return groups;
}
