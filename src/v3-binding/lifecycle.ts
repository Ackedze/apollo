export type BindingLifecycle = { guard(): void; beforeWrite(): Promise<void>; onWritten(): void };
export const idleLifecycle: BindingLifecycle = { guard() {}, async beforeWrite() {}, onWritten() {} };

export class BindingControlError extends Error {
  constructor(readonly original: unknown) {
    super(original instanceof Error ? original.message : String(original));
  }
}

// Control failures must bypass native API catches and the text-range retry.
export function preserveControlErrors(lifecycle: BindingLifecycle): BindingLifecycle {
  function control(error: unknown): never {
    throw error instanceof BindingControlError ? error : new BindingControlError(error);
  }
  return {
    guard() { try { lifecycle.guard(); } catch (error) { control(error); } },
    async beforeWrite() { try { await lifecycle.beforeWrite(); } catch (error) { control(error); } },
    onWritten() { try { lifecycle.onWritten(); } catch (error) { control(error); } },
  };
}
