/**
 * DevPanel — keyboard-triggered modal for puzzle-by-index loading and
 * difficulty analysis across the full puzzle DB.
 *
 * Opened with Cmd/Ctrl+G.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
  TECHNIQUE_LABELS,
} from '../utils/solver';

type RawPuzzleRecord = {
  puzzle: {
    size: number;
    cages: { value: number; operation: string; cells: number[] }[];
    solution: number[][];
    difficulty_operations?: number;
  };
  metadata: {
    size: number;
    actual_difficulty: 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
    operations_tier?: string;
  };
};

type AnalysisRow = {
  idx: number;
  size: number;
  oldLevel: 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
  newLevel: 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
  newScore: number;
  rawScore: number;
  delta: number; // categorical (-4..+4)
};

const CAT_TO_NUM: Record<AnalysisRow['oldLevel'], number> = {
  easiest: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 4,
};

const LEVEL_COLOR: Record<AnalysisRow['oldLevel'], string> = {
  easiest: 'green',
  easy: 'teal',
  medium: 'yellow',
  hard: 'orange',
  expert: 'red',
};

type Props = {
  onClose: () => void;
  // Provided by App so the panel can swap in a specific puzzle.
  onLoadPuzzleByIndex: (record: RawPuzzleRecord, index: number) => void;
};

const DevPanel = ({ onClose, onLoadPuzzleByIndex }: Props) => {
  const [puzzlesCache, setPuzzlesCache] = useState<RawPuzzleRecord[] | null>(null);
  const [indexInput, setIndexInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const indexInputRef = useRef<HTMLInputElement>(null);

  // Focus + select on mount so Cmd+G is followed straight by typing.
  useEffect(() => {
    // Small delay so the input is actually mounted in the DOM tree.
    const id = window.setTimeout(() => {
      indexInputRef.current?.focus();
      indexInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<AnalysisRow[]>([]);
  const cancelRef = useRef(false);

  // Fetch puzzles once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/arithmatrix/all_puzzles.jsonl');
        const text = await resp.text();
        const records: RawPuzzleRecord[] = [];
        for (const line of text.trim().split('\n')) {
          if (line.trim()) records.push(JSON.parse(line));
        }
        if (!cancelled) setPuzzlesCache(records);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc / Cmd+G to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleLoad = () => {
    setLoadError(null);
    if (!puzzlesCache) {
      setLoadError('Puzzles not loaded yet');
      return;
    }
    const idx = parseInt(indexInput.trim(), 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= puzzlesCache.length) {
      setLoadError(`Index must be 0–${puzzlesCache.length - 1}`);
      return;
    }
    onLoadPuzzleByIndex(puzzlesCache[idx], idx);
    onClose();
  };

  const startAnalysis = async () => {
    if (!puzzlesCache) return;
    cancelRef.current = false;
    setAnalyzing(true);
    setResults([]);
    setProgress(0);
    setTotal(puzzlesCache.length);

    const BATCH = 25;
    const collected: AnalysisRow[] = [];
    for (let i = 0; i < puzzlesCache.length; i += BATCH) {
      if (cancelRef.current) break;
      const batch = puzzlesCache.slice(i, i + BATCH);
      for (let j = 0; j < batch.length; j++) {
        const rec = batch[j];
        const r = solveWithTrace(rec.puzzle);
        const newScore = normalizeScore(r.rawScore, rec.puzzle.size);
        const newLevel = difficultyLevel(newScore);
        collected.push({
          idx: i + j,
          size: rec.puzzle.size,
          oldLevel: rec.metadata.actual_difficulty,
          newLevel,
          newScore,
          rawScore: r.rawScore,
          delta: CAT_TO_NUM[newLevel] - CAT_TO_NUM[rec.metadata.actual_difficulty],
        });
      }
      setResults([...collected]);
      setProgress(collected.length);
      // Yield to UI
      await new Promise(r => setTimeout(r, 0));
    }
    setAnalyzing(false);
  };

  // Derived tables
  const stats = useMemo(() => {
    if (results.length === 0) return null;
    const total = results.length;
    const exact = results.filter(r => r.delta === 0).length;
    const harder = results.filter(r => r.delta > 0).length;
    const easier = results.filter(r => r.delta < 0).length;
    const dist: Record<number, number> = {};
    for (const r of results) dist[r.delta] = (dist[r.delta] ?? 0) + 1;
    return { total, exact, harder, easier, dist };
  }, [results]);

  const biggestHarder = useMemo(
    () =>
      [...results]
        .filter(r => r.delta > 0)
        .sort((a, b) => b.delta - a.delta || b.newScore - a.newScore)
        .slice(0, 20),
    [results]
  );
  const biggestEasier = useMemo(
    () =>
      [...results]
        .filter(r => r.delta < 0)
        .sort((a, b) => a.delta - b.delta || a.newScore - b.newScore)
        .slice(0, 20),
    [results]
  );
  const exactMatches = useMemo(
    () => [...results].filter(r => r.delta === 0).slice(0, 10),
    [results]
  );

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 10, 40, 0.92)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
        padding: 24,
        overflow: 'auto',
      }}
    >
      <Group justify="space-between" align="center" mb="md" style={{ maxWidth: 1200, margin: '0 auto 16px' }}>
        <Group gap="xs">
          <Badge size="lg" color="indigo" variant="filled">Dev Panel</Badge>
          <Text c="white" size="sm">Cmd+G to toggle · Esc to close</Text>
        </Group>
        <ActionIcon variant="filled" color="gray" size="lg" radius="xl" onClick={onClose}>
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <Stack style={{ maxWidth: 1200, margin: '0 auto' }} gap="md">
        {/* Load by index */}
        <Box style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 16 }}>
          <Text fw={700} size="sm" tt="uppercase" c="dimmed" mb={8}>Load puzzle by index</Text>
          <Group gap="xs" align="flex-end">
            <TextInput
              ref={indexInputRef}
              placeholder={puzzlesCache ? `0–${puzzlesCache.length - 1}` : 'Loading puzzles…'}
              value={indexInput}
              onChange={e => setIndexInput(e.currentTarget.value)}
              disabled={!puzzlesCache}
              onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
              autoFocus
              style={{ flex: 1, maxWidth: 200 }}
            />
            <Button onClick={handleLoad} disabled={!puzzlesCache}>Load</Button>
            {loadError && <Text c="red" size="sm">{loadError}</Text>}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>{TECHNIQUE_LABELS && ''}Index = line number in public/all_puzzles.jsonl (0-indexed).</Text>
        </Box>

        {/* Difficulty analysis */}
        <Box style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 16 }}>
          <Group justify="space-between" align="center" mb={8}>
            <Text fw={700} size="sm" tt="uppercase" c="dimmed">Difficulty analysis</Text>
            {!analyzing && (
              <Button size="xs" onClick={startAnalysis} disabled={!puzzlesCache}>
                {results.length > 0 ? 'Restart' : 'Run on all puzzles'}
              </Button>
            )}
            {analyzing && (
              <Button size="xs" variant="default" onClick={() => { cancelRef.current = true; }}>
                Stop
              </Button>
            )}
          </Group>
          {(analyzing || results.length > 0) && (
            <Progress value={total > 0 ? (progress / total) * 100 : 0} mb={8} size="sm" />
          )}
          {stats && (
            <Group gap="sm" mb={8}>
              <Text size="xs">Processed: <b>{stats.total}</b></Text>
              <Text size="xs" c="green">Exact match: <b>{stats.exact}</b> ({((stats.exact / stats.total) * 100).toFixed(1)}%)</Text>
              <Text size="xs" c="orange">Now harder: <b>{stats.harder}</b></Text>
              <Text size="xs" c="blue">Now easier: <b>{stats.easier}</b></Text>
            </Group>
          )}
          {stats && (
            <Group gap={4} mb={12}>
              {Object.entries(stats.dist).sort(([a], [b]) => Number(a) - Number(b)).map(([d, n]) => (
                <Badge key={d} variant="light" color={Number(d) === 0 ? 'green' : Number(d) > 0 ? 'orange' : 'blue'}>
                  Δ{Number(d) >= 0 ? '+' : ''}{d}: {n}
                </Badge>
              ))}
            </Group>
          )}

          <Group align="flex-start" gap="md" grow>
            <ResultTable title={`Biggest harder (${biggestHarder.length})`} rows={biggestHarder} color="orange" />
            <ResultTable title={`Biggest easier (${biggestEasier.length})`} rows={biggestEasier} color="blue" />
          </Group>
          {exactMatches.length > 0 && (
            <Box mt="md">
              <ResultTable title={`Sample exact matches (${exactMatches.length})`} rows={exactMatches} color="green" />
            </Box>
          )}
        </Box>

        {loadError && <Text c="red">{loadError}</Text>}
      </Stack>
    </Box>
  );
};

const ResultTable = ({
  title,
  rows,
  color,
}: {
  title: string;
  rows: AnalysisRow[];
  color: string;
}) => (
  <Box>
    <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>{title}</Text>
    <Table verticalSpacing={4} fz="xs" highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>idx</Table.Th>
          <Table.Th>size</Table.Th>
          <Table.Th>old</Table.Th>
          <Table.Th>new</Table.Th>
          <Table.Th>score</Table.Th>
          <Table.Th>raw</Table.Th>
          <Table.Th>Δ</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(r => (
          <Table.Tr key={r.idx}>
            <Table.Td>{r.idx}</Table.Td>
            <Table.Td>{r.size}</Table.Td>
            <Table.Td><Badge size="xs" color={LEVEL_COLOR[r.oldLevel]}>{r.oldLevel}</Badge></Table.Td>
            <Table.Td><Badge size="xs" color={LEVEL_COLOR[r.newLevel]}>{r.newLevel}</Badge></Table.Td>
            <Table.Td>{r.newScore.toFixed(1)}</Table.Td>
            <Table.Td>{r.rawScore}</Table.Td>
            <Table.Td><Badge size="xs" color={color}>{r.delta > 0 ? '+' : ''}{r.delta}</Badge></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  </Box>
);

export default DevPanel;
