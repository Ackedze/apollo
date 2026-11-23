const {yieldToHost}=require('../../document-audit/reads');

export const designTraversalBudget={maxTimeMs:32,maxVisits:256,hostYield:yieldToHost as ()=>Promise<void>|null};

/** Let native UI messages run even when every awaited read is already cached. */
export function createCooperativeYield(
  guard: () => void = () => {},
  measureWait?: (wait: () => Promise<void>) => Promise<void>,
  budget?: typeof designTraversalBudget,
) {
  let resumedAt = Date.now();
  let visited = 0;
  const wait = () => budget?.hostYield() ?? new Promise<void>((resolve) => setTimeout(resolve, 0));
  return async (): Promise<void> => {
    guard();
    visited += 1;
    if (visited < (budget?.maxVisits ?? 256) && Date.now() - resumedAt < (budget?.maxTimeMs ?? 8)) return;
    await (measureWait ? measureWait(wait) : wait());
    guard();
    resumedAt = Date.now();
    visited = 0;
  };
}

export async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items.length) {
    return;
  }

  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  };

  const workers: Promise<void>[] = [];
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
}
