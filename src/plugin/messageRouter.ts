export interface ApolloPluginMessage {
  type?: string;
  payload?: any;
}

export interface ApolloPluginMessageRouterDependencies {
  postMessage(message: unknown): void;
  notify(message: string): void;
  scanSelection(payload: any): void;
  captureGenerationExample(payload: unknown): Promise<void>;
  cancelScan(): void;
  sendAgentReport(
    requestId: string | null | undefined,
    userMessage: string | null | undefined,
  ): Promise<void>;
  cancelAgentReport(requestId: string | null | undefined): boolean;
  resizeUi(compact: boolean): void;
  focusNode(nodeId: string | undefined): Promise<void>;
  resetCustomizationGroup(payload: any): Promise<void>;
  applyThemizationAction(payload: any): Promise<void>;
  executeFindingAction(actionId: string): Promise<void>;
  setDebugAudit(enabled: boolean): boolean;
  getDebugAudit(): boolean;
  logError(message: string, error: unknown): void;
}

export function createApolloPluginMessageRouter(
  dependencies: ApolloPluginMessageRouterDependencies,
): (message: ApolloPluginMessage) => void {
  return (message) => {
    routeApolloPluginMessage(message, dependencies);
  };
}

export function routeApolloPluginMessage(
  message: ApolloPluginMessage,
  dependencies: ApolloPluginMessageRouterDependencies,
): boolean {
  switch (message.type) {
    case 'ping':
      dependencies.postMessage({ type: 'pong' });
      return true;
    case 'scan-selection':
      dependencies.scanSelection(message.payload);
      return true;
    case 'capture-generation-example':
      void dependencies.captureGenerationExample(message.payload).catch((error) => {
        dependencies.logError(
          '[Apollo][examples] unhandled capture error',
          error,
        );
      });
      return true;
    case 'cancel-scan':
      dependencies.cancelScan();
      return true;
    case 'send-apollo-agent-report':
      void dependencies
        .sendAgentReport(
          message.payload?.requestId,
          message.payload?.userMessage,
        )
        .catch((error) => {
          dependencies.logError('[Apollo] failed to send agent report', error);
          dependencies.postMessage({
            type: 'apollo-agent-result',
            payload: {
              requestId: message.payload?.requestId ?? null,
              error:
                error instanceof Error
                  ? error.message
                  : 'Не удалось отправить отчёт агенту.',
            },
          });
        });
      return true;
    case 'cancel-apollo-agent-report': {
      const requestId = message.payload?.requestId;
      if (dependencies.cancelAgentReport(requestId)) {
        dependencies.postMessage({
          type: 'apollo-agent-cancelled',
          payload: { requestId: requestId ?? null },
        });
      }
      return true;
    }
    case 'set-ui-compact':
      dependencies.resizeUi(message.payload?.compact === true);
      return true;
    case 'focus-node':
      void dependencies.focusNode(message.payload?.id).catch((error) => {
        dependencies.logError('Failed to focus node', error);
        dependencies.notify('Не удалось перейти к слою.');
      });
      return true;
    case 'reset-customization-group':
      void dependencies
        .resetCustomizationGroup(message.payload)
        .catch((error) => {
          dependencies.logError('Failed to reset customization group', error);
          dependencies.notify('Не удалось сбросить изменения.');
        });
      return true;
    case 'apply-themization-action':
      void dependencies.applyThemizationAction(message.payload).catch((error) => {
        dependencies.logError('Failed to apply themization action', error);
        dependencies.notify('Не удалось применить изменения темизации.');
      });
      return true;
    case 'execute-finding-action':
      void dependencies
        .executeFindingAction(String(message.payload?.actionId ?? ''))
        .catch((error) => {
          dependencies.logError('Failed to execute finding action', error);
          dependencies.notify('Не удалось применить действие.');
        });
      return true;
    case 'set-debug-audit':
      dependencies.postMessage({
        type: 'debug-audit-state',
        payload: {
          enabled: dependencies.setDebugAudit(
            message.payload?.enabled === true,
          ),
        },
      });
      return true;
    case 'get-debug-audit':
      dependencies.postMessage({
        type: 'debug-audit-state',
        payload: { enabled: dependencies.getDebugAudit() },
      });
      return true;
    default:
      return false;
  }
}
