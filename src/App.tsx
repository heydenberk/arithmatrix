import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Select,
  Loader,
  Text,
  Title,
  Alert,
  Stack,
  Group,
  ActionIcon,
  Card,
  Badge,
  ThemeIcon,
  Center,
  Button,
  Tooltip,
  rem,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconTrophy,
  IconSparkles,
  IconRefresh,
  IconPlus,
  IconSettings,
  IconBookmark,
  IconBookmarkOff,
  IconRestore,
} from '@tabler/icons-react';
import ArithmatrixGrid, { ArithmatrixGridHandle } from './components/ArithmatrixGrid';
import Timer from './components/Timer';
import { saveCompletedPuzzle, bindStatsToWindow } from './utils/puzzleStats';
import {
  saveGameState,
  loadGameState,
  clearGameState,
  hasSavedGameState,
  hasUserProgress,
  deserializePencilMarks,
  PersistedGameState,
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

// New type for the raw data structure from JSONL
type RawPuzzleData = {
  puzzle: {
    size: number;
    cages: Cage[];
    solution: number[][];
    difficulty_operations?: number;
  };
  metadata: {
    size: number;
    actual_difficulty: string;
    operation_count: number;
    generation_time: number;
    generated_at: string;
    generator_version: string;
  };
};

// New type including the solution
type PuzzleData = PuzzleDefinition & {
  solution: number[][];
  difficulty: string;
  difficulty_operations?: number;
};

// Removed placeholder functions generatePlaceholderPuzzle and fetchPuzzleDefinition

// Difficulty bounds based on difficulty_operations per size
const difficultyBounds = {
  4: {
    easiest: [10, 16],
    easy: [16, 18],
    medium: [18, 20],
    hard: [20, 22],
    expert: [22, 29],
  },
  5: {
    easiest: [16, 24],
    easy: [24, 26],
    medium: [26, 28],
    hard: [28, 30],
    expert: [30, 40],
  },
  6: {
    easiest: [28, 35],
    easy: [35, 37],
    medium: [37, 39],
    hard: [39, 42],
    expert: [42, 55],
  },
  7: {
    easiest: [38, 47],
    easy: [47, 49],
    medium: [49, 52],
    hard: [52, 55],
    expert: [55, 65],
  },
};

// Helper function to get difficulty bounds for a given size and difficulty
const getDifficultyBounds = (size: number, difficulty: string): [number, number] => {
  const sizeBounds = difficultyBounds[size as keyof typeof difficultyBounds];
  if (!sizeBounds) {
    // Default to size 7 bounds if size not found
    return (difficultyBounds[7][difficulty as keyof (typeof difficultyBounds)[7]] || [49, 52]) as [
      number,
      number,
    ];
  }
  return (sizeBounds[difficulty as keyof typeof sizeBounds] || sizeBounds.medium) as [
    number,
    number,
  ];
};

// Helper functions for URL parameter management
const getURLParams = () => {
  const params = new URLSearchParams(window.location.search);
  const size = parseInt(params.get('size') || '7', 10);
  const difficulty = params.get('difficulty') || 'medium';

  // Validate size (between 4 and 7)
  const validSize = size >= 4 && size <= 7 ? size : 7;

  // Validate difficulty
  const validDifficulties = ['easiest', 'easy', 'medium', 'hard', 'expert'];
  const validDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'medium';

  return { size: validSize, difficulty: validDifficulty };
};

const updateURL = (size: number, difficulty: string) => {
  const params = new URLSearchParams();
  params.set('size', size.toString());
  params.set('difficulty', difficulty);

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newURL);
};

function App() {
  // Initialize puzzle stats system
  useEffect(() => {
    bindStatsToWindow();
  }, []);

  // Separate effect to handle saved state loading on app initialization
  useEffect(() => {
    const loadSavedStateOnStartup = async () => {
      console.log('🎯 App startup effect running...');
      console.log('🔍 hasSavedGameState():', hasSavedGameState());
      console.log('🗂️ localStorage item:', localStorage.getItem('arithmatrix_current_game_state'));

      if (hasSavedGameState()) {
        try {
          console.log('🔄 App startup: Checking for saved state...');
          const savedState = loadGameState();
          if (savedState) {
            console.log('🚀 App startup: Loading saved game state...', savedState);

            // Restore puzzle and solution
            setPuzzleDefinition(savedState.puzzleDefinition);
            setSolutionGrid(savedState.solutionGrid);

            // Restore puzzle settings
            setPuzzleSize(savedState.puzzleSettings.size);
            setDifficulty(savedState.puzzleSettings.difficulty);
            setSelectedSize(savedState.puzzleSettings.size);
            setSelectedDifficulty(savedState.puzzleSettings.difficulty);

            // Update URL to match restored settings
            updateURL(savedState.puzzleSettings.size, savedState.puzzleSettings.difficulty);

            // Prepare initial state for ArithmatrixGrid
            setInitialGridValues(savedState.gridValues);
            setInitialPencilMarks(deserializePencilMarks(savedState.pencilMarks));

            // Restore game timing
            setGameStartTime(savedState.metadata.startedAt);
            setCurrentCompletionTime(savedState.metadata.elapsedTime);

            setHasLoadedSavedState(true);
            hasLoadedSavedStateRef.current = true;
            setLoading(false);
            console.log('✅ Saved state loaded successfully, hasLoadedSavedState set to true');
            return true; // Indicate that saved state was loaded
          }
        } catch (error) {
          console.error('❌ Failed to load saved game state:', error);
          clearGameState();
        }
      } else {
        console.log('📭 No saved state found during startup');
      }
      return false; // No saved state was loaded
    };

    loadSavedStateOnStartup();
  }, []); // Run only once on app startup

  // Initialize state from URL parameters
  const initialParams = getURLParams();
  const [puzzleSize, setPuzzleSize] = useState<number>(initialParams.size);
  const [difficulty, setDifficulty] = useState<string>(initialParams.difficulty);

  // Separate state for UI selections (what user has selected but not yet applied)
  const [selectedSize, setSelectedSize] = useState<number>(initialParams.size);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(initialParams.difficulty);

  const [puzzleDefinition, setPuzzleDefinition] = useState<PuzzleDefinition | null>(null);

  const [solutionGrid, setSolutionGrid] = useState<number[][] | null>(null); // State for the solution
  const [loading, setLoading] = useState<boolean>(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true); // Add state for timer
  const [isGameWon, setIsGameWon] = useState<boolean>(false); // State for win condition
  const [showNewGameControls, setShowNewGameControls] = useState<boolean>(false); // State for showing new game controls
  const [resetKey, setResetKey] = useState<number>(0); // Key to force ArithmatrixGrid re-render for reset
  const [puzzleRefreshKey, setPuzzleRefreshKey] = useState<number>(0); // Key to force new puzzle fetch
  const [currentCompletionTime, setCurrentCompletionTime] = useState<number>(0); // Track current puzzle completion time
  const [initialGridValues, setInitialGridValues] = useState<string[][] | undefined>(undefined);
  const [initialPencilMarks, setInitialPencilMarks] = useState<Set<string>[][] | undefined>(
    undefined
  );
  const [gameStartTime, setGameStartTime] = useState<Date>(new Date());
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState<boolean>(false);
  const hasLoadedSavedStateRef = useRef<boolean>(false);

  // Checkpoint state
  const [checkpointGridValues, setCheckpointGridValues] = useState<string[][] | null>(null);
  const [checkpointPencilMarks, setCheckpointPencilMarks] = useState<Set<string>[][] | null>(null);
  const [hasCheckpoint, setHasCheckpoint] = useState<boolean>(false);

  // Ref for ArithmatrixGrid component
  const arithmatrixGridRef = useRef<ArithmatrixGridHandle>(null);

  useEffect(() => {
    console.log('🧩 Puzzle loading effect triggered with:', {
      puzzleSize,
      difficulty,
      puzzleRefreshKey,
      hasLoadedSavedState,
      hasLoadedSavedStateRef: hasLoadedSavedStateRef.current,
    });

    // Function to fetch puzzle data from the JSONL file
    const loadPuzzle = async () => {
      // Skip loading new puzzle if saved state was already loaded on startup
      if (hasLoadedSavedStateRef.current && puzzleRefreshKey === 0) {
        console.log('⏭️ Skipping puzzle load - saved state already loaded');
        return;
      }

      console.log('🔄 Loading new puzzle...');

      setLoading(true);
      setError(null);

      setPuzzleDefinition(null); // Clear old puzzle while loading
      setSolutionGrid(null); // Clear old solution while loading
      setInitialGridValues(undefined); // Clear initial state
      setInitialPencilMarks(undefined);
      console.log(`Fetching puzzle: Size ${puzzleSize}, Difficulty ${difficulty}...`); // Updated log

      try {
        const response = await fetch('/all_puzzles.jsonl');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        const lines = text.trim().split('\n');
        const puzzles: PuzzleData[] = [];

        // Parse each line as JSON
        for (const line of lines) {
          if (line.trim()) {
            try {
              const rawPuzzle = JSON.parse(line) as RawPuzzleData;
              // Transform the raw data into our expected format
              const puzzle: PuzzleData = {
                size: rawPuzzle.puzzle.size,
                cages: rawPuzzle.puzzle.cages,
                solution: rawPuzzle.puzzle.solution,
                difficulty: rawPuzzle.metadata.actual_difficulty,
                difficulty_operations: rawPuzzle.puzzle.difficulty_operations,
              };
              puzzles.push(puzzle);
            } catch (parseError) {
              console.warn('Failed to parse line:', line, parseError);
            }
          }
        }

        console.log(`Loaded ${puzzles.length} total puzzles`);
        console.log('puzzles', puzzles);

        // Get difficulty bounds for the selected size and difficulty
        const [minOps, maxOps] = getDifficultyBounds(puzzleSize, difficulty);

        // Filter puzzles by size and difficulty_operations bounds
        const filteredPuzzles = puzzles.filter(
          puzzle =>
            puzzle.size === puzzleSize &&
            puzzle.difficulty_operations !== undefined &&
            puzzle.difficulty_operations >= minOps &&
            puzzle.difficulty_operations <= maxOps
        );

        console.log(
          `Found ${filteredPuzzles.length} puzzles matching size ${puzzleSize} and difficulty ${difficulty} (operations: ${minOps}-${maxOps})`
        );

        if (filteredPuzzles.length === 0) {
          throw new Error(`No puzzles found for size ${puzzleSize} and difficulty ${difficulty}`);
        }

        // Select a random puzzle from the filtered results
        const randomIndex = Math.floor(Math.random() * filteredPuzzles.length);
        const selectedPuzzle = filteredPuzzles[randomIndex];

        console.log('Puzzle data received:', selectedPuzzle); // Debug log
        setPuzzleDefinition({
          size: selectedPuzzle.size,
          cages: selectedPuzzle.cages,
          difficulty_operations: selectedPuzzle.difficulty_operations,
        }); // Set definition part
        setSolutionGrid(selectedPuzzle.solution); // Set the solution grid

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
    if (!hasLoadedSavedStateRef.current || puzzleRefreshKey > 0) {
      setIsGameWon(false); // Reset win state when puzzle settings change
      setShowNewGameControls(false); // Hide new game controls when loading new puzzle
      setCurrentCompletionTime(0); // Reset completion time when loading new puzzle
      console.log('🔄 Resetting game state for new puzzle');
    } else {
      console.log('⏭️ Skipping game state reset - loading from saved state');
    }
  }, [puzzleSize, difficulty, puzzleRefreshKey]); // Refetch when puzzleSize, difficulty, or puzzleRefreshKey changes

  // Effect to handle browser back/forward navigation only
  useEffect(() => {
    // Handle browser back/forward navigation
    const handlePopState = () => {
      const urlParams = getURLParams();
      setPuzzleSize(urlParams.size);
      setDifficulty(urlParams.difficulty);
      // Also update the selected values to match URL
      setSelectedSize(urlParams.size);
      setSelectedDifficulty(urlParams.difficulty);
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

  // Handler for game state changes - save to localStorage
  const handleGameStateChange = (gridValues: string[][], pencilMarks: Set<string>[][]) => {
    console.log('🎮 handleGameStateChange called:', {
      hasPuzzleDefinition: !!puzzleDefinition,
      hasSolutionGrid: !!solutionGrid,
      hasUserProgress: hasUserProgress(gridValues),
      currentCompletionTime,
      puzzleSize,
      difficulty,
    });

    if (puzzleDefinition && solutionGrid && hasUserProgress(gridValues)) {
      saveGameState(
        puzzleDefinition,
        solutionGrid,
        gridValues,
        pencilMarks,
        { size: puzzleSize, difficulty },
        currentCompletionTime,
        gameStartTime
      );
    }
  };

  // Handlers for size and difficulty changes - Now only update UI state
  const handleSizeChange = (value: string | null) => {
    if (value) {
      const newSize = parseInt(value, 10);
      setSelectedSize(newSize);
    }
  };

  // Handler for difficulty change - Now only update UI state
  const handleDifficultyChange = (value: string | null) => {
    if (value) {
      setSelectedDifficulty(value);
    }
  };

  // Handler for starting a new game with selected settings
  const handleStartNewGame = () => {
    clearGameState(); // Clear any saved game state
    setHasLoadedSavedState(false); // Reset the loaded state flag
    hasLoadedSavedStateRef.current = false; // Reset the ref flag
    setPuzzleSize(selectedSize);
    setDifficulty(selectedDifficulty);
    updateURL(selectedSize, selectedDifficulty);
    setIsTimerRunning(true);
    setShowNewGameControls(false);
    setCurrentCompletionTime(0); // Reset completion time
    // Clear checkpoint when starting new game
    setCheckpointGridValues(null);
    setCheckpointPencilMarks(null);
    setHasCheckpoint(false);
    setResetKey(prev => prev + 1); // Reset the grid key as well
    setPuzzleRefreshKey(prev => prev + 1); // Force new puzzle fetch even if settings are the same
  };

  // Handler for reset button - resets current puzzle progress
  const handleReset = () => {
    setResetKey(prev => prev + 1); // Force ArithmatrixGrid to re-render and reset
    setIsTimerRunning(true); // Resume timer
    setIsGameWon(false); // Reset win state
    setCurrentCompletionTime(0); // Reset completion time
    // Clear checkpoint when resetting
    setCheckpointGridValues(null);
    setCheckpointPencilMarks(null);
    setHasCheckpoint(false);
    console.log('Puzzle reset');
  };

  // Handler for new game button - shows size/difficulty controls and resets selections
  const handleNewGame = () => {
    if (!showNewGameControls) {
      // When opening the menu, reset selections to current values
      setSelectedSize(puzzleSize);
      setSelectedDifficulty(difficulty);
    }
    setShowNewGameControls(!showNewGameControls);
  };

  // Handler for creating/clearing checkpoint
  const handleCreateCheckpoint = () => {
    if (hasCheckpoint) {
      // Clear existing checkpoint
      setCheckpointGridValues(null);
      setCheckpointPencilMarks(null);
      setHasCheckpoint(false);
      console.log('Checkpoint cleared');
    } else {
      // Create new checkpoint by calling the grid component's method
      if (arithmatrixGridRef.current) {
        arithmatrixGridRef.current.createCheckpoint();
      }
    }
  };

  // Handler for reverting to checkpoint
  const handleRevertToCheckpoint = () => {
    if (hasCheckpoint && checkpointGridValues && checkpointPencilMarks) {
      // Set the checkpoint data as initial values and force grid re-render
      setInitialGridValues(checkpointGridValues);
      setInitialPencilMarks(checkpointPencilMarks);
      setResetKey(prev => prev + 1); // Force ArithmatrixGrid to re-render with checkpoint data
      console.log('Reverted to checkpoint');
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
      saveCompletedPuzzle(puzzleDefinition, difficulty, currentCompletionTime);
    }

    // Clear saved game state since puzzle is completed
    clearGameState();
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
          className="animate-pulse"
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
            animationDelay: '1s',
          }}
          className="animate-pulse"
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
            animationDelay: '2s',
          }}
          className="animate-pulse"
        />
      </Box>

      <Container
        size="md"
        style={{
          position: 'relative',
          zIndex: 10,
          paddingTop: rem(32),
          paddingBottom: rem(16),
          maxWidth: rem(700),
        }}
      >
        <Stack gap="md">
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
                radius="xl"
                p="lg"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow:
                    '0 20px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
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
                  key={resetKey}
                  ref={arithmatrixGridRef}
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
                </Stack>
              </Center>
            </Card>
          )}
        </Stack>

        {/* Controls Section - Moved to bottom */}
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
          <Stack align="center" gap="sm">
            {/* Timer and Action Buttons */}
            {!loading && !error && puzzleDefinition && solutionGrid && (
              <Group justify="center" align="center" gap="md" wrap="wrap">
                {/* Timer */}
                <Timer
                  isRunning={isTimerRunning}
                  setIsRunning={setIsTimerRunning}
                  resetKey={resetKey}
                  initialTime={currentCompletionTime}
                  onTimeUpdate={setCurrentCompletionTime}
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

                {/* New Game Button */}
                <Button
                  onClick={handleNewGame}
                  radius="xl"
                  size="sm"
                  variant="gradient"
                  gradient={{ from: 'teal', to: 'blue' }}
                  leftSection={
                    showNewGameControls ? <IconSettings size="1rem" /> : <IconPlus size="1rem" />
                  }
                  style={{
                    transition: 'all 200ms ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                    },
                  }}
                >
                  {showNewGameControls ? 'Settings' : 'New Game'}
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
                      height: rem(36), // Match button height
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'help',
                    }}
                  >
                    {puzzleSize}×{puzzleSize} • {difficulty}
                  </Badge>
                </Tooltip>
              </Group>
            )}

            {/* Conditional Puzzle Settings - Only show when New Game is clicked */}
            {showNewGameControls && (
              <Group justify="center" gap="sm" wrap="wrap">
                {/* Size Selector */}
                <Stack align="center" gap={rem(4)}>
                  <Text size="xs" fw={600} c="gray.6">
                    Size
                  </Text>
                  <Select
                    value={selectedSize.toString()}
                    onChange={handleSizeChange}
                    size="xs"
                    data={[
                      { value: '4', label: '4×4' },
                      { value: '5', label: '5×5' },
                      { value: '6', label: '6×6' },
                      { value: '7', label: '7×7' },
                    ]}
                    styles={{
                      input: {
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: rem(50),
                        fontWeight: 600,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        '&:focus': {
                          boxShadow: '0 0 0 4px rgba(139, 92, 246, 0.3)',
                        },
                      },
                    }}
                  />
                </Stack>

                {/* Difficulty Selector */}
                <Stack align="center" gap={rem(4)}>
                  <Text size="xs" fw={600} c="gray.6">
                    Difficulty
                  </Text>
                  <Select
                    value={selectedDifficulty}
                    onChange={handleDifficultyChange}
                    size="xs"
                    data={[
                      { value: 'easiest', label: 'Easiest' },
                      { value: 'easy', label: 'Easy' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'hard', label: 'Hard' },
                      { value: 'expert', label: 'Expert' },
                    ]}
                    styles={{
                      input: {
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: rem(50),
                        fontWeight: 600,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        textTransform: 'capitalize',
                        '&:focus': {
                          boxShadow: '0 0 0 4px rgba(236, 72, 153, 0.3)',
                        },
                      },
                    }}
                  />
                </Stack>

                {/* Start New Game Button */}
                <Stack align="center" gap={rem(4)}>
                  <Text size="xs" fw={600} c="gray.6">
                    Action
                  </Text>
                  <Button
                    onClick={handleStartNewGame}
                    radius="xl"
                    size="xs"
                    variant="gradient"
                    gradient={{ from: 'violet', to: 'cyan' }}
                    leftSection={<IconSparkles size="0.9rem" />}
                    style={{
                      transition: 'all 200ms ease',
                      fontWeight: 600,
                      '&:hover': {
                        transform: 'scale(1.05)',
                      },
                    }}
                  >
                    Start New Game
                  </Button>
                </Stack>
              </Group>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default App;
