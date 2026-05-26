/**
 * useSolverPlayback
 *
 * Drives playback of a precomputed SolverResult: keeps a pointer into the
 * steps array and exposes step/play/pause/speed controls. The grid + score
 * shown to the UI are derived from the step at the current index.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SolverResult,
  SolverStep,
  TECHNIQUE_LABELS,
  TechniqueId,
} from '../utils/solver';

export type SolverSpeed = 'step' | 'slow' | 'normal' | 'fast' | 'instant';

const SPEED_INTERVAL_MS: Record<Exclude<SolverSpeed, 'step' | 'instant'>, number> = {
  slow: 700,
  normal: 250,
  fast: 60,
};

export type SolverPlaybackState = {
  result: SolverResult;
  size: number;
  // -1 means "before step 0" — i.e., initial state
  stepIndex: number;
  currentStep: SolverStep | null;
  isPlaying: boolean;
  speed: SolverSpeed;
  isAtEnd: boolean;
  // Convenience getters
  cumulativeScore: number;
  cumulativeCounts: Record<TechniqueId, number>;
  totalSteps: number;
};

export type SolverPlaybackControls = {
  stepForward: () => void;
  stepBack: () => void;
  play: (speed?: Exclude<SolverSpeed, 'step' | 'instant'>) => void;
  pause: () => void;
  jumpToEnd: () => void;
  jumpToStart: () => void;
  setSpeed: (s: SolverSpeed) => void;
};

const EMPTY_COUNTS: Record<TechniqueId, number> = {
  naked_single: 0,
  hidden_single: 0,
  cage_single: 0,
  cage_intersection: 0,
  cage_combinations: 0,
  multi_cage_line_lock: 0,
  cross_cage_feasibility: 0,
  trial_and_error: 0,
};

export function useSolverPlayback(
  result: SolverResult,
  size: number
): SolverPlaybackState & SolverPlaybackControls {
  const [stepIndex, setStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SolverSpeed>('normal');
  const intervalRef = useRef<number | null>(null);

  const totalSteps = result.steps.length;
  const isAtEnd = stepIndex >= totalSteps - 1;

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stepForward = useCallback(() => {
    setStepIndex(i => Math.min(totalSteps - 1, i + 1));
  }, [totalSteps]);

  const stepBack = useCallback(() => {
    setStepIndex(i => Math.max(-1, i - 1));
  }, []);

  const jumpToEnd = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    setStepIndex(totalSteps - 1);
  }, [stopInterval, totalSteps]);

  const jumpToStart = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    setStepIndex(-1);
  }, [stopInterval]);

  const pause = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
  }, [stopInterval]);

  const play = useCallback(
    (newSpeed?: Exclude<SolverSpeed, 'step' | 'instant'>) => {
      const useSpeed: SolverSpeed = newSpeed ?? (speed === 'step' || speed === 'instant' ? 'normal' : speed);
      if (newSpeed) setSpeed(newSpeed);
      stopInterval();
      setIsPlaying(true);
      const interval = SPEED_INTERVAL_MS[useSpeed as Exclude<SolverSpeed, 'step' | 'instant'>] ?? SPEED_INTERVAL_MS.normal;
      intervalRef.current = window.setInterval(() => {
        setStepIndex(i => {
          if (i >= totalSteps - 1) {
            stopInterval();
            setIsPlaying(false);
            return totalSteps - 1;
          }
          return i + 1;
        });
      }, interval);
    },
    [speed, stopInterval, totalSteps]
  );

  // If speed changes while playing, restart with new interval
  useEffect(() => {
    if (isPlaying && speed !== 'step' && speed !== 'instant') {
      play(speed as Exclude<SolverSpeed, 'step' | 'instant'>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  // Cleanup on unmount
  useEffect(() => stopInterval, [stopInterval]);

  const currentStep = stepIndex >= 0 && stepIndex < totalSteps ? result.steps[stepIndex] : null;
  const cumulativeScore = currentStep?.cumulativeScore ?? 0;
  const cumulativeCounts = currentStep?.cumulativeCounts ?? EMPTY_COUNTS;

  return useMemo(
    () => ({
      result,
      size,
      stepIndex,
      currentStep,
      isPlaying,
      speed,
      isAtEnd,
      cumulativeScore,
      cumulativeCounts,
      totalSteps,
      stepForward,
      stepBack,
      play,
      pause,
      jumpToEnd,
      jumpToStart,
      setSpeed,
    }),
    [
      result,
      size,
      stepIndex,
      currentStep,
      isPlaying,
      speed,
      isAtEnd,
      cumulativeScore,
      cumulativeCounts,
      totalSteps,
      stepForward,
      stepBack,
      play,
      pause,
      jumpToEnd,
      jumpToStart,
    ]
  );
}

export const TECHNIQUE_ORDER: TechniqueId[] = [
  'naked_single',
  'hidden_single',
  'cage_single',
  'cage_intersection',
  'cage_combinations',
  'multi_cage_line_lock',
  'cross_cage_feasibility',
  'trial_and_error',
];

export { TECHNIQUE_LABELS };
