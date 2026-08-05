export type AuditLifecycleState = 'idle' | 'running' | 'cancelling';

export class AuditCancelledError extends Error {
  constructor() {
    super('AUDIT_CANCELLED');
    this.name = 'AuditCancelledError';
  }
}

export class AuditLifecycle {
  private state: AuditLifecycleState = 'idle';
  private idleWaiters: Array<() => void> = [];

  tryBegin(): boolean {
    if (this.state !== 'idle') {
      return false;
    }
    this.state = 'running';
    return true;
  }

  requestCancel(): boolean {
    if (this.state !== 'running') {
      return false;
    }
    this.state = 'cancelling';
    return true;
  }

  throwIfCancelled(): void {
    if (this.state === 'cancelling') {
      throw new AuditCancelledError();
    }
  }

  finish(): void {
    if (this.state === 'idle') {
      return;
    }
    this.state = 'idle';
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  waitUntilIdle(): Promise<void> {
    if (this.state === 'idle') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  isRunning(): boolean {
    return this.state !== 'idle';
  }

  getState(): AuditLifecycleState {
    return this.state;
  }

  getWaitingCount(): number {
    return this.idleWaiters.length;
  }
}
