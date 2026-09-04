/**
 * PuzzleGallery Component
 *
 * A browsable gallery of the whole puzzle database, offered as the secondary
 * way to start a game alongside the existing "pick size and difficulty, get a
 * random puzzle" flow.
 *
 * Filters for size and operations sit at the top; matching puzzles below are
 * grouped into 10-point bands of numeric difficulty (the `difficulty_score`
 * the named tiers are derived from). Each tile previews the puzzle's cage
 * layout, so you can pick by eye rather than by label. Puzzles you have
 * already finished are marked, and can be filtered out.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import {
  CatalogEntry,
  RawPuzzleRecord,
  completedSignatures,
  groupByScoreBand,
  loadCatalog,
} from '../utils/puzzleCatalog';
import { OPERATION_TIERS, OPERATION_TIER_LABELS, VALID_SIZES } from '../constants/gameConstants';
import { triggerHapticFeedback } from '../utils/touchUtils';
import PuzzleThumbnail from './PuzzleThumbnail';

interface PuzzleGalleryProps {
  opened: boolean;
  onClose: () => void;
  /** Size and tier the gallery opens pre-filtered to. */
  initialSize: number;
  initialOperationsTier: string;
  /** Index of the puzzle currently being played, highlighted if visible. */
  currentPuzzleIndex: number | null;
  /** Matches App's existing pin-a-specific-puzzle handler. */
  onSelectPuzzle: (record: RawPuzzleRecord, index: number) => void;
}

const TIER_COLOR: Record<string, string> = {
  easiest: 'green',
  easy: 'teal',
  medium: 'yellow',
  hard: 'orange',
  expert: 'red',
};

const PuzzleGallery: React.FC<PuzzleGalleryProps> = ({
  opened,
  onClose,
  initialSize,
  initialOperationsTier,
  currentPuzzleIndex,
  onSelectPuzzle,
}) => {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [size, setSize] = useState<number>(initialSize);
  const [operationsTier, setOperationsTier] = useState<string>(initialOperationsTier);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [solved, setSolved] = useState<Set<string>>(() => new Set());

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Load the (memoized) catalog the first time the gallery is opened.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setLoadError(null);
    loadCatalog()
      .then(entries => {
        if (!cancelled) setCatalog(entries);
      })
      .catch(error => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  // Re-read completions each time it opens - the player has been solving
  // puzzles since the last time this was rendered.
  useEffect(() => {
    if (opened) {
      setSolved(completedSignatures());
      setSize(initialSize);
      setOperationsTier(initialOperationsTier);
    }
  }, [opened, initialSize, initialOperationsTier]);

  const bands = useMemo(() => {
    if (!catalog) return [];
    const matching = catalog.filter(
      entry =>
        entry.size === size &&
        entry.operationsTier === operationsTier &&
        !(hideCompleted && solved.has(entry.cagesSig))
    );
    return groupByScoreBand(matching);
  }, [catalog, size, operationsTier, hideCompleted, solved]);

  const totalShown = useMemo(
    () => bands.reduce((sum, band) => sum + band.entries.length, 0),
    [bands]
  );

  // Progress is reported against the whole size/ops filter, independent of
  // whether completed puzzles are currently hidden from view.
  const { filterTotal, solvedCount } = useMemo(() => {
    if (!catalog) return { filterTotal: 0, solvedCount: 0 };
    let total = 0;
    let done = 0;
    for (const entry of catalog) {
      if (entry.size !== size || entry.operationsTier !== operationsTier) continue;
      total++;
      if (solved.has(entry.cagesSig)) done++;
    }
    return { filterTotal: total, solvedCount: done };
  }, [catalog, size, operationsTier, solved]);

  const handleSelect = (entry: CatalogEntry) => {
    triggerHapticFeedback('medium');
    onSelectPuzzle(entry.record, entry.index);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <Text fw={700} size="lg">
            Puzzle Gallery
          </Text>
          {catalog && (
            <Badge variant="light" color="indigo" size="lg">
              {totalShown} puzzles
            </Badge>
          )}
        </Group>
      }
      fullScreen={isMobile}
      size="xl"
      centered
    >
      <Stack gap="md">
        {/* Filters */}
        <Box
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            paddingBottom: 12,
            background: 'var(--mantine-color-body)',
          }}
        >
          <Stack gap="xs">
            <Group gap="lg" wrap="wrap" align="flex-end">
              <Stack gap={4}>
                <Text size="xs" fw={600} c="dimmed">
                  Size
                </Text>
                <SegmentedControl
                  size="xs"
                  value={size.toString()}
                  onChange={value => setSize(parseInt(value, 10))}
                  data={VALID_SIZES.map(s => ({ value: s.toString(), label: `${s}×${s}` }))}
                />
              </Stack>

              <Stack gap={4}>
                <Text size="xs" fw={600} c="dimmed">
                  Operations
                </Text>
                <SegmentedControl
                  size="xs"
                  value={operationsTier}
                  onChange={setOperationsTier}
                  data={OPERATION_TIERS.map(tier => ({
                    value: tier,
                    label: OPERATION_TIER_LABELS[tier],
                  }))}
                />
              </Stack>
            </Group>

            <Group gap="sm" justify="space-between" wrap="wrap">
              <Switch
                size="sm"
                checked={hideCompleted}
                onChange={event => setHideCompleted(event.currentTarget.checked)}
                label="Hide completed"
              />
              <Text size="xs" c="dimmed">
                {solvedCount} of {filterTotal} completed
              </Text>
            </Group>
          </Stack>
        </Box>

        {loadError && (
          <Text size="sm" c="red">
            Could not load puzzles: {loadError}
          </Text>
        )}

        {!catalog && !loadError && (
          <Group justify="center" p="xl">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Loading puzzles…
            </Text>
          </Group>
        )}

        {catalog && totalShown === 0 && (
          <Text size="sm" c="dimmed" ta="center" p="xl">
            {hideCompleted
              ? 'Every puzzle in this filter is completed. Turn off "Hide completed" to replay one.'
              : 'No puzzles match this filter.'}
          </Text>
        )}

        {/* One section per 10-point band of numeric difficulty */}
        {bands.map(band => (
          <Stack key={band.start} gap="xs">
            <Group gap="xs" align="center">
              <Text size="sm" fw={700}>
                {band.label}
              </Text>
              <Badge size="sm" variant="light" color={TIER_COLOR[band.tier]}>
                {band.tier}
              </Badge>
              <Text size="xs" c="dimmed">
                {band.entries.length}
              </Text>
            </Group>

            <SimpleGrid cols={{ base: 4, xs: 5, sm: 6, md: 7 }} spacing="xs">
              {band.entries.map(entry => {
                const isSolved = solved.has(entry.cagesSig);
                const isCurrent = entry.index === currentPuzzleIndex;
                return (
                  <UnstyledButton
                    key={entry.index}
                    onClick={() => handleSelect(entry)}
                    aria-label={`Play ${entry.size}×${entry.size} puzzle, difficulty ${entry.score.toFixed(1)}${isSolved ? ', completed' : ''}`}
                    style={{
                      borderRadius: 8,
                      padding: 4,
                      border: `2px solid ${
                        isCurrent
                          ? 'var(--mantine-color-indigo-5)'
                          : isSolved
                            ? 'var(--mantine-color-green-3)'
                            : 'transparent'
                      }`,
                      background: 'rgba(148, 163, 184, 0.12)',
                    }}
                  >
                    <Box style={{ position: 'relative' }}>
                      <PuzzleThumbnail size={entry.size} cages={entry.record.puzzle.cages} />
                      {isSolved && (
                        <Box
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            color: 'var(--mantine-color-green-6)',
                            background: '#fff',
                            borderRadius: '50%',
                            lineHeight: 0,
                          }}
                        >
                          <IconCircleCheckFilled size={16} />
                        </Box>
                      )}
                    </Box>
                    <Text size="xs" fw={700} ta="center" mt={2} c="gray.7">
                      {entry.score.toFixed(1)}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </Stack>
        ))}
      </Stack>
    </Modal>
  );
};

export default PuzzleGallery;
