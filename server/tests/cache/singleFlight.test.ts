import { describe, it, expect } from 'vitest';
import { SingleFlightCache } from '../../src/utils/singleFlight.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SingleFlightCache', () => {
  it('coalesces concurrent callers that share the same version', async () => {
    const cache = new SingleFlightCache(1000, 100);
    let calls = 0;

    const [a, b] = await Promise.all([
      cache.do('board', async () => {
        calls++;
        await sleep(10);
        return 1;
      }),
      cache.do('board', async () => {
        calls++;
        await sleep(10);
        return 1;
      }),
    ]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not hand a pre-write result to a caller that arrives after invalidation', async () => {
    const cache = new SingleFlightCache(1000, 100);

    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    // Start a slow board query and let it register as in-flight.
    const first = cache.do('board', () => gate);
    await sleep(0);
    expect((cache as unknown as { inFlight: Map<string, Promise<unknown>> }).inFlight.size).toBe(1);

    // A write lands while the first query is still open.
    cache.invalidate();

    let secondFnRan = false;
    const second = cache.do('board', async () => {
      secondFnRan = true;
      return { memberCount: 2 };
    });

    // The post-write caller must run its own query, not join the pre-write one.
    expect(secondFnRan).toBe(true);
    await expect(second).resolves.toEqual({ memberCount: 2 });

    // The stale query finishes and must not overwrite the post-write result.
    release({ memberCount: 1 });
    await expect(first).resolves.toEqual({ memberCount: 1 });

    const third = await cache.do('board', async () => ({ memberCount: 3 }));
    expect(third).toEqual({ memberCount: 2 });
  });

  it('keeps in-flight entries for different versions separate', async () => {
    const cache = new SingleFlightCache(1000, 100);

    let releaseOld!: (value: unknown) => void;
    const oldGate = new Promise((resolve) => {
      releaseOld = resolve;
    });

    const oldFlight = cache.do('board', () => oldGate);
    await sleep(0);
    cache.invalidate();

    const newFlight = cache.do('board', async () => 'new');
    await expect(newFlight).resolves.toBe('new');

    releaseOld('old');
    await expect(oldFlight).resolves.toBe('old');
  });
});