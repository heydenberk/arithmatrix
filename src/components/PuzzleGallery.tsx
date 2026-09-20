/**
 * PuzzleGallery Component
 *
 * A browsable gallery of the whole puzzle database, offered as the secondary
 * way to start a game alongside the existing "pick size and difficulty, get a
 * random puzzle" flow.
 *
 * Filters for size, operations and difficulty range sit at the top; matching
 * puzzles below are grouped by named difficulty, one row at a time behind a
 * "Show all" button. Each tile previews the puzzle's cage layout, so you can
 * pick by eye rather than by label. Puzzles you have already finished are
 * marked, and can be filtered out.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  RangeSlider,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconCircleCheckFilled,
  IconDice5,
  IconPlayerPauseFilled,
} from '@tabler/icons-react';
import {
  CatalogEntry,
  DIFFICULTY_ORDER,
  DifficultyRange,
  FULL_DIFFICULTY_RANGE,
  RawPuzzleRecord,
  completedSignatures,
  describeDifficultyRange,
  difficultyInRange,
  groupByDifficulty,
  loadCatalog,
  pickRandomEntry,
} from '../utils/puzzleCatalog';
import {
  DIFFICULTY_COLOR,
  OPERATION_TIERS,
  OPERATION_TIER_LABELS,
  VALID_SIZES,
} from '../constants/gameConstants';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { triggerHapticFeedback } from '../utils/touchUtils';
import { SavedGameSummary, savedGameSummaries } from '../utils/gameStatePersistence';
import { formatCompletionTime } from '../utils/puzzleStats';
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

/** Sentinel for the operations filter meaning "don't filter by operations". */
const ANY_OPS = 'any';

/** Tiles per row, by viewport. Drives both the grid and the preview length. */
const GALLERY_COLUMNS = { base: 4, xs: 5, sm: 6, md: 7 };

/**
 * Tiles shown per difficulty before the section has to be expanded: exactly
 * one row.
 *
 * Every difficulty holds about two hundred puzzles, and nobody scrolls two
 * hundred thumbnails to pick one - they take something off the top or hit
 * Surprise me. A row is a taste of what the band looks like, and it keeps all
 * five difficulties on one screen.
 *
 * Read off the same breakpoints SimpleGrid uses (Mantine's xs/sm/md, in px),
 * so the preview is a full row and never a ragged one.
 */
const previewCount = (width: number): number =>
  width >= 992
    ? GALLERY_COLUMNS.md
    : width >= 768
      ? GALLERY_COLUMNS.sm
      : width >= 576
        ? GALLERY_COLUMNS.xs
        : GALLERY_COLUMNS.base;

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
  /** Inclusive indexes into DIFFICULTY_ORDER; Surprise me draws from inside it. */
  const [difficultyRange, setDifficultyRange] = useState<DifficultyRange>(FULL_DIFFICULTY_RANGE);
  /** Difficulties the player has expanded past the one-row preview. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hideCompleted, setHideCompleted] = useState(false);
  const [solved, setSolved] = useState<Set<string>>(() => new Set());
  const [inProgress, setInProgress] = useState<Map<string, SavedGameSummary>>(() => new Map());
  // See the open effect below: the filters are seeded once, not per open
  const filtersSeeded = useRef(false);

  const layout = useResponsiveLayout();
  const isMobile = layout.width <= 768;
  const perRow = previewCount(layout.width);

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
    if (!opened) return;
    setSolved(completedSignatures());
    setInProgress(savedGameSummaries());
    /*
     * The filters belong to the player, not to whatever they are playing.
     *
     * They used to be reset from the current puzzle on every open, so picking
     * something under "Any operations" that happened to be a + - puzzle
     * narrowed the filter to + - the next time round - the gallery quietly
     * followed you instead of staying where you left it. Seeded once from
     * whatever is loaded, then left alone for the session.
     */
    if (!filtersSeeded.current) {
      filtersSeeded.current = true;
      setSize(initialSize);
      setOperationsTier(initialOperationsTier);
    }
  }, [opened, initialSize, initialOperationsTier]);

  /*
   * Everything the filters currently admit, flat. The bands below are just this
   * set grouped for display, and the shuffle button draws from it directly, so
   * a random pick can only ever be a puzzle the player can already see.
   */
  const matching = useMemo(() => {
    if (!catalog) return [];
    return catalog.filter(
      entry =>
        entry.size === size &&
        (operationsTier === ANY_OPS || entry.operationsTier === operationsTier) &&
        difficultyInRange(entry.difficulty, difficultyRange) &&
        !(hideCompleted && solved.has(entry.cagesSig))
    );
  }, [catalog, size, operationsTier, difficultyRange, hideCompleted, solved]);

  const groups = useMemo(() => groupByDifficulty(matching), [matching]);

  /*
   * A section expanded under one filter should not stay expanded under the
   * next: changing size or range gives you a different set of puzzles, and
   * reopening to five fully expanded sections buries the controls.
   */
  useEffect(() => {
    setExpanded(new Set());
  }, [size, operationsTier, difficultyRange]);

  const pausedEntries = useMemo(() => {
    if (!catalog || inProgress.size === 0) return [];
    const bySig = new Map(catalog.map(entry => [entry.cagesSig, entry]));
    return [...inProgress.entries()]
      .sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt))
      .map(([sig]) => bySig.get(sig))
      .filter((entry): entry is CatalogEntry => entry !== undefined);
  }, [catalog, inProgress]);

  const totalShown = matching.length;

  // Progress is reported against the whole size/ops filter, independent of
  // whether completed puzzles are currently hidden from view.
  const { filterTotal, solvedCount } = useMemo(() => {
    if (!catalog) return { filterTotal: 0, solvedCount: 0 };
    let total = 0;
    let done = 0;
    for (const entry of catalog) {
      if (entry.size !== size) continue;
      if (operationsTier !== ANY_OPS && entry.operationsTier !== operationsTier) continue;
      if (!difficultyInRange(entry.difficulty, difficultyRange)) continue;
      total++;
      if (solved.has(entry.cagesSig)) done++;
    }
    return { filterTotal: total, solvedCount: done };
  }, [catalog, size, operationsTier, difficultyRange, solved]);

  const renderTile = (entry: CatalogEntry) => {
    const isSolved = solved.has(entry.cagesSig);
    const paused = inProgress.get(entry.cagesSig);
    const isCurrent = entry.index === currentPuzzleIndex;
    const border = isCurrent
      ? 'var(--mantine-color-indigo-5)'
      : paused
        ? 'var(--mantine-color-yellow-5)'
        : isSolved
          ? 'var(--mantine-color-green-3)'
          : 'transparent';

    return (
      <UnstyledButton
        key={entry.index}
        onClick={() => handleSelect(entry)}
        aria-label={
          `${paused ? 'Resume' : 'Play'} ${entry.size}×${entry.size} puzzle, ` +
          `${entry.difficulty}, difficulty ${entry.score.toFixed(1)}` +
          (paused ? `, paused at ${formatCompletionTime(paused.elapsedTime)}` : '') +
          (isSolved ? ', completed' : '')
        }
        style={{
          borderRadius: 8,
          padding: 4,
          border: `2px solid ${border}`,
          background: 'rgba(148, 163, 184, 0.12)',
        }}
      >
        <Box style={{ position: 'relative' }}>
          <PuzzleThumbnail size={entry.size} cages={entry.record.puzzle.cages} />
          {(paused || isSolved) && (
            <Box
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                color: paused ? 'var(--mantine-color-yellow-7)' : 'var(--mantine-color-green-6)',
                background: '#fff',
                borderRadius: '50%',
                lineHeight: 0,
              }}
            >
              {paused ? <IconPlayerPauseFilled size={16} /> : <IconCircleCheckFilled size={16} />}
            </Box>
          )}
        </Box>
        <Text size="xs" fw={700} ta="center" mt={2} c="gray.7">
          {entry.score.toFixed(1)}
        </Text>
        {/* The band is per size while the number is not, so it goes on the tile */}
        <Text
          size="10px"
          ta="center"
          fw={600}
          lh={1.1}
          c={`${DIFFICULTY_COLOR[entry.difficulty]}.8`}
        >
          {entry.difficulty}
        </Text>
        {paused ? (
          <Text size="10px" ta="center" c="yellow.8" fw={600} lh={1.1}>
            {formatCompletionTime(paused.elapsedTime)}
          </Text>
        ) : (
          /* Only worth showing when tiles can differ in operations */
          operationsTier === ANY_OPS && (
            <Text size="10px" ta="center" c="dimmed" lh={1.1}>
              {OPERATION_TIER_LABELS[entry.operationsTier]}
            </Text>
          )
        )}
      </UnstyledButton>
    );
  };

  /**
   * A grid of tiles capped at one row, with the button that lifts the
   * cap. `key` identifies the section in the expanded set; sections short
   * enough to show whole get no button.
   */
  const renderSection = (key: string, entries: CatalogEntry[], header: React.ReactNode) => {
    const isExpanded = expanded.has(key);
    const shown = isExpanded ? entries : entries.slice(0, perRow);
    const hidden = entries.length - shown.length;

    return (
      <Stack key={key} gap="xs">
        {header}
        <SimpleGrid cols={GALLERY_COLUMNS} spacing="xs">
          {shown.map(renderTile)}
        </SimpleGrid>
        {(hidden > 0 || isExpanded) && (
          <Button
            size="compact-xs"
            radius="xl"
            variant="subtle"
            color="gray"
            style={{ alignSelf: 'center' }}
            rightSection={
              isExpanded ? <IconChevronUp size="0.8rem" /> : <IconChevronDown size="0.8rem" />
            }
            onClick={() =>
              setExpanded(previous => {
                const next = new Set(previous);
                if (!next.delete(key)) next.add(key);
                return next;
              })
            }
          >
            {isExpanded ? 'Show fewer' : `Show all ${entries.length}`}
          </Button>
        )}
      </Stack>
    );
  };

  const handleSelect = (entry: CatalogEntry) => {
    triggerHapticFeedback('medium');
    onSelectPuzzle(entry.record, entry.index);
    onClose();
  };

  const handleRandom = () => {
    const entry = pickRandomEntry(matching, currentPuzzleIndex);
    if (entry) handleSelect(entry);
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
                  data={[
                    { value: ANY_OPS, label: 'Any' },
                    ...OPERATION_TIERS.map(tier => ({
                      value: tier,
                      label: OPERATION_TIER_LABELS[tier],
                    })),
                  ]}
                />
              </Stack>
            </Group>

            {/* Difficulty range. The named band is per size, so every size has
                all five and a range always has puzzles in it - unlike the
                0-100 score, on which a 4x4 never reaches the top. Surprise me
                draws from whatever the range admits. */}
            <Stack gap={2}>
              <Group gap="xs" justify="space-between">
                <Text size="xs" fw={600} c="dimmed">
                  Difficulty
                </Text>
                <Text size="xs" c="dimmed" style={{ textTransform: 'capitalize' }}>
                  {describeDifficultyRange(difficultyRange)}
                </Text>
              </Group>
              <RangeSlider
                size="sm"
                minRange={0}
                min={0}
                max={DIFFICULTY_ORDER.length - 1}
                step={1}
                value={difficultyRange}
                onChange={setDifficultyRange}
                label={value => DIFFICULTY_ORDER[value]}
                marks={DIFFICULTY_ORDER.map((level, index) => ({ value: index, label: level }))}
                styles={{ markLabel: { fontSize: 9 } }}
                mb="lg"
                aria-label="Difficulty range"
              />
            </Stack>

            <Group gap="sm" justify="space-between" wrap="wrap">
              <Group gap="md" wrap="nowrap">
                {/* Sits with the filters because it obeys them */}
                <Button
                  size="xs"
                  radius="xl"
                  variant="light"
                  color="indigo"
                  leftSection={<IconDice5 size="1rem" />}
                  onClick={handleRandom}
                  disabled={totalShown === 0}
                  aria-label="Play a random puzzle matching these filters"
                >
                  Surprise me
                </Button>
                <Switch
                  size="sm"
                  checked={hideCompleted}
                  onChange={event => setHideCompleted(event.currentTarget.checked)}
                  label="Hide completed"
                />
              </Group>
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

        {/* Games in progress, shown regardless of the filters - these are what
            the player came back for, so they should not be filtered away. */}
        {pausedEntries.length > 0 &&
          renderSection(
            'in-progress',
            pausedEntries,
            <Group gap="xs" align="center">
              <IconPlayerPauseFilled size={14} color="var(--mantine-color-yellow-7)" />
              <Text size="sm" fw={700}>
                In progress
              </Text>
              <Text size="xs" c="dimmed">
                {pausedEntries.length}
              </Text>
            </Group>
          )}

        {/* One section per named difficulty, easiest first */}
        {groups.map(group =>
          renderSection(
            group.difficulty,
            group.entries,
            <Group gap="xs" align="center">
              <Badge
                size="sm"
                radius="sm"
                variant="light"
                color={DIFFICULTY_COLOR[group.difficulty]}
                style={{ textTransform: 'capitalize' }}
              >
                {group.difficulty}
              </Badge>
              <Text size="xs" c="dimmed">
                {group.entries.length}
              </Text>
            </Group>
          )
        )}
      </Stack>
    </Modal>
  );
};

export default PuzzleGallery;
