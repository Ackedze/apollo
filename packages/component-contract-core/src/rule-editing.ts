import type { Applicability, ManualSource, ManualRule, TypedConstraint, ValidationIssue } from './types';
import { validateManualSource } from './validator';

/** Validate the candidate, not unrelated imported rules; never mutate manual. */
export function validateRuleEdit(manual: ManualSource, rule: ManualRule, editingId: string | null): ValidationIssue[] {
  const rules = manual.rules.slice();
  const existing = editingId ? rules.findIndex((entry) => entry.id === editingId) : -1;
  const index = existing < 0 ? rules.length : existing;
  rules[index] = rule;
  if (rule.status !== 'reviewed') return [];
  const issues = validateManualSource({ ...manual, rules }).filter((issue) => (
    issue.level === 'error' && (issue.path.startsWith(`/rules/${index}/`)
      || (issue.code === 'RULE_DUPLICATE' && rules.some((entry, i) => i !== index && entry.id === rule.id)))
  ));
  if (manual.metadata.ruleOwnershipVersion === 1 && !rule.ownership) issues.push({
    level:'error', code:'RULE_OWNERSHIP_REQUIRED', path:`/rules/${index}/ownership`, message:'Reviewed edit requires explicit normative ownership.',
  });
  return issues;
}

export function validationIssueLabel(issue: Pick<ValidationIssue, 'code' | 'message'>): string {
  const labels: Record<string, string> = {
    RULE_RATIONALE: 'Заполните обоснование (Rationale) для reviewed-правила.',
    RULE_OWNERSHIP_REQUIRED: 'Укажите, кому принадлежит требование: компоненту, продукту, паттерну или редакционной политике.',
    RULE_OWNERSHIP: 'Выберите тип владельца и его ID. Для компонента ID должен совпадать с componentId пакета.',
    RULE_PROPERTY_APPLICABILITY: 'Условие применимости должно соответствовать сравнению strokeWeight или itemSpacing с baseline в этом правиле.',
    RULE_BOUNDARY_POLICY: 'Граница контракта применима только к рекурсивному сравнению с baseline при объявленных component dependencies.',
    RULE_TARGET_APPLICABILITY: 'Условие видимости применимо только к сравнению стилей с baseline, не к presence/visibility и другим требованиям.',
    RULE_SCOPE_UNCONFIRMED: 'Подтвердите область действия правила (Scope status).',
    RULE_VALIDATION_MODE: 'Выберите «В обоих режимах» или «Только по спецификации».',
    RULE_CONTEXT_UNMAPPED: 'Контекст ещё не связан с runtime-данными. Выберите Context only до настройки связи.',
    RULE_DELEGATION: 'Укажите External Rule IDs для делегированного правила.',
    RULE_CONTEXT_FACTS: 'Укажите недостающие данные в Missing facts.',
    RULE_DUPLICATE: 'Rule ID уже используется другим правилом.',
    RULE_CAPABILITY: 'Выберите свойство или группу свойств.',
    CONSTRAINT_VALUES: 'Укажите хотя бы одно допустимое значение.',
    CONSTRAINT_RANGE: 'Укажите минимум или максимум.',
    CONSTRAINT_ORDER: 'Укажите порядок семантических ролей.',
    CONSTRAINT_ORDER_SCOPE: 'Для порядка выберите видимые части или все части, включая скрытые.',
    CONSTRAINT_RELATION: 'Укажите связь и целевую роль.',
    CONSTRAINT_TOKEN: 'Укажите токены или обязательность привязки.',
    CONSTRAINT_BINDING_CONSISTENCY: 'Выберите root, «С условиями», тип привязки и уникальные роли текстовых частей. Для эталона варианта доступен только Text Style.',
  };
  return labels[issue.code] || issue.message;
}

/** Preserve imported conditions for which the current form has no editor yet. */
export function mergeEditedApplicability(
  previous: Applicability | undefined,
  edited: Applicability,
): Applicability {
  return { ...previous, ...edited };
}

/** The forbidden form does not edit constraints: retain assertions when capabilities are unchanged. */
export function forbiddenConstraintsForEdit(
  previous: ManualRule | undefined,
  next: Pick<ManualRule, 'capability' | 'capabilitySet' | 'capabilitySelection'>,
  fallback: TypedConstraint[],
): TypedConstraint[] {
  const selection = (v: string[] | undefined) => JSON.stringify(v ? [...v].sort() : null);
  if (previous?.permission === 'forbidden'
    && previous.capability === next.capability
    && previous.capabilitySet === next.capabilitySet
    && selection(previous.capabilitySelection) === selection(next.capabilitySelection)) {
    return JSON.parse(JSON.stringify(previous.constraints)) as TypedConstraint[];
  }
  return fallback;
}
