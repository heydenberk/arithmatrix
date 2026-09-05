import React, { useState, useEffect, useRef, useCallback } from 'react';

import { APP_VERSION } from './version';
import {
  Box,
  Container,
  Paper,
  Loader,
  Text,
  Title,
  Alert,
  Stack,
  Group,
  Card,
  Badge,
  ThemeIcon,
  Center,
  Button,
  Tooltip,
  ActionIcon,
  Modal,
  List,
  rem,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconTrophy,
  IconLayoutGrid,
  IconDownload,
  IconX,
  IconRefresh,
} from '@tabler/icons-react';
import ArithmatrixGrid, { ArithmatrixGridHandle } from './components/ArithmatrixGrid';
import Timer from './components/Timer';
import PuzzleGallery from './components/PuzzleGallery';
import InstallDiagnostics from './components/InstallDiagnostics';
import {
  OPERATION_TIERS,
  DEFAULT_OPERATION_TIER,
  OPERATION_TIER_LABELS,
} from './constants/gameConstants';
import { RawPuzzleRecord, canonicalCagesSig, loadCatalog } from './utils/puzzleCatalog';
import { isTouchDevice } from './utils/touchUtils';
import { saveCompletedPuzzle, bindStatsToWindow } from './utils/puzzleStats';
import { evaluateAchievement, saveAchievement, type AchievementResult } from './utils/achievements';
import AchievementNotification from './components/AchievementNotification';
import AchievementGallery from './components/AchievementGallery';
import SolverPlayback from './components/SolverPlayback';
import DevPanel from './components/DevPanel';
import {
  saveGame,
  loadGameForPuzzle,
  deleteGameForPuzzle,
  hasSavedGames,
  deleteGame,
  mostRecentSavedGame,
  hasAnyProgress,
  deserializePencilMarks,
  SavedGame,
} from './utils/gameStatePersistence';

// Define the structure of a cage and the puzzle definition
type Cage = {
  value: number;
  operation: string;
  cells: number[];
};

type PuzzleDefinition = {
  size: number;
  cages: Cage[];
  difficulty_operations?: number;
};

// The raw JSONL shape and the derived catalog entry now live in
// utils/puzzleCatalog, which owns parsing the puzzle database.

// Removed placeholder functions generatePlaceholderPuzzle and fetchPuzzleDefinition

// Note: Difficulty bounds removed - now using human-centered difficulty system
// Puzzles are filtered by actual_difficulty field instead of difficulty_operations ranges

// Helper functions for URL parameter management
const getURLParams = () => {
  const params = new URLSearchParams(window.location.search);
  const size = parseInt(params.get('size') || '7', 10);
  const difficulty = params.get('difficulty') || 'medium';
  const ops = params.get('ops') || DEFAULT_OPERATION_TIER;
  // `p` pins one exact puzzle by its index in the database (set by the gallery)
  const rawPuzzleIndex = parseInt(params.get('p') || '', 10);
  const puzzleIndex =
    Number.isInteger(rawPuzzleIndex) && rawPuzzleIndex >= 0 ? rawPuzzleIndex : null;

  // Validate size (between 4 and 7)
  const validSize = size >= 4 && size <= 7 ? size : 7;

  // Validate difficulty
  const validDifficulties = ['easiest', 'easy', 'medium', 'hard', 'expert'];
  const validDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';

  // Validate operations tier
  const validOps = (OPERATION_TIERS as readonly string[]).includes(ops)
    ? ops
    : DEFAULT_OPERATION_TIER;

  return { size: validSize, difficulty: validDifficulty, operationsTier: validOps, puzzleIndex };
};

const updateURL = (
  size: number,
  difficulty: string,
  operationsTier: string,
  puzzleIndex?: number | null
) => {
  const params = new URLSearchParams();
  params.set('size', size.toString());
  params.set('difficulty', difficulty);
  if (operationsTier !== DEFAULT_OPERATION_TIER) {
    params.set('ops', operationsTier);
  }
  // Only present when a specific puzzle was chosen; a random new game drops it.
  if (puzzleIndex !== null && puzzleIndex !== undefined) {
    params.set('p', puzzleIndex.toString());
  }

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newURL);
};

/**
 * A canonical string for a puzzle's cages so we can match a puzzle in
 * `all_puzzles.jsonl` regardless of cage ordering. Each cage is rendered as
 * `value/op/sortedCells`, and the resulting list is sorted.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The install prompt is captured by an inline script in index.html, because
 * Chrome fires `beforeinstallprompt` once and can do so before React mounts.
 * See the comment there.
 */
const getInstallPrompt = (): BeforeInstallPromptEvent | null =>
  (window as unknown as { __installPrompt?: BeforeInstallPromptEvent | null }).__installPrompt ??
  null;

const clearInstallPrompt = () => {
  (window as unknown as { __installPrompt?: BeforeInstallPromptEvent | null }).__installPrompt =
    null;
};

/** True when the app is already running as an installed PWA. */
const isRunningInstalled = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  window.matchMedia?.('(display-mode: minimal-ui)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const INSTALL_DISMISSED_KEY = 'arithmatrix_install_dismissed';

function App() {
  // Install instructions modal state
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  // Whether Chrome has handed us a real install prompt to fire. Seeded from the
  // window in case the event landed before React mounted.
  const [canInstall, setCanInstall] = useState<boolean>(() => getInstallPrompt() !== null);
  const [installed, setInstalled] = useState<boolean>(() => isRunningInstalled());
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncInstallState = () => {
      setCanInstall(getInstallPrompt() !== null);
      setInstalled(isRunningInstalled());
    };
    window.addEventListener('installpromptchange', syncInstallState);
    window.addEventListener('appinstalled', syncInstallState);
    // The event may have fired between this component's first render and now.
    syncInstallState();
    return () => {
      window.removeEventListener('installpromptchange', syncInstallState);
      window.removeEventListener('appinstalled', syncInstallState);
    };
  }, []);

  // Handler to trigger the install prompt
  const handleInstallClick = async () => {
    const prompt = getInstallPrompt();
    if (!prompt) {
      // No native prompt available (iOS Safari, or Chrome hasn't offered one) -
      // fall back to telling the user where to find it.
      setShowInstallInstructions(true);
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      clearInstallPrompt();
      setCanInstall(false);
      setInstalled(true);
    }
  };

  const dismissInstallBanner = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // A failed write just means the banner can come back next session.
    }
  };

  // Only promote installing when Chrome has actually offered a prompt, the app
  // isn't already installed, and the player hasn't waved it away.
  const showInstallBanner = canInstall && !installed && !installDismissed;

  // Initialize puzzle stats system
  useEffect(() => {
    bindStatsToWindow();
  }, []);

  // If the URL pins a specific puzzle, load exactly that one. A saved game in
  // progress takes precedence, so reloading mid-puzzle resumes rather than
  // restarting.
  useEffect(() => {
    const pinned = initialParams.puzzleIndex;
    if (pinned === null || hasSavedGames()) return;
    let cancelled = false;
    setLoading(true);
    loadCatalog()
      .then(catalog => {
        if (cancelled) return;
        const entry = catalog.find(e => e.index === pinned);
        if (entry) {
          loadPuzzleRecord(entry.record, entry.index);
        } else {
          console.warn(`URL pinned puzzle ${pinned}, which is not in the database`);
        }
      })
      .catch(e => console.warn('pinned puzzle load failed', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate effect to handle saved state loading on app initialization
  useEffect(() => {
    // Drop the player back into whichever puzzle they were last playing.
    const savedState = mostRecentSavedGame();
    if (!savedState) return;
    try {
      restoreSavedGame(savedState);
      hasLoadedSavedStateRef.current = true;
      setLoading(false);
    } catch (error) {
      console.error('Failed to restore saved game:', error);
      deleteGame(savedState.cagesSig);
    }
    // Runs once on startup; restoreSavedGame is stable and intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize state from URL parameters
  const initialParams = getURLParams();
  const [puzzleSize, setPuzzleSize] = useState<number>(initialParams.size);
  const [difficulty, setDifficulty] = useState<string>(initialParams.difficulty);
  const [operationsTier, setOperationsTier] = useState<string>(initialParams.operationsTier);

  // Separate state for UI selections (what user has selected but not yet applied)

  const [puzzleDefinition, setPuzzleDefinition] = useState<PuzzleDefinition | null>(null);

  const [solutionGrid, setSolutionGrid] = useState<number[][] | null>(null); // State for the solution
  const [loading, setLoading] = useState<boolean>(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true); // Add state for timer
  const [isGameWon, setIsGameWon] = useState<boolean>(false); // State for win condition
  const [resetKey, setResetKey] = useState<number>(0); // Key to force ArithmatrixGrid re-render for reset
  const [currentCompletionTime, setCurrentCompletionTime] = useState<number>(0); // Track current puzzle completion time (used for initial restore)
  const completionTimeRef = useRef<number>(0); // Ref to avoid re-rendering App every second
  const [initialGridValues, setInitialGridValues] = useState<string[][] | undefined>(undefined);
  const [initialPencilMarks, setInitialPencilMarks] = useState<Set<string>[][] | undefined>(
    undefined
  );
  const [gameStartTime, setGameStartTime] = useState<Date>(new Date());
  const hasLoadedSavedStateRef = useRef<boolean>(false);

  // Checkpoint state
  const [checkpointGridValues, setCheckpointGridValues] = useState<string[][] | null>(null);
  const [checkpointPencilMarks, setCheckpointPencilMarks] = useState<Set<string>[][] | null>(null);
  const [hasCheckpoint, setHasCheckpoint] = useState<boolean>(false);

  // Ref for ArithmatrixGrid component
  const arithmatrixGridRef = useRef<ArithmatrixGridHandle>(null);

  // Mobile settings panel state
  // Use screen width to determine mobile layout, not touch capability
  // This ensures touchscreen laptops get the full desktop UI with checkpoint buttons
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Achievement state
  const [lastAchievement, setLastAchievement] = useState<AchievementResult | null>(null);
  const [showAchievementGallery, setShowAchievementGallery] = useState<boolean>(false);

  // Solver playback state
  const [solverActive, setSolverActive] = useState<boolean>(false);
  const latestGridValuesRef = useRef<string[][] | null>(null);
  const latestPencilMarksRef = useRef<Set<string>[][] | null>(null);

  // Current puzzle's index in public/all_puzzles.jsonl (so we can show it in
  // the Esc version overlay). null when unknown (we look it up on demand
  // below when the puzzle changes).
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState<number | null>(null);

  // Dev panel state (Cmd/Ctrl+G to toggle)
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);
  /*
   * The gallery is the only way to start a game, so it opens on arrival -
   * except when there is a saved game to resume, or the URL already names a
   * specific puzzle, in which case the player already has one.
   */
  const [showPuzzleGallery, setShowPuzzleGallery] = useState<boolean>(
    () => initialParams.puzzleIndex === null && !hasSavedGames()
  );
  // When the dev panel forces a specific puzzle, suppress the auto-reload
  // that would otherwise fire from puzzleSize/difficulty/ops state changes.
  // Also true from the start when the URL pins a puzzle via `p`, so the random
  // load is skipped and the pinned puzzle effect below wins the race.
  const suppressNextPuzzleLoadRef = useRef<boolean>(initialParams.puzzleIndex !== null);

  // Secret version display state
  const [showVersion, setShowVersion] = useState<boolean>(false);

  // Secret keyboard shortcut: Esc to show version
  const handleSecretVersionShortcut = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setShowVersion(true);
      setTimeout(() => setShowVersion(false), 2000);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleSecretVersionShortcut);
    return () => window.removeEventListener('keydown', handleSecretVersionShortcut);
  }, [handleSecretVersionShortcut]);

  // Whenever the puzzle changes but we don't know its index in the JSONL
  // (e.g. after restoring saved state), fetch the file once and look it up
  // by matching the cage signature. Cached on `window` so we don't refetch.
  useEffect(() => {
    if (!puzzleDefinition || currentPuzzleIndex !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const catalog = await loadCatalog();
        if (cancelled) return;
        const target = canonicalCagesSig(puzzleDefinition.cages);
        const match = catalog.find(entry => entry.cagesSig === target);
        if (match) setCurrentPuzzleIndex(match.index);
      } catch (e) {
        console.warn('puzzle index lookup failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzleDefinition, currentPuzzleIndex]);

  useEffect(() => {
    console.log('🧩 Puzzle loading effect triggered with:', {
      puzzleSize,
      difficulty,
      hasLoadedSavedStateRef: hasLoadedSavedStateRef.current,
    });

    // Function to fetch puzzle data from the JSONL file
    const loadPuzzle = async () => {
      // Skip loading new puzzle if saved state was already loaded on startup
      if (hasLoadedSavedStateRef.current) {
        console.log('⏭️ Skipping puzzle load - saved state already loaded');
        return;
      }
      // Skip if the dev panel just forced a specific puzzle.
      if (suppressNextPuzzleLoadRef.current) {
        suppressNextPuzzleLoadRef.current = false;
        console.log('⏭️ Skipping puzzle load - direct puzzle pin from dev panel');
        return;
      }

      console.log('🔄 Loading new puzzle...');

      setLoading(true);
      setError(null);

      setPuzzleDefinition(null); // Clear old puzzle while loading
      setSolutionGrid(null); // Clear old solution while loading
      setCurrentPuzzleIndex(null); // Clear stale index until the new one resolves
      setInitialGridValues(undefined); // Clear initial state
      setInitialPencilMarks(undefined);
      console.log(`Fetching puzzle: Size ${puzzleSize}, Difficulty ${difficulty}...`); // Updated log

      try {
        const catalog = await loadCatalog();

        // Filter puzzles by size, difficulty, and operations tier
        const filteredPuzzles = catalog.filter(
          entry =>
            entry.size === puzzleSize &&
            entry.difficulty === difficulty &&
            entry.operationsTier === operationsTier
        );

        console.log(
          `Found ${filteredPuzzles.length} puzzles matching size ${puzzleSize}, difficulty ${difficulty}, ops ${operationsTier}`
        );

        if (filteredPuzzles.length === 0) {
          throw new Error(
            `No puzzles found for size ${puzzleSize}, difficulty ${difficulty}, ops ${operationsTier}`
          );
        }

        // Select a random puzzle from the filtered results
        const randomIndex = Math.floor(Math.random() * filteredPuzzles.length);
        const selectedPuzzle = filteredPuzzles[randomIndex];

        setPuzzleDefinition({
          size: selectedPuzzle.record.puzzle.size,
          cages: selectedPuzzle.record.puzzle.cages,
          difficulty_operations: selectedPuzzle.record.puzzle.difficulty_operations,
        }); // Set definition part
        setSolutionGrid(selectedPuzzle.record.puzzle.solution); // Set the solution grid
        setCurrentPuzzleIndex(selectedPuzzle.index);

        // Clear initial state for new puzzles and set start time
        setInitialGridValues(undefined);
        setInitialPencilMarks(undefined);
        setGameStartTime(new Date());
      } catch (err) {
        console.error('Failed to fetch puzzle:', err); // Debug log
        setError(err instanceof Error ? err.message : 'Failed to fetch puzzle data.');
        setPuzzleDefinition(null); // Ensure no stale puzzle is shown on error
        setSolutionGrid(null); // Ensure no stale solution is stored on error
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();

    // Only reset state for new puzzles, not when loading saved state
    if (!hasLoadedSavedStateRef.current) {
      setIsGameWon(false); // Reset win state when puzzle settings change
      setCurrentCompletionTime(0);
      completionTimeRef.current = 0;
      console.log('🔄 Resetting game state for new puzzle');
    } else {
      console.log('⏭️ Skipping game state reset - loading from saved state');
    }
  }, [puzzleSize, difficulty, operationsTier]);

  // Effect to handle browser back/forward navigation only
  useEffect(() => {
    // Handle browser back/forward navigation
    const handlePopState = () => {
      const urlParams = getURLParams();
      setPuzzleSize(urlParams.size);
      setDifficulty(urlParams.difficulty);
      setOperationsTier(urlParams.operationsTier);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []); // Empty dependency array - only set up listener once

  // Effect to handle window focus/blur for timer pause/resume
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused, resuming timer');
      setIsTimerRunning(true);
    };

    const handleBlur = () => {
      console.log('Window blurred, pausing timer');
      setIsTimerRunning(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Cleanup listeners on component unmount
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  // Backtick (without shift) toggles the solver playback overlay.
  // Shift+backtick is already used elsewhere as the "solve all but one" cheat.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!puzzleDefinition) return;
        e.preventDefault();
        setSolverActive(prev => !prev);
      }
      // Cmd/Ctrl+G toggles the dev panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setDevPanelOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [puzzleDefinition]);

  // Stable callback for timer updates - writes to ref instead of state to avoid re-renders
  const handleTimeUpdate = useCallback((seconds: number) => {
    completionTimeRef.current = seconds;
  }, []);

  /*
   * The clock stops while the gallery is open. Time spent choosing a puzzle
   * would otherwise be charged to whichever game you were about to leave, and
   * that game's saved elapsed time is what the gallery reports back.
   * isTimerRunning also hides the board, which is the existing pause behaviour
   * and is invisible behind the modal.
   */
  useEffect(() => {
    setIsTimerRunning(!showPuzzleGallery && !isGameWon);
  }, [showPuzzleGallery, isGameWon]);

  // Handler for game state changes - save to localStorage
  const handleGameStateChange = (gridValues: string[][], pencilMarks: Set<string>[][]) => {
    latestGridValuesRef.current = gridValues;
    latestPencilMarksRef.current = pencilMarks;
    if (!puzzleDefinition || !solutionGrid) return;

    if (hasAnyProgress(gridValues, pencilMarks)) {
      saveGame(
        puzzleDefinition,
        solutionGrid,
        gridValues,
        pencilMarks,
        { size: puzzleSize, difficulty, operationsTier },
        completionTimeRef.current,
        gameStartTime,
        currentPuzzleIndex
      );
    } else {
      // Board cleared back to empty - it is no longer a game in progress
      deleteGameForPuzzle(puzzleDefinition);
    }
  };

  // Handler for reset button - resets current puzzle progress, timer, and solved state
  const handleReset = () => {
    // Clear initial values so grid starts fresh
    setInitialGridValues(undefined);
    setInitialPencilMarks(undefined);
    // Reset completion time BEFORE incrementing resetKey so Timer sees 0
    setCurrentCompletionTime(0);
    completionTimeRef.current = 0;
    // Force ArithmatrixGrid to re-render and reset
    setResetKey(prev => prev + 1);
    setIsTimerRunning(true); // Start timer fresh
    setIsGameWon(false); // Reset win state
    setLastAchievement(null);
    // Clear checkpoint when resetting
    setCheckpointGridValues(null);
    setCheckpointPencilMarks(null);
    setHasCheckpoint(false);
    // Clear this puzzle's saved progress; other games in progress are untouched
    if (puzzleDefinition) deleteGameForPuzzle(puzzleDefinition);
    console.log('Puzzle reset');
  };

  /**
   * Puts a saved game back on the board: its puzzle, its grid and pencil marks,
   * and its accumulated time. Used both on startup and when resuming a paused
   * puzzle from the gallery.
   */
  const restoreSavedGame = useCallback((saved: SavedGame) => {
    setPuzzleDefinition(saved.puzzleDefinition);
    setSolutionGrid(saved.solutionGrid);
    setCurrentPuzzleIndex(saved.puzzleIndex);

    setPuzzleSize(saved.puzzleSettings.size);
    setDifficulty(saved.puzzleSettings.difficulty);
    setOperationsTier(saved.puzzleSettings.operationsTier || DEFAULT_OPERATION_TIER);
    updateURL(
      saved.puzzleSettings.size,
      saved.puzzleSettings.difficulty,
      saved.puzzleSettings.operationsTier || DEFAULT_OPERATION_TIER,
      saved.puzzleIndex
    );

    setInitialGridValues(saved.gridValues);
    setInitialPencilMarks(deserializePencilMarks(saved.pencilMarks));

    // Resume the clock where it stopped
    setGameStartTime(new Date(saved.startedAt));
    setCurrentCompletionTime(saved.elapsedTime);
    completionTimeRef.current = saved.elapsedTime;
    setIsTimerRunning(true);
    setIsGameWon(false);
  }, []);

  /**
   * Loads one specific puzzle, identified by its line index in the puzzle
   * database, rather than a random one from the current size/difficulty
   * bucket. Shared by the puzzle gallery and the dev panel.
   */
  const loadPuzzleRecord = useCallback((record: RawPuzzleRecord, index: number) => {
    // Selecting a puzzle you already started resumes it rather than wiping it.
    const inProgress = loadGameForPuzzle({
      size: record.puzzle.size,
      cages: record.puzzle.cages,
      difficulty_operations: record.puzzle.difficulty_operations,
    });

    setCurrentPuzzleIndex(index);
    // Tell the loadPuzzle effect to skip the random-from-bucket
    // fetch — we're pinning a specific puzzle here.
    suppressNextPuzzleLoadRef.current = true;
    // Clear saved-state interception so future state changes proceed normally.
    hasLoadedSavedStateRef.current = false;
    latestGridValuesRef.current = null;
    latestPencilMarksRef.current = null;

    const newSize = record.puzzle.size;
    const newDifficulty = record.metadata.actual_difficulty;
    const newOps = record.metadata.operations_tier ?? DEFAULT_OPERATION_TIER;

    // Status bar / URL — keep them in sync with the loaded puzzle. The index
    // goes into the URL too, so the exact puzzle survives a reload or a share.
    setPuzzleSize(newSize);
    setDifficulty(newDifficulty);
    setOperationsTier(newOps);
    updateURL(newSize, newDifficulty, newOps, index);

    // Puzzle data
    setPuzzleDefinition({
      size: record.puzzle.size,
      cages: record.puzzle.cages,
      difficulty_operations: record.puzzle.difficulty_operations,
    });
    setSolutionGrid(record.puzzle.solution);
    setInitialGridValues(inProgress?.gridValues);
    setInitialPencilMarks(inProgress ? deserializePencilMarks(inProgress.pencilMarks) : undefined);

    // Game state: pick up where a paused puzzle left off, else start clean
    setIsGameWon(false);
    setCurrentCompletionTime(inProgress?.elapsedTime ?? 0);
    completionTimeRef.current = inProgress?.elapsedTime ?? 0;
    setCheckpointGridValues(null);
    setCheckpointPencilMarks(null);
    setHasCheckpoint(false);
    setLastAchievement(null);
    setGameStartTime(inProgress ? new Date(inProgress.startedAt) : new Date());
    setIsTimerRunning(true);
    // Force the grid to remount so it picks up the new puzzle cleanly.
    setResetKey(prev => prev + 1);
  }, []);

  // Handler for creating/updating checkpoint (always sets, even if one exists)
  const handleCreateCheckpoint = () => {
    // Create/update checkpoint by calling the grid component's method
    if (arithmatrixGridRef.current) {
      arithmatrixGridRef.current.createCheckpoint();
    }
  };

  // Handler for clearing the checkpoint
  const handleClearCheckpoint = () => {
    setCheckpointGridValues(null);
    setCheckpointPencilMarks(null);
    setHasCheckpoint(false);
    console.log('Checkpoint cleared');
  };

  // Handler for reverting to checkpoint
  const handleRevertToCheckpoint = () => {
    if (
      hasCheckpoint &&
      checkpointGridValues &&
      checkpointPencilMarks &&
      arithmatrixGridRef.current
    ) {
      // Use the undo stack so user can redo back to where they were
      arithmatrixGridRef.current.revertToCheckpoint(checkpointGridValues, checkpointPencilMarks);
      console.log('Reverted to checkpoint (redo available)');
    }
  };

  // Function to save checkpoint data (to be called by ArithmatrixGrid)
  const saveCheckpoint = (gridValues: string[][], pencilMarks: Set<string>[][]) => {
    setCheckpointGridValues(gridValues.map(row => [...row])); // Deep copy
    setCheckpointPencilMarks(pencilMarks.map(row => row.map(cell => new Set(cell)))); // Deep copy
    setHasCheckpoint(true);
    console.log('Checkpoint saved');
  };

  // Callback for when the puzzle is won
  const handleWin = () => {
    console.log('Puzzle solved!');
    setIsTimerRunning(false); // Pause the timer
    setIsGameWon(true); // Set the win state

    // Save puzzle stats to localStorage
    if (puzzleDefinition) {
      saveCompletedPuzzle(
        puzzleDefinition,
        difficulty,
        completionTimeRef.current,
        operationsTier,
        currentPuzzleIndex
      );
    }

    // Evaluate and save achievement
    const result = evaluateAchievement(
      puzzleSize,
      difficulty,
      operationsTier,
      completionTimeRef.current
    );
    if (result.isNew || result.isUpgrade) {
      saveAchievement(
        puzzleSize,
        difficulty,
        operationsTier,
        result.tier,
        completionTimeRef.current
      );
      setLastAchievement(result);
    } else {
      setLastAchievement(null);
    }

    // A finished puzzle is no longer in progress
    if (puzzleDefinition) deleteGameForPuzzle(puzzleDefinition);
  };

  return (
    <Box
      className="gradient-background"
      style={{
        minHeight: '100vh',
        position: 'relative',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      {/* Animated background elements */}
      <Box
        style={{
          position: 'fixed',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <Box
          style={{
            position: 'absolute',
            top: rem(-160),
            right: rem(-160),
            width: rem(400),
            height: rem(400),
            background:
              'radial-gradient(circle, rgba(196, 181, 253, 0.4) 0%, rgba(233, 213, 255, 0.2) 100%)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: rem(-160),
            left: rem(-160),
            width: rem(400),
            height: rem(400),
            background:
              'radial-gradient(circle, rgba(147, 197, 253, 0.4) 0%, rgba(165, 180, 252, 0.2) 100%)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: rem(300),
            height: rem(300),
            background:
              'radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
            borderRadius: '50%',
            filter: 'blur(40px)',
          }}
        />
      </Box>

      <Container
        size="md"
        style={{
          position: 'relative',
          zIndex: 10,
          paddingTop: isMobile ? rem(1) : rem(32),
          paddingBottom: isMobile ? rem(1) : rem(16),
          paddingLeft: isMobile ? 0 : undefined,
          paddingRight: isMobile ? 0 : undefined,
          maxWidth: rem(700),
        }}
      >
        <Stack gap={isMobile ? 'xs' : 'md'}>
          {/* Install prompt - only shown when Chrome has offered a real one */}
          {showInstallBanner && (
            <Paper
              radius="lg"
              p={isMobile ? 'xs' : 'sm'}
              style={{
                background: 'rgba(255, 255, 255, 0.92)',
                boxShadow: '0 8px 20px -8px rgba(0, 0, 0, 0.25)',
                marginLeft: isMobile ? rem(6) : undefined,
                marginRight: isMobile ? rem(6) : undefined,
              }}
            >
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <ThemeIcon
                    size={isMobile ? 'md' : 'lg'}
                    radius="xl"
                    variant="gradient"
                    gradient={{ from: 'indigo', to: 'violet' }}
                  >
                    <IconDownload size="1rem" />
                  </ThemeIcon>
                  <Text size="sm" fw={600} c="gray.8" style={{ minWidth: 0 }}>
                    Add Arithmatrix to your home screen
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="xs"
                    radius="xl"
                    variant="gradient"
                    gradient={{ from: 'indigo', to: 'violet' }}
                    onClick={handleInstallClick}
                  >
                    Install
                  </Button>
                  <ActionIcon
                    size="md"
                    radius="xl"
                    variant="subtle"
                    color="gray"
                    onClick={dismissInstallBanner}
                    aria-label="Dismiss install prompt"
                  >
                    <IconX size="1rem" />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          )}

          {/* Loading state with elegant spinner */}
          {loading && (
            <Paper
              radius="xl"
              p="xl"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
              }}
            >
              <Center>
                <Group gap="md">
                  <Loader color="indigo" size="md" />
                  <Text size="xl" fw={500} c="gray.7">
                    Loading puzzle...
                  </Text>
                </Group>
              </Center>
            </Paper>
          )}

          {/* Error state with enhanced styling */}
          {error && (
            <Alert
              color="red"
              radius="xl"
              icon={<IconAlertCircle size="1.5rem" />}
              styles={{
                root: {
                  backgroundColor: 'rgba(254, 242, 242, 0.85)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(252, 165, 165, 0.5)',
                  boxShadow:
                    '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                },
              }}
            >
              <Stack gap="xs">
                <Text fw={600} size="lg">
                  Error Loading Puzzle
                </Text>
                <Text>{error}</Text>
              </Stack>
            </Alert>
          )}

          {/* Game grid with container styling */}
          {!loading && !error && puzzleDefinition && solutionGrid && (
            <Center>
              <Paper
                radius={isMobile ? 'md' : 'xl'}
                p={isMobile ? 0 : 'lg'}
                style={{
                  backgroundColor: isMobile ? 'transparent' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: isMobile ? 'none' : 'blur(20px)',
                  WebkitBackdropFilter: isMobile ? 'none' : 'blur(20px)',
                  border: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: isMobile
                    ? 'none'
                    : '0 20px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                <ArithmatrixGrid
                  puzzleDefinition={puzzleDefinition}
                  solution={solutionGrid}
                  onWin={handleWin}
                  isTimerRunning={isTimerRunning}
                  isGameWon={isGameWon}
                  initialGridValues={initialGridValues}
                  initialPencilMarks={initialPencilMarks}
                  onStateChange={handleGameStateChange}
                  onCheckpointRequested={saveCheckpoint}
                  hasCheckpoint={hasCheckpoint}
                  onCreateCheckpoint={handleCreateCheckpoint}
                  onRevertToCheckpoint={handleRevertToCheckpoint}
                  onClearCheckpoint={handleClearCheckpoint}
                  key={resetKey}
                  ref={arithmatrixGridRef}
                  timerElement={
                    <Timer
                      isRunning={isTimerRunning}
                      setIsRunning={setIsTimerRunning}
                      resetKey={resetKey}
                      initialTime={currentCompletionTime}
                      onTimeUpdate={handleTimeUpdate}
                    />
                  }
                  onReset={handleReset}
                  onNewGame={() => setShowPuzzleGallery(true)}
                  onInstall={handleInstallClick}
                  onShowAchievements={() => setShowAchievementGallery(true)}
                />
              </Paper>
            </Center>
          )}

          {/* Empty state */}
          {!loading && !error && !puzzleDefinition && (
            <Paper
              radius="xl"
              p="xl"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
              }}
            >
              <Center>
                <Stack align="center" gap="md">
                  <ThemeIcon size={64} radius="xl" color="gray.4">
                    <IconAlertCircle size="2rem" />
                  </ThemeIcon>
                  <Title order={3} c="gray.7">
                    Puzzle Unavailable
                  </Title>
                  <Text c="gray.5">Could not load puzzle data. Please try again.</Text>
                </Stack>
              </Center>
            </Paper>
          )}

          {/* Win celebration with enhanced styling */}
          {isGameWon && (
            <Card
              radius="xl"
              p="xl"
              style={{
                background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
                color: 'white',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Celebration particles */}
              <Box style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                <Box
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '25%',
                    width: rem(16),
                    height: rem(16),
                    backgroundColor: '#fde047',
                    borderRadius: '50%',
                    animation: 'bounce 1s infinite 0.1s',
                  }}
                />
                <Box
                  style={{
                    position: 'absolute',
                    top: rem(16),
                    right: '25%',
                    width: rem(12),
                    height: rem(12),
                    backgroundColor: '#fef3c7',
                    borderRadius: '50%',
                    animation: 'bounce 1s infinite 0.3s',
                  }}
                />
                <Box
                  style={{
                    position: 'absolute',
                    bottom: rem(16),
                    left: '33%',
                    width: rem(8),
                    height: rem(8),
                    backgroundColor: '#facc15',
                    borderRadius: '50%',
                    animation: 'bounce 1s infinite 0.5s',
                  }}
                />
              </Box>

              <Center>
                <Stack align="center" gap="md" style={{ position: 'relative', zIndex: 10 }}>
                  <ThemeIcon
                    size={80}
                    radius="xl"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                  >
                    <IconTrophy size="2.5rem" />
                  </ThemeIcon>
                  <Title order={1}>🎉 Congratulations! 🎉</Title>
                  <Text size="xl" style={{ opacity: 0.9 }}>
                    You solved the puzzle!
                  </Text>
                  {lastAchievement && (
                    <AchievementNotification
                      result={lastAchievement}
                      size={puzzleSize}
                      difficulty={difficulty}
                    />
                  )}
                </Stack>
              </Center>
            </Card>
          )}
        </Stack>

        {/* Controls Section - Desktop only (mobile controls are in ArithmatrixControls) */}
        {!isMobile && (
          <Paper
            mt="md"
            radius="xl"
            p="md"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
            }}
          >
            <Stack align="center" gap="xs">
              {/* Timer and Action Buttons */}
              {!loading && !error && puzzleDefinition && solutionGrid && (
                <Group justify="center" align="center" gap="md" wrap="wrap">
                  {/* Timer */}
                  <Timer
                    isRunning={isTimerRunning}
                    setIsRunning={setIsTimerRunning}
                    resetKey={resetKey}
                    initialTime={currentCompletionTime}
                    onTimeUpdate={handleTimeUpdate}
                  />

                  {/* Reset Button */}
                  <Button
                    onClick={handleReset}
                    radius="xl"
                    size="sm"
                    variant="gradient"
                    gradient={{ from: 'orange', to: 'red' }}
                    leftSection={<IconRefresh size="1rem" />}
                    style={{
                      transition: 'all 200ms ease',
                      '&:hover': {
                        transform: 'scale(1.05)',
                      },
                    }}
                  >
                    Reset
                  </Button>

                  {/* New Game - opens the puzzle gallery, the only picker */}
                  <Button
                    onClick={() => setShowPuzzleGallery(true)}
                    radius="xl"
                    size="sm"
                    variant="gradient"
                    gradient={{ from: 'teal', to: 'blue' }}
                    leftSection={<IconLayoutGrid size="1rem" />}
                    style={{
                      transition: 'all 200ms ease',
                      '&:hover': {
                        transform: 'scale(1.05)',
                      },
                    }}
                  >
                    New Game
                  </Button>

                  {/* Combined Size and Difficulty Pill */}
                  <Tooltip
                    label={
                      puzzleDefinition?.difficulty_operations
                        ? `Difficulty: ${puzzleDefinition.difficulty_operations.toLocaleString()} operations`
                        : 'Difficulty information not available'
                    }
                    position="bottom"
                  >
                    <Badge
                      size="lg"
                      radius="xl"
                      variant="gradient"
                      gradient={{ from: 'indigo', to: 'pink' }}
                      style={{
                        textTransform: 'capitalize',
                        padding: `${rem(8)} ${rem(16)}`,
                        fontSize: rem(14),
                        fontWeight: 600,
                        height: rem(36),
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'help',
                      }}
                    >
                      {puzzleSize}×{puzzleSize} • {difficulty}
                      {operationsTier !== 'all'
                        ? ` • ${OPERATION_TIER_LABELS[operationsTier]}`
                        : ''}
                    </Badge>
                  </Tooltip>

                  {/* Achievements Trophy */}
                  <Tooltip label="Achievements" position="bottom">
                    <ActionIcon
                      onClick={() => setShowAchievementGallery(true)}
                      size="lg"
                      radius="xl"
                      variant="gradient"
                      gradient={{ from: 'yellow', to: 'orange' }}
                    >
                      <IconTrophy size="1.2rem" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Stack>
          </Paper>
        )}
      </Container>

      {/* Puzzle Gallery - the only way to start a game */}
      <PuzzleGallery
        opened={showPuzzleGallery}
        onClose={() => setShowPuzzleGallery(false)}
        initialSize={puzzleSize}
        initialOperationsTier={operationsTier}
        currentPuzzleIndex={currentPuzzleIndex}
        onSelectPuzzle={loadPuzzleRecord}
      />

      {/* Install Instructions Modal */}
      <Modal
        opened={showInstallInstructions}
        onClose={() => setShowInstallInstructions(false)}
        title={<Text fw={700}>Install Arithmatrix</Text>}
        centered
        size="sm"
      >
        <Stack gap="md">
          {/iphone|ipad|ipod/i.test(navigator.userAgent) ? (
            <>
              <Text size="sm">To add Arithmatrix to your home screen:</Text>
              <List size="sm" spacing="xs">
                <List.Item>
                  Tap the <b>Share</b> button (square with arrow) at the bottom of Safari
                </List.Item>
                <List.Item>
                  Scroll down and tap <b>"Add to Home Screen"</b>
                </List.Item>
                <List.Item>
                  Tap <b>"Add"</b> to confirm
                </List.Item>
              </List>
            </>
          ) : (
            <>
              <Text size="sm">To install Arithmatrix as an app:</Text>
              <List size="sm" spacing="xs">
                <List.Item>
                  Tap the <b>browser menu</b> (three dots) in the top-right of Chrome
                </List.Item>
                <List.Item>
                  Look for <b>"Install app"</b> or <b>"Add to Home Screen"</b>
                </List.Item>
                <List.Item>
                  If neither appears, the details below say why — copy them and send them over
                </List.Item>
              </List>
            </>
          )}
          <Text size="xs" c="dimmed">
            The app will launch in its own window with no browser bar, just like a native app.
          </Text>
          <InstallDiagnostics />
        </Stack>
      </Modal>

      {/* Achievement Gallery Modal */}
      <AchievementGallery
        opened={showAchievementGallery}
        onClose={() => setShowAchievementGallery(false)}
      />

      {/* Solver playback overlay - triggered by backtick */}
      {solverActive && puzzleDefinition && (
        <SolverPlayback
          puzzleDefinition={puzzleDefinition}
          initialGridValues={latestGridValuesRef.current ?? initialGridValues}
          initialPencilMarks={latestPencilMarksRef.current ?? initialPencilMarks}
          solution={solutionGrid ?? undefined}
          onExit={() => setSolverActive(false)}
        />
      )}

      {/* Dev panel - triggered by Cmd/Ctrl+G */}
      {devPanelOpen && (
        <DevPanel onClose={() => setDevPanelOpen(false)} onLoadPuzzleByIndex={loadPuzzleRecord} />
      )}

      {/* Secret version overlay - triggered by Esc */}
      {showVersion && (
        <Box
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            borderRadius: 8,
            fontSize: 12,
            fontFamily: 'monospace',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
          }}
        >
          v{APP_VERSION}
          {currentPuzzleIndex !== null && ` · #${currentPuzzleIndex}`}
        </Box>
      )}
    </Box>
  );
}

export default App;
