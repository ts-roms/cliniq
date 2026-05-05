// Tiny eval harness for prompt regressions. Reads JSONL golden cases, runs
// them through a `runCase` function injected by the caller, scores against
// `mustNot` (string blacklist) and `expected` (deep-key match), prints a
// summary, and exits non-zero on regression.
//
// See docs/08-ai-prompts-and-evals.md for the full design (LLM-judge,
// shadow inference, etc.). This file is the minimal CI gate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface EvalCase {
  id: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  mustNot?: string[]; // substrings that must NOT appear in stringified output
}

export interface CaseResult {
  id: string;
  ok: boolean;
  reason?: string;
  outputSnippet?: string;
}

export type RunCase = (input: Record<string, unknown>) => Promise<unknown>;

export async function runEval(
  jsonlPath: string,
  runCase: RunCase,
): Promise<{ passed: number; failed: number; results: CaseResult[] }> {
  const cases = readJsonl(jsonlPath);
  const results: CaseResult[] = [];

  for (const c of cases) {
    try {
      const output = await runCase(c.input);
      const json = JSON.stringify(output);

      const offenders = (c.mustNot ?? []).filter((needle) =>
        json.toLowerCase().includes(needle.toLowerCase()),
      );
      if (offenders.length > 0) {
        results.push({
          id: c.id,
          ok: false,
          reason: `mustNot violation: ${offenders.join(', ')}`,
          outputSnippet: json.slice(0, 200),
        });
        continue;
      }

      const expectFail = c.expected ? matchExpected(output, c.expected) : null;
      if (expectFail) {
        results.push({ id: c.id, ok: false, reason: expectFail, outputSnippet: json.slice(0, 200) });
        continue;
      }

      results.push({ id: c.id, ok: true });
    } catch (err) {
      results.push({ id: c.id, ok: false, reason: `runCase threw: ${(err as Error).message}` });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

/**
 * Walks `expected` and checks each leaf is "contained" in `actual`:
 *  - plain objects: every expected key must subset-match
 *  - arrays: each expected element must subset-match SOME actual element
 *  - primitives: must JSON-stringify equal
 *
 * Goal is "the model said at least what we required" — extra fields are fine.
 */
function matchExpected(
  actual: unknown,
  expected: unknown,
  path = '',
): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return `at ${path || 'root'}: expected array, got ${typeof actual}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const needle = expected[i];
      const matched = actual.some((candidate) => matchExpected(candidate, needle, `${path}[?]`) === null);
      if (!matched) {
        return `at ${path}[${i}]: no array element matched ${JSON.stringify(needle)}`;
      }
    }
    return null;
  }

  if (expected !== null && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      return `at ${path || 'root'}: actual is not an object`;
    }
    const a = actual as Record<string, unknown>;
    for (const [key, val] of Object.entries(expected as Record<string, unknown>)) {
      const here = path ? `${path}.${key}` : key;
      const sub = matchExpected(a[key], val, here);
      if (sub) return sub;
    }
    return null;
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return `at ${path || 'root'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

function readJsonl(path: string): EvalCase[] {
  const abs = resolve(path);
  const text = readFileSync(abs, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('//'))
    .map((line, i) => {
      try {
        return JSON.parse(line) as EvalCase;
      } catch (err) {
        throw new Error(`bad JSONL at ${path}:${i + 1}: ${(err as Error).message}`);
      }
    });
}

export function printAndExit(name: string, result: Awaited<ReturnType<typeof runEval>>): void {
  console.log(`\n=== ${name} eval ===`);
  for (const r of result.results) {
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.id}${r.reason ? ` — ${r.reason}` : ''}`);
    if (!r.ok && r.outputSnippet) console.log(`        out: ${r.outputSnippet}`);
  }
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  if (result.failed > 0) process.exit(1);
}
