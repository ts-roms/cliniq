import { readFileSync } from 'node:fs';
import type { ProvisionedSeed } from '../fixtures/provision';

let cached: ProvisionedSeed | null = null;

/**
 * Read the seed payload globalSetup wrote to storage/seed.json. Cached per
 * worker process. Fail loudly if missing — that means globalSetup didn't run
 * (typically because of a misconfigured `testDir`).
 */
export function loadSeed(): ProvisionedSeed {
  if (cached) return cached;
  try {
    const raw = readFileSync(`${process.cwd()}/storage/seed.json`, 'utf-8');
    cached = JSON.parse(raw) as ProvisionedSeed;
    return cached;
  } catch (err) {
    throw new Error(
      `Could not read storage/seed.json. Did globalSetup run? (${(err as Error).message})`,
    );
  }
}
