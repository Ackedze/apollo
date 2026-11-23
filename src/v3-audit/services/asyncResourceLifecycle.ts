export type AsyncResourceStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type AsyncResourceSnapshot = {
  status: AsyncResourceStatus;
  generation: number;
  error: unknown | null;
};

export type AsyncResourceLifecycleOptions = {
  retryFailed?: boolean;
};

export class AsyncResourceLifecycle {
  private status: AsyncResourceStatus = 'idle';
  private generation = 0;
  private error: unknown | null = null;
  private loadingPromise: Promise<void> | null = null;
  private readonly retryFailed: boolean;

  constructor(options: AsyncResourceLifecycleOptions = {}) {
    this.retryFailed = options.retryFailed === true;
  }

  isReady(): boolean {
    return this.status === 'ready';
  }

  isLoading(): boolean {
    return this.status === 'loading';
  }

  getSnapshot(): AsyncResourceSnapshot {
    return {
      status: this.status,
      generation: this.generation,
      error: this.error,
    };
  }

  reset(): void {
    this.generation += 1;
    this.status = 'idle';
    this.error = null;
    this.loadingPromise = null;
  }

  ensure<T>(
    load: () => Promise<T>,
    commit: (value: T) => void = () => undefined,
  ): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.status === 'loading' && this.loadingPromise) {
      return this.loadingPromise;
    }
    if (this.status === 'failed' && !this.retryFailed) {
      return Promise.resolve();
    }

    const generation = this.generation;
    this.status = 'loading';
    this.error = null;
    const promise = load()
      .then((value) => {
        if (generation !== this.generation) return;
        commit(value);
        this.status = 'ready';
      })
      .catch((error) => {
        if (generation === this.generation) {
          this.status = 'failed';
          this.error = error;
        }
        throw error;
      })
      .finally(() => {
        if (
          generation === this.generation &&
          this.loadingPromise === promise
        ) {
          this.loadingPromise = null;
        }
      });
    this.loadingPromise = promise;
    return promise;
  }
}
