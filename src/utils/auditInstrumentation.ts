export const AUDIT_TRACE_PLUGIN_DATA_KEY = 'apollo.debug.audit';

export function getTimestamp(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

export function isAuditTraceEnabled(): boolean {
  try {
    return (
      typeof figma !== 'undefined' &&
      figma.root?.getPluginData?.(AUDIT_TRACE_PLUGIN_DATA_KEY) === '1'
    );
  } catch (_error) {
    return false;
  }
}

export function traceAudit(event: string, payload: unknown): void {
  if (!isAuditTraceEnabled()) {
    return;
  }

  console.log(`[Apollo][trace] ${event}`, payload);
}

export function logAuditMetric(event: string, payload: unknown): void {
  console.log(`[Apollo][metrics] ${event}`, payload);
}

export function setAuditTraceEnabled(enabled: boolean): void {
  if (typeof figma === 'undefined' || !figma.root?.setPluginData) {
    return;
  }

  figma.root.setPluginData(AUDIT_TRACE_PLUGIN_DATA_KEY, enabled ? '1' : '0');
}
