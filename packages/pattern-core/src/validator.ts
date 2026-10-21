import { PatternSchema, type PatternContract, type Conditions, type Issue } from './schema';
import { domain, enumerate, matches, MAX_CONTEXT_CASES } from './finite-domain';

export type ValidationResult = { valid: boolean; issues: Issue[]; pattern?: PatternContract };
export function validatePattern(input: unknown): ValidationResult {
  const parsed = PatternSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => ({
    level: 'error', code: 'STRUCTURE', path: '/' + issue.path.join('/'), message: issue.message,
  })) };
  const p = parsed.data, issues: Issue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ level: 'error', code, path, message });
  const warning = (code: string, path: string, message: string) => issues.push({ level: 'warning', code, path, message });
  function unique(ids: string[], path: string) {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) error('DUPLICATE_ID', path, `Duplicate ID: ${id}`); seen.add(id); }
  }
  for (const [name, records] of Object.entries({ sources: p.sources, fields: p.context.fields,
    decisionTables: p.decisionTables, outcomes: p.outcomes, compositions: p.compositions,
    states: p.scenario.states, events: p.scenario.events, transitions: p.scenario.transitions,
    constraints: p.constraints, gaps: p.gaps })) unique(records.map(record => record.id), '/' + name);
  const fieldMap = new Map(p.context.fields.map(field => [field.id, field]));
  const sources = new Map(p.sources.map(source => [source.id, source]));
  const gaps = new Map(p.gaps.map(gap => [gap.id, gap]));
  const outcomes = new Map(p.outcomes.map(outcome => [outcome.id, outcome]));
  const states = new Map(p.scenario.states.map(state => [state.id, state]));
  const eventIds = new Set(p.scenario.events.map(event => event.id));
  const compositionIds = new Set(p.compositions.map(composition => composition.id));
  const initials = p.scenario.states.filter(state => state.kind === 'initial');
  if (initials.length !== 1) error('INITIAL_STATE', '/scenario/states', 'Exactly one initial state is required.');
  const date = new Date(p.metadata.authoredAt + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== p.metadata.authoredAt)
    error('DATE', '/metadata/authoredAt', 'Use an actual calendar date.');
  function evidence(refs: Array<{ sourceId: string; ruleId: string }>, path: string) {
    unique(refs.map(ref => ref.sourceId + '/' + ref.ruleId), path);
    for (const ref of refs) if (!sources.get(ref.sourceId)?.ruleIds.includes(ref.ruleId))
      error('EVIDENCE_REFERENCE', path, `Undeclared source/rule: ${ref.sourceId}/${ref.ruleId}`);
  }
  function gapReference(id: string, path: string, area?: string) {
    const gap = gaps.get(id);
    if (!gap || !gap.blocking || (area && gap.area !== area))
      error('GAP_REFERENCE', path, 'An unresolved route requires an existing blocking gap of the matching area.');
  }
  function conditions(when: Conditions, path: string, exactInputs?: string[]) {
    if (exactInputs && (Object.keys(when).length !== exactInputs.length || exactInputs.some(id => !(id in when))))
      error('TABLE_COLUMNS', path, 'Every row must explicitly name all table inputs (use any for wildcard).');
    for (const [id, cell] of Object.entries(when)) {
      const field = fieldMap.get(id);
      if (!field || (exactInputs && !exactInputs.includes(id))) {
        error('CONTEXT_REFERENCE', path, `Unknown context field: ${id}`); continue;
      }
      const values = cell.op === 'any' ? [] : cell.op === 'eq' ? [cell.value] : cell.values;
      if (new Set(values).size !== values.length) error('DUPLICATE_DOMAIN', path, 'Repeated cell values.');
      if (values.some(value => !domain(field).includes(value)))
        error('CONDITION_TYPE', path + '/' + id, 'Condition value is outside the typed context domain.');
    }
  }
  for (const field of p.context.fields) if (field.type === 'enum') unique(field.values, '/context/' + field.id);
  for (const source of p.sources) {
    unique(source.ruleIds, '/sources/' + source.id + '/ruleIds');
    if (source.path.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(source.path))
      error('SOURCE_PATH', '/sources/' + source.id, 'Source path must be a safe nonempty relative file path.');
  }
  const allCases = enumerate(p.context.fields);
  if (!allCases) error('CONTEXT_LIMIT', '/context', `The finite context product exceeds ${MAX_CONTEXT_CASES} cases.`);
  for (const table of p.decisionTables) {
    const base = '/decisionTables/' + table.id;
    unique(table.inputs, base + '/inputs'); unique(table.rows.map(row => row.id), base + '/rows');
    for (const input of table.inputs) if (!fieldMap.has(input)) error('CONTEXT_REFERENCE', base, `Unknown table input: ${input}`);
    for (const row of table.rows) {
      conditions(row.when, base + '/' + row.id, table.inputs); evidence(row.evidence, base + '/' + row.id);
      if (!outcomes.has(row.outcomeId)) error('OUTCOME_REFERENCE', base, `Unknown outcome: ${row.outcomeId}`);
    }
    if (table.inputs.every(id => fieldMap.has(id))) {
      const cases = enumerate(table.inputs.map(id => fieldMap.get(id)!));
      if (cases) {
        let overlap = false, missing = false;
        const reached = new Set<string>();
        for (const context of cases) {
          const rows = table.rows.filter(row => matches(row.when, context));
          if (!rows.length) missing = true;
          if (rows.length > 1) overlap = true;
          rows.forEach(row => reached.add(row.id));
        }
        if (overlap) error('TABLE_OVERLAP', base, 'Unique hit policy violated by overlapping rows.');
        if (missing) error('TABLE_INCOMPLETE', base, 'Declared finite context cases are not covered.');
        for (const row of table.rows) if (!reached.has(row.id)) error('TABLE_UNREACHABLE_ROW', base + '/' + row.id, 'Row cannot match any declared context.');
      }
    }
  }
  for (const outcome of p.outcomes) {
    evidence(outcome.evidence, '/outcomes/' + outcome.id);
    unique(outcome.compositionIds, '/outcomes/' + outcome.id);
    for (const id of outcome.compositionIds) if (!compositionIds.has(id)) error('COMPOSITION_REFERENCE', '/outcomes/' + outcome.id, `Unknown composition: ${id}`);
    if (!states.has(outcome.entryStateId)) error('STATE_REFERENCE', '/outcomes/' + outcome.id, 'Unknown entry state.');
    if (!p.decisionTables.some(table => table.rows.some(row => row.outcomeId === outcome.id)))
      error('UNUSED_OUTCOME', '/outcomes/' + outcome.id, 'Outcome must be reachable from a decision table.');
  }
  for (const composition of p.compositions) {
    const base = '/compositions/' + composition.id;
    unique(composition.roles.map(role => role.id), base);
    unique(composition.activeStates, base + '/activeStates');
    for (const id of composition.activeStates) if (!states.has(id)) error('STATE_REFERENCE', base + '/activeStates', 'Unknown composition activation state.');
    const roleMap = new Map(composition.roles.map(role => [role.id, role]));
    if (composition.roles.filter(role => role.parentId === null).length !== 1) error('COMPOSITION_ROOT', base, 'Exactly one semantic root role is required.');
    const orders = new Set<string>();
    for (const role of composition.roles) {
      const path = base + '/' + role.id; evidence(role.evidence, path);
      if (role.minimum > role.maximum) error('CARDINALITY', path, 'Minimum exceeds maximum.');
      if (role.parentId !== null && !roleMap.has(role.parentId)) error('ROLE_PARENT', path, 'Unknown parent role.');
      const order = `${role.parentId}/${role.order}`;
      if (orders.has(order)) error('SIBLING_ORDER', path, 'Sibling order must be unique.'); orders.add(order);
      const visited = new Set<string>(); let current: typeof role | undefined = role;
      while (current) {
        if (visited.has(current.id)) { error('COMPOSITION_CYCLE', path, 'Composition contains a parent cycle.'); break; }
        visited.add(current.id); current = current.parentId === null ? undefined : roleMap.get(current.parentId);
      }
      if ((role.kind === 'ui-component' && !role.binding) || (role.kind === 'region' && role.binding))
        error('ROLE_BINDING', path, 'UI roles require an explicit binding; semantic regions cannot bind a UI export.');
      if (role.binding?.kind === 'unresolved') {
        gapReference(role.binding.gapId, path, 'availability'); warning('ROLE_UNRESOLVED', path, 'No confirmed arui-private representation is bound.');
      } else if (role.binding?.kind === 'registry') {
        unique(role.binding.requiredInputs, path + '/requiredInputs'); unique(role.binding.requiredSlots, path + '/requiredSlots');
      }
    }
  }
  for (const transition of p.scenario.transitions) {
    const path = '/scenario/transitions/' + transition.id;
    evidence(transition.evidence, path); conditions(transition.when, path + '/when');
    unique(transition.outcomeIds, path); unique(transition.actions.map(action => action.id), path + '/actions');
    transition.actions.forEach(action => evidence(action.evidence, path + '/actions/' + action.id));
    if (!states.has(transition.from)) error('STATE_REFERENCE', path, 'Unknown source state.');
    if (states.get(transition.from)?.kind === 'terminal') error('TERMINAL_TRANSITION', path, 'A terminal state cannot have outgoing transitions.');
    if (!eventIds.has(transition.eventId)) error('EVENT_REFERENCE', path, 'Unknown event.');
    for (const id of transition.outcomeIds) if (!outcomes.has(id)) error('OUTCOME_REFERENCE', path, `Unknown transition outcome: ${id}`);
    if ('stateId' in transition.target) {
      if (!states.has(transition.target.stateId)) error('STATE_REFERENCE', path, 'Unknown target state.');
      if (transition.basis !== 'source-formalization') error('TRANSITION_BASIS', path, 'Concrete transitions must declare source formalization.');
    } else {
      gapReference(transition.target.gapId, path, 'product');
      if (transition.basis !== 'gap-route' || transition.actions.length)
        error('TRANSITION_BASIS', path, 'Unknown product behavior must use a gap route without invented effects.');
    }
  }
  if (allCases) {
    const groups = new Map<string, typeof p.scenario.transitions>();
    for (const transition of p.scenario.transitions) for (const outcomeId of transition.outcomeIds) {
      const key = `${transition.from}/${transition.eventId}/${outcomeId}`;
      groups.set(key, [...(groups.get(key) || []), transition]);
    }
    const selectedFor = (context: Parameters<typeof matches>[1]) => new Set(p.decisionTables.flatMap(table =>
      table.rows.filter(row => matches(row.when, context)).map(row => row.outcomeId)));
    for (const [key, group] of groups) if (allCases.some(context => {
      const selected = selectedFor(context);
      return group.filter(t => t.outcomeIds.some(id => selected.has(id)) && matches(t.when, context)).length > 1;
    })) error('TRANSITION_OVERLAP', '/scenario/transitions', `Ambiguous transition group: ${key}`);
    if (initials.length === 1) {
      const badEntries = new Set<string>();
      for (const context of allCases) for (const outcomeId of selectedFor(context)) {
        const reached = new Set([initials[0].id]); let changed = true;
        while (changed) {
          changed = false;
          for (const t of p.scenario.transitions) if (t.outcomeIds.includes(outcomeId) && matches(t.when, context)
            && reached.has(t.from) && 'stateId' in t.target && !reached.has(t.target.stateId)) {
            reached.add(t.target.stateId); changed = true;
          }
        }
        const entry = outcomes.get(outcomeId)?.entryStateId;
        if (entry && !reached.has(entry)) badEntries.add(outcomeId);
      }
      for (const id of badEntries) error('OUTCOME_ENTRY_UNREACHABLE', '/outcomes/' + id, 'Entry state is unreachable under a context that selects this outcome.');
    }
  }
  if (initials.length === 1) {
    const reachable = new Set([initials[0].id]); let changed = true;
    while (changed) {
      changed = false;
      for (const t of p.scenario.transitions) if (reachable.has(t.from) && 'stateId' in t.target && !reachable.has(t.target.stateId)) {
        reachable.add(t.target.stateId); changed = true;
      }
    }
    for (const state of p.scenario.states) if (!reachable.has(state.id)) error('UNREACHABLE_STATE', '/scenario/states/' + state.id, 'State is not reachable from the initial state.');
  }
  for (const constraint of p.constraints) {
    const path = '/constraints/' + constraint.id; evidence(constraint.evidence, path);
    const allowed = { 'decision-table': p.decisionTables, composition: p.compositions,
      scenario: p.scenario.transitions, 'product-input': p.context.fields, manual: p.gaps }[constraint.route];
    if (!allowed.some(subject => subject.id === constraint.subjectId)) error('CHECK_ROUTE', path, 'Check route references an unknown subject.');
  }
  warning('DRAFT_ONLY', '/status', 'Structural validity does not imply product/live acceptance or permission to execute.');
  const valid = !issues.some(issue => issue.level === 'error');
  return { valid, issues, pattern: valid ? p : undefined };
}
