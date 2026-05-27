/**
 * SolverPlayback — UI for stepping through the solver's reasoning.
 *
 * Triggered by the backtick key. Computes the full solver trace up front,
 * then plays it back with step/play/speed controls and plain-language
 * commentary for each step.
 */

import { useEffect, useMemo } from 'react';
import { ActionIcon, Badge, Box, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconX,
} from '@tabler/icons-react';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
  TECHNIQUE_LABELS,
  TechniqueId,
} from '../utils/solver';
import { TECHNIQUE_ORDER, useSolverPlayback } from '../hooks/useSolverPlayback';
import {
  generateCageColorMap,
  getBorderClasses,
  getCageColorClass,
  getCageInfo,
  getCageTextColorClass,
} from '../utils/arithmatrixUtils';

type Props = {
  puzzleDefinition: PuzzleDefinition;
  // Optional initial grid (so the solver can pick up from current game state)
  initialGridValues?: string[][];
  // User's pencil marks — used as starting candidate sets for the solver
  initialPencilMarks?: Set<string>[][];
  // Known solution — used to detect & repair invalid user candidate marks
  solution?: number[][];
  onExit: () => void;
};

const SolverPlayback = ({ puzzleDefinition, initialGridValues, initialPencilMarks, solution, onExit }: Props) => {
  const size = puzzleDefinition.size;

  // Compute the trace once
  const result = useMemo(() => {
    const startGrid = initialGridValues
      ? initialGridValues.map(row => row.map(v => (v === '' ? 0 : parseInt(v, 10) || 0)))
      : undefined;

    // Convert pencil marks (Set<string>) to Set<number>. Only pass through if
    // the user has actually marked something on at least one cell.
    let startCandidates: Set<number>[][] | undefined;
    if (initialPencilMarks) {
      let hasAny = false;
      const converted: Set<number>[][] = initialPencilMarks.map(row =>
        row.map(s => {
          const conv = new Set<number>();
          for (const v of s) {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n)) {
              conv.add(n);
              hasAny = true;
            }
          }
          return conv;
        })
      );
      if (hasAny) startCandidates = converted;
    }

    return solveWithTrace(puzzleDefinition, { startGrid, startCandidates, solution });
  }, [puzzleDefinition, initialGridValues, initialPencilMarks, solution]);

  const playback = useSolverPlayback(result, size);
  const {
    currentStep,
    stepIndex,
    totalSteps,
    isPlaying,
    isAtEnd,
    speed,
    cumulativeScore,
    cumulativeCounts,
    stepForward,
    stepBack,
    play,
    pause,
    jumpToEnd,
    jumpToStart,
    setSpeed,
  } = playback;

  // Keyboard: Esc / backtick to exit; arrows + space for step controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey)) {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepForward(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBack(); }
      else if (e.key === ' ') {
        e.preventDefault();
        if (isPlaying) pause(); else play();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onExit, stepForward, stepBack, play, pause, isPlaying]);

  // Visual state: derive grid + candidates from current step (or initial if before-step)
  const startGrid = useMemo(
    () =>
      initialGridValues
        ? initialGridValues.map(row => row.map(v => (v === '' ? 0 : parseInt(v, 10) || 0)))
        : Array.from({ length: size }, () => Array(size).fill(0)),
    [initialGridValues, size]
  );
  const displayGrid = currentStep?.grid ?? startGrid;
  // For candidates: when no step yet, show full {1..size} for empty cells
  const displayCandidates: Set<number>[][] = useMemo(() => {
    if (currentStep) return currentStep.candidates;
    return Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        startGrid[r][c] === 0 ? new Set<number>(Array.from({ length: size }, (_, i) => i + 1)) : new Set<number>()
      )
    );
  }, [currentStep, size, startGrid]);

  const highlightSet = useMemo(() => {
    const s = new Set<string>();
    (currentStep?.highlight ?? []).forEach(h => s.add(`${h.row}-${h.col}`));
    return s;
  }, [currentStep]);

  const supportSet = useMemo(() => {
    const s = new Set<string>();
    (currentStep?.supportCells ?? []).forEach(h => s.add(`${h.row}-${h.col}`));
    return s;
  }, [currentStep]);

  const cageColorMap = useMemo(() => generateCageColorMap(puzzleDefinition), [puzzleDefinition]);

  // Score readout
  const normalized = normalizeScore(cumulativeScore, size);
  const level = difficultyLevel(normalized);

  const headerText = currentStep
    ? `Step ${stepIndex + 1} of ${totalSteps}`
    : totalSteps === 0
      ? 'Already solved'
      : `Ready — ${totalSteps} steps`;

  const description = currentStep?.description ?? (totalSteps === 0
    ? 'No solver steps needed — the puzzle is already in its final state.'
    : 'Press Step or Play to start the solver.');

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(40, 30, 80, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <Group justify="space-between" align="center" w="100%" style={{ maxWidth: 800, marginBottom: 12 }}>
        <Group gap="xs">
          <Badge size="lg" color="violet" variant="filled">Solver</Badge>
          <Text c="white" size="sm" fw={500}>{headerText}</Text>
        </Group>
        <Tooltip label="Exit (Esc or `)" position="bottom">
          <ActionIcon variant="filled" color="gray" size="lg" radius="xl" onClick={onExit}>
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Grid */}
      <SolverGrid
        puzzleDefinition={puzzleDefinition}
        grid={displayGrid}
        candidates={displayCandidates}
        cageColorMap={cageColorMap}
        highlight={highlightSet}
        support={supportSet}
      />

      {/* Commentary */}
      <Box
        style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: 16,
          marginTop: 16,
          maxWidth: 720,
          width: '100%',
          minHeight: 80,
        }}
      >
        <Stack gap={6}>
          {currentStep && (
            <Group gap="xs">
              <Badge color={techniqueColor(currentStep.technique)} variant="light">
                {TECHNIQUE_LABELS[currentStep.technique]}
              </Badge>
              <Text size="xs" c="dimmed">+{currentStep.scoreDelta} pts</Text>
            </Group>
          )}
          <Text size="sm">{description}</Text>
        </Stack>
      </Box>

      {/* Score readout */}
      <Box
        style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: 12,
          marginTop: 12,
          maxWidth: 720,
          width: '100%',
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">Difficulty score</Text>
            <Group gap="xs" align="baseline">
              <Text size="xl" fw={700}>{normalized.toFixed(1)}</Text>
              <Text size="xs" c="dimmed">/ 100</Text>
              <Badge color={levelColor(level)} variant="filled">{level}</Badge>
            </Group>
            <Text size="xs" c="dimmed">raw {cumulativeScore}</Text>
          </Stack>
          <Group gap="xs" wrap="wrap">
            {TECHNIQUE_ORDER.map(t => (
              <Badge
                key={t}
                color={techniqueColor(t)}
                variant={cumulativeCounts[t] > 0 ? 'filled' : 'light'}
                size="sm"
              >
                {TECHNIQUE_LABELS[t]}: {cumulativeCounts[t]}
              </Badge>
            ))}
          </Group>
        </Group>
      </Box>

      {/* Controls */}
      <Group gap="xs" mt={16} wrap="wrap" justify="center">
        <Tooltip label="Jump to start"><ActionIcon variant="default" size="lg" radius="xl" onClick={jumpToStart}>
          <IconPlayerSkipBack size={18} />
        </ActionIcon></Tooltip>
        <Tooltip label="Step back (←)"><ActionIcon variant="default" size="lg" radius="xl" onClick={stepBack} disabled={stepIndex < 0}>
          <IconChevronLeft size={18} />
        </ActionIcon></Tooltip>
        {isPlaying ? (
          <Tooltip label="Pause (Space)"><ActionIcon variant="filled" color="violet" size="xl" radius="xl" onClick={pause}>
            <IconPlayerPause size={22} />
          </ActionIcon></Tooltip>
        ) : (
          <Tooltip label="Play (Space)"><ActionIcon variant="filled" color="violet" size="xl" radius="xl" onClick={() => play()} disabled={isAtEnd}>
            <IconPlayerPlay size={22} />
          </ActionIcon></Tooltip>
        )}
        <Tooltip label="Step forward (→)"><ActionIcon variant="default" size="lg" radius="xl" onClick={stepForward} disabled={isAtEnd}>
          <IconChevronRight size={18} />
        </ActionIcon></Tooltip>
        <Tooltip label="Jump to end"><ActionIcon variant="default" size="lg" radius="xl" onClick={jumpToEnd}>
          <IconPlayerSkipForward size={18} />
        </ActionIcon></Tooltip>
      </Group>

      {/* Speed picker */}
      <Group gap="xs" mt={10} justify="center">
        {(['slow', 'normal', 'fast'] as const).map(s => (
          <Button
            key={s}
            size="xs"
            radius="xl"
            variant={speed === s ? 'filled' : 'light'}
            color="violet"
            onClick={() => setSpeed(s)}
          >
            {s}
          </Button>
        ))}
      </Group>
    </Box>
  );
};

// ---------- Sub-components ----------

type SolverGridProps = {
  puzzleDefinition: PuzzleDefinition;
  grid: number[][];
  candidates: Set<number>[][];
  cageColorMap: Map<number, number>;
  highlight: Set<string>;
  support: Set<string>;
};

const SolverGrid = ({ puzzleDefinition, grid, candidates, cageColorMap, highlight, support }: SolverGridProps) => {
  const size = puzzleDefinition.size;
  // Pick a cell size that fits — keep it simple, no responsive math here
  const cellSize = Math.max(36, Math.min(72, Math.floor((Math.min(window.innerWidth - 32, 720)) / size) - 4));
  const pencilGridSizeClass = size <= 4 ? 'size-2x2' : 'size-3x3';

  return (
    <Box
      className="arithmatrix-grid"
      style={{
        gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
        columnGap: 2,
        padding: 8,
        ['--cell-size' as never]: `${cellSize}px`,
        ['--cell-height' as never]: `${cellSize}px`,
        ['--cell-font-size' as never]: `${Math.max(1, cellSize / 32)}rem`,
        ['--pencil-font-size' as never]: `${Math.max(0.5, cellSize / 80)}rem`,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
      }}
    >
      {grid.map((row, r) =>
        row.map((value, c) => {
          const cellIndex = r * size + c;
          const cageIndex = puzzleDefinition.cages.findIndex(cage => cage.cells.includes(cellIndex));
          const colorClass = getCageColorClass(cageIndex, cageColorMap);
          const textColorClass = getCageTextColorClass(cageIndex, cageColorMap);
          const borderClasses = getBorderClasses(r, c, puzzleDefinition);
          const cageInfo = getCageInfo(r, c, puzzleDefinition);
          const cellKey = `${r}-${c}`;
          const isHighlight = highlight.has(cellKey);
          const isSupport = !isHighlight && support.has(cellKey);
          const cellClasses = [
            'arithmatrix-cell',
            'relative',
            colorClass,
            textColorClass,
            borderClasses,
            isHighlight ? 'selected-cell' : '',
          ].filter(Boolean).join(' ');
          const supportStyle: React.CSSProperties = isSupport
            ? { boxShadow: 'inset 0 0 0 3px rgba(250, 176, 5, 0.85)', zIndex: 1 }
            : {};
          const cellCandidates = candidates[r]?.[c] ?? new Set<number>();
          return (
            <div key={`${r}-${c}`} className={cellClasses} style={supportStyle}>
              {cageInfo && (
                <div className="cage-info" role="note">{cageInfo.text}</div>
              )}
              <div className="cell-input-container">
                {value !== 0 ? (
                  <div className="cell-input" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--cell-font-size)', fontWeight: 700, height: '100%',
                  }}>
                    {value}
                  </div>
                ) : (
                  <div className="pencil-marks-container overlay">
                    <div className={`pencil-marks-grid ${pencilGridSizeClass}`}>
                      {Array.from({ length: size }, (_, i) => i + 1).map(num => (
                        <div key={num} className="pencil-mark">
                          {cellCandidates.has(num) ? String(num) : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </Box>
  );
};

function techniqueColor(t: TechniqueId): string {
  switch (t) {
    case 'stipulated': return 'gray';
    case 'naked_single': return 'teal';
    case 'cage_impossible': return 'lime';
    case 'hidden_single': return 'blue';
    case 'cage_single': return 'grape';
    case 'cage_locked': return 'cyan';
    case 'cage_intersection': return 'indigo';
    case 'cage_combinations': return 'violet';
    case 'multi_cage_line_lock': return 'pink';
    case 'cross_cage_feasibility': return 'orange';
    case 'trial_and_error': return 'red';
  }
}

function levelColor(level: ReturnType<typeof difficultyLevel>): string {
  switch (level) {
    case 'easiest': return 'green';
    case 'easy': return 'teal';
    case 'medium': return 'yellow';
    case 'hard': return 'orange';
    case 'expert': return 'red';
  }
}

export default SolverPlayback;
