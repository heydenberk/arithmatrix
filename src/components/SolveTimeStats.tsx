/**
 * Solve time against difficulty, for unaided solves.
 *
 * A table rather than a chart, deliberately. These buckets are small - a
 * handful of solves each for a long while - and a scatter plot of three
 * points implies a trend that is not there. Counts alongside the medians let
 * you see how much to believe each row.
 *
 * Sizes are kept apart because difficulty_score is normalised within a size:
 * every size's hardest puzzles score 100, so the number means "hard for a
 * 4x4" or "hard for a 7x7", never the same thing across the two.
 */

import React, { useMemo } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { SCORE_BAND_SIZE } from '../utils/puzzleCatalog';
import { formatCompletionTime, solveTimeStats } from '../utils/puzzleStats';

const SIZE_LABELS: Record<number, string> = { 4: '4×4', 5: '5×5', 6: '6×6', 7: '7×7' };

const SolveTimeStats: React.FC<{ opened: boolean }> = ({ opened }) => {
  const stats = useMemo(() => (opened ? solveTimeStats() : null), [opened]);
  if (!stats) return null;

  const bySize = new Map<number, typeof stats.buckets>();
  for (const bucket of stats.buckets) {
    bySize.set(bucket.size, [...(bySize.get(bucket.size) ?? []), bucket]);
  }

  // Scaled per size, since a 7x7 takes an order of magnitude longer than a 4x4
  const slowestFor = (size: number) =>
    Math.max(...(bySize.get(size) ?? []).map(b => b.medianSeconds), 1);

  return (
    <Stack gap="md">
      {stats.included === 0 ? (
        <Text size="sm" c="dimmed" ta="center" p="md">
          No unaided solves recorded yet. Finish a puzzle without hints, autofill or checking and it
          will show up here.
        </Text>
      ) : (
        [...bySize.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([size, buckets]) => (
            <Box key={size}>
              <Text fw={700} size="sm" mb={4}>
                {SIZE_LABELS[size] ?? `${size}×${size}`}
              </Text>
              <Stack gap={3}>
                {buckets.map(bucket => (
                  <Group key={bucket.bandStart} gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed" style={{ width: 54, flexShrink: 0 }}>
                      {bucket.bandStart}–{bucket.bandStart + SCORE_BAND_SIZE}
                    </Text>
                    <Box
                      style={{
                        flexGrow: 1,
                        height: 14,
                        borderRadius: 7,
                        background: 'var(--mantine-color-gray-2)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        style={{
                          width: `${(bucket.medianSeconds / slowestFor(size)) * 100}%`,
                          height: '100%',
                          borderRadius: 7,
                          background:
                            'linear-gradient(90deg, var(--mantine-color-indigo-3), var(--mantine-color-indigo-6))',
                        }}
                      />
                    </Box>
                    <Text size="xs" fw={600} style={{ width: 52, flexShrink: 0 }} ta="right">
                      {formatCompletionTime(bucket.medianSeconds)}
                    </Text>
                    <Text size="10px" c="dimmed" style={{ width: 62, flexShrink: 0 }}>
                      best {formatCompletionTime(bucket.bestSeconds)}
                    </Text>
                    <Text size="10px" c="dimmed" style={{ width: 26, flexShrink: 0 }} ta="right">
                      ×{bucket.count}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Box>
          ))
      )}

      {(stats.aidedExcluded > 0 || stats.unknownExcluded > 0) && (
        <Text size="xs" c="dimmed">
          {stats.included} unaided {stats.included === 1 ? 'solve' : 'solves'} counted
          {stats.aidedExcluded > 0 && `; ${stats.aidedExcluded} left out as aided`}
          {stats.unknownExcluded > 0 && `; ${stats.unknownExcluded} from before this was recorded`}.
        </Text>
      )}
    </Stack>
  );
};

export default SolveTimeStats;
