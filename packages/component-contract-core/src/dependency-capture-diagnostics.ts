/** Capture diagnostics only: never evidence of a successful child audit. */
const stages = {
  'resolve-instance': 'поиск экземпляра',
  'read-main-component': 'чтение main component',
  'create-reference-instance': 'создание эталона',
  'append-reference-instance': 'перенос эталона на временную страницу',
  'read-variable-modes': 'чтение variable modes',
  'apply-variable-modes': 'применение variable modes',
  'capture-actual': 'захват фактов экземпляра',
  'capture-reference': 'захват фактов эталона',
  'materialize-baseline': 'сопоставление с эталоном',
  'capture-variant-reference': 'захват API выбранного варианта',
  'capture-nested-reference': 'захват вложенных эталонов',
  'map-node-ids': 'сопоставление локальных узлов',
};

export type DependencyCaptureStage = keyof typeof stages;
export type DependencyCaptureFailureDetails = {
  version: 1;
  stage: DependencyCaptureStage;
  errorName: string;
  message: string;
};

function boundedText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
}

function errorField(error: unknown, field: 'name' | 'message'): unknown {
  try { return error && typeof error === 'object' ? (error as Record<string, unknown>)[field] : undefined; }
  catch { return undefined; }
}

export function dependencyCaptureFailureDetails(stage: DependencyCaptureStage, error: unknown): DependencyCaptureFailureDetails {
  return {
    version: 1, stage,
    errorName: boundedText(errorField(error, 'name'), 80) || 'Error',
    message: boundedText(typeof error === 'string' ? error : errorField(error, 'message'), 360) || 'Ошибка без текста.',
  };
}

/** Malformed or ambiguous metadata must not add a guessed explanation. */
export function dependencyCaptureFailureLabel(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const value = details as Record<string, unknown>;
  if (value.version !== 1 || typeof value.stage !== 'string' || !Object.prototype.hasOwnProperty.call(stages, value.stage)
    || typeof value.errorName !== 'string' || typeof value.message !== 'string') return '';
  const name = boundedText(value.errorName, 80), message = boundedText(value.message, 360);
  if (!name || !message) return '';
  return ` Этап: ${stages[value.stage as DependencyCaptureStage]}. ${name}: ${message}`;
}
