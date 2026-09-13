/**
 * Parallel batch puzzle generator (Node). Replaces backend/generate_batch.py.
 *
 *   npx tsx scripts/generate-batch.ts --output public/all_puzzles.jsonl
 *   npx tsx scripts/generate-batch.ts --sizes 4,5 --difficulties easy,medium --count 10
 *   npx tsx scripts/generate-batch.ts --tiers add,all --workers 4 --max-time 600 --seed 42
 *   npx tsx scripts/generate-batch.ts --resume            # continue from <output>.partial.jsonl
 *
 * Every accepted record passed assessPuzzle in its worker: structure, exactly
 * one solution, a trace that reached it. Records carry the seed that
 * reproduces them. Output is written atomically; a checkpoint file is kept
 * beside it while the run is going.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { availableParallelism } from 'node:os';
import { runBatch } from '../src/generation/coordinator';
import { bucketId, type BucketKey } from '../src/generation/bucketPlan';
import { OPERATIONS_TIERS } from '../src/generation/operations';
import type { PuzzleRecord } from '../src/generation/generate';
import { DIFFICULTY_ORDER, type DifficultyLevel } from '../src/utils/difficulty';
import { workerPoolRunner } from './generation/workerPool';

const { values: args } = parseArgs({
  options: {
    sizes: { type: 'string', default: '4,5,6,7' },
    difficulties: { type: 'string', default: DIFFICULTY_ORDER.join(',') },
    tiers: { type: 'string', default: 'all' },
    count: { type: 'string', default: '50' },
    workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
    output: { type: 'string', default: 'public/all_puzzles.jsonl' },
    'max-candidates': { type: 'string', default: '50' },
    'max-time': { type: 'string' },
    grace: { type: 'string', default: '5' },
    seed: { type: 'string', default: String(Date.now() >>> 0) },
    resume: { type: 'boolean', default: false },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const sizes = args.sizes!.split(',').map(Number);
for (const s of sizes) if (![4, 5, 6, 7].includes(s)) fail(`Invalid size ${s}; must be 4-7`);
const difficulties = args.difficulties!.split(',').map(d => d.trim()) as DifficultyLevel[];
for (const d of difficulties) if (!DIFFICULTY_ORDER.includes(d)) fail(`Invalid difficulty ${d}`);
const tiers = args.tiers!.split(',').map(t => t.trim());
for (const t of tiers)
  if (!(t in OPERATIONS_TIERS))
    fail(`Invalid tier ${t}; one of ${Object.keys(OPERATIONS_TIERS).join(', ')}`);
const count = Number(args.count);
const workers = Number(args.workers);
const maxCandidates = Number(args['max-candidates']);
if (!(count > 0 && workers > 0 && maxCandidates > 0))
  fail('--count, --workers and --max-candidates must be positive');
const maxTimeMs = args['max-time'] ? Number(args['max-time']) * 1000 : null;
const graceMs = Number(args.grace) * 1000;
const runSeed = Number(args.seed) >>> 0;

const output = resolve(args.output!);
const partial = `${output}.partial.jsonl`;

const keys: BucketKey[] = [];
for (const size of sizes)
  for (const difficulty of difficulties)
    for (const tier of tiers) keys.push({ size, difficulty, tier });

const readRecords = (path: string): PuzzleRecord[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as PuzzleRecord);

const writeAtomically = (path: string, records: PuzzleRecord[]) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  renameSync(tmp, path);
};

const resume = args.resume && existsSync(partial) ? readRecords(partial) : [];
const log = (message: string) =>
  console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);

log(
  `Generating ${keys.length * count} puzzles across ${keys.length} buckets (${count} each), seed ${runSeed}`
);
log(
  `Sizes ${sizes.join(',')}; difficulties ${difficulties.join(',')}; tiers ${tiers.join(',')}; workers ${workers}` +
    (maxTimeMs ? `; time limit ${maxTimeMs / 1000}s (+${graceMs / 1000}s grace)` : '')
);
if (resume.length) log(`Resuming with ${resume.length} records from ${partial}`);

const runner = workerPoolRunner(workers);
const outcome = await runBatch({
  keys,
  countPerBucket: count,
  runner,
  runSeed,
  maxCandidates,
  maxTimeMs,
  graceMs,
  resume,
  onProgress: log,
  onCheckpoint: records => writeAtomically(partial, records),
});

const { plan } = outcome;
log(
  `Generation ${outcome.timedOut ? 'stopped at the time limit' : 'complete'} in ${(outcome.elapsedMs / 1000).toFixed(1)}s` +
    (outcome.terminated ? `; ${outcome.terminated} task(s) terminated` : '')
);
for (const key of keys) {
  const id = bucketId(key);
  const n = plan.accepted.get(id)!.length;
  const rej = [...plan.rejections.get(id)!.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([r, c]) => `${r}=${c}`)
    .join(', ');
  log(
    `  ${id.padEnd(22)} ${n}/${count} [${n >= count ? 'OK' : 'SHORT'}]${rej ? `  rejected: ${rej}` : ''}`
  );
}
if (plan.duplicates) log(`Duplicates discarded: ${plan.duplicates}`);
if (plan.errors.length)
  log(`${plan.errors.length} task error(s); first:\n${plan.errors[0].detail}`);

writeAtomically(output, plan.records());
if (existsSync(partial)) unlinkSync(partial);
log(`Wrote ${plan.records().length} puzzles to ${output}`);
process.exit(plan.shortfall().size > 0 ? 2 : 0);
