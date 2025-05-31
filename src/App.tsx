import React, { useState, useEffect } from "react";
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
  rem,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconTrophy,
  IconSparkles,
  IconRefresh,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import KenkenGrid from "./components/KenkenGrid";
import Timer from "./components/Timer";

// Define the structure of a cage and the puzzle definition
interface Cage {
  value: number;
  operation: string;
  cells: number[];
}

interface PuzzleDefinition {
  size: number;
  cages: Cage[];
}

// New interface including the solution
interface PuzzleData extends PuzzleDefinition {
  solution: number[][];
}

// Removed placeholder functions generatePlaceholderPuzzle and fetchPuzzleDefinition

function App() {
  // Keep state for size and difficulty for potential future dynamic updates
  const [puzzleSize, setPuzzleSize] = useState<number>(7); // Default to 7 based on image
  const [difficulty, setDifficulty] = useState<string>("medium"); // Default to Medium based on image
  const [puzzleDefinition, setPuzzleDefinition] =
    useState<PuzzleDefinition | null>(null);
  const [solutionGrid, setSolutionGrid] = useState<number[][] | null>(null); // State for the solution
  const [loading, setLoading] = useState<boolean>(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true); // Add state for timer
  const [isGameWon, setIsGameWon] = useState<boolean>(false); // State for win condition
  const [showNewGameControls, setShowNewGameControls] =
    useState<boolean>(false); // State for showing new game controls
  const [resetKey, setResetKey] = useState<number>(0); // Key to force KenkenGrid re-render for reset

  useEffect(() => {
    // Function to fetch puzzle data from the backend API
    const loadPuzzle = async () => {
      setLoading(true);
      setError(null);
      setPuzzleDefinition(null); // Clear old puzzle while loading
      setSolutionGrid(null); // Clear old solution while loading
      console.log(
        `Fetching puzzle: Size ${puzzleSize}, Difficulty ${difficulty}...`
      ); // Updated log

      try {
        const response = await fetch(
          `/api/puzzle?size=${puzzleSize}&difficulty=${difficulty}`
        );
        if (!response.ok) {
          let errorMsg = `HTTP error! status: ${response.status}`;
          try {
            // Try to parse a JSON error message from the backend
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg; // Use backend error if available
          } catch (parseError) {
            // If response is not JSON, use the status text or default message
            errorMsg = response.statusText || errorMsg;
          }
          throw new Error(errorMsg);
        }
        const data: PuzzleData = await response.json();
        console.log("Puzzle data received:", data); // Debug log
        setPuzzleDefinition({ size: data.size, cages: data.cages }); // Set definition part
        setSolutionGrid(data.solution); // Set the solution grid
      } catch (err) {
        console.error("Failed to fetch puzzle:", err); // Debug log
        setError(
          err instanceof Error ? err.message : "Failed to fetch puzzle data."
        );
        setPuzzleDefinition(null); // Ensure no stale puzzle is shown on error
        setSolutionGrid(null); // Ensure no stale solution is stored on error
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();
    setIsGameWon(false); // Reset win state when puzzle settings change
    setShowNewGameControls(false); // Hide new game controls when loading new puzzle
    // Dependency array now includes difficulty
  }, [puzzleSize, difficulty]); // Refetch when puzzleSize or difficulty changes

  // Effect to handle window focus/blur for timer pause/resume
  useEffect(() => {
    const handleFocus = () => {
      console.log("Window focused, resuming timer");
      setIsTimerRunning(true);
    };

    const handleBlur = () => {
      console.log("Window blurred, pausing timer");
      setIsTimerRunning(false);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Cleanup listeners on component unmount
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  // Handlers for size and difficulty changes - Keep for potential future use
  const handleSizeChange = (value: string | null) => {
    if (value) {
      setPuzzleSize(parseInt(value, 10));
      setIsTimerRunning(true); // Ensure timer is running for new puzzle
      setShowNewGameControls(false); // Hide controls after selection
    }
  };

  // Handler for difficulty change
  const handleDifficultyChange = (value: string | null) => {
    if (value) {
      setDifficulty(value);
      setIsTimerRunning(true); // Ensure timer is running for new puzzle
      setShowNewGameControls(false); // Hide controls after selection
    }
  };

  // Handler for reset button - resets current puzzle progress
  const handleReset = () => {
    setResetKey((prev) => prev + 1); // Force KenkenGrid to re-render and reset
    setIsTimerRunning(true); // Resume timer
    setIsGameWon(false); // Reset win state
    console.log("Puzzle reset");
  };

  // Handler for new game button - shows size/difficulty controls
  const handleNewGame = () => {
    setShowNewGameControls(!showNewGameControls);
  };

  // Callback for when the puzzle is won
  const handleWin = () => {
    console.log("Puzzle solved!");
    setIsTimerRunning(false); // Pause the timer
    setIsGameWon(true); // Set the win state
  };

  return (
    <Box
      className="gradient-background"
      style={{
        minHeight: "100vh",
        position: "relative",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      {/* Animated background elements */}
      <Box
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <Box
          style={{
            position: "absolute",
            top: rem(-160),
            right: rem(-160),
            width: rem(400),
            height: rem(400),
            background:
              "radial-gradient(circle, rgba(196, 181, 253, 0.4) 0%, rgba(233, 213, 255, 0.2) 100%)",
            borderRadius: "50%",
            filter: "blur(60px)",
          }}
          className="animate-pulse"
        />
        <Box
          style={{
            position: "absolute",
            bottom: rem(-160),
            left: rem(-160),
            width: rem(400),
            height: rem(400),
            background:
              "radial-gradient(circle, rgba(147, 197, 253, 0.4) 0%, rgba(165, 180, 252, 0.2) 100%)",
            borderRadius: "50%",
            filter: "blur(60px)",
            animationDelay: "1s",
          }}
          className="animate-pulse"
        />
        <Box
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: rem(300),
            height: rem(300),
            background:
              "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)",
            borderRadius: "50%",
            filter: "blur(40px)",
            animationDelay: "2s",
          }}
          className="animate-pulse"
        />
      </Box>

      <Container
        size="md"
        style={{
          position: "relative",
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
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow:
                  "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
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
                  backgroundColor: "rgba(254, 242, 242, 0.85)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(252, 165, 165, 0.5)",
                  boxShadow:
                    "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
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
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  boxShadow:
                    "0 20px 40px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
                  display: "inline-block",
                  width: "fit-content",
                }}
              >
                <KenkenGrid
                  puzzleDefinition={puzzleDefinition}
                  solution={solutionGrid}
                  onWin={handleWin}
                  isTimerRunning={isTimerRunning}
                  isGameWon={isGameWon}
                  key={resetKey}
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
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow:
                  "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
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
                  <Text c="gray.5">
                    Could not load puzzle data. Please try again.
                  </Text>
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
                background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
                color: "white",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Celebration particles */}
              <Box
                style={{ position: "absolute", inset: 0, overflow: "hidden" }}
              >
                <Box
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "25%",
                    width: rem(16),
                    height: rem(16),
                    backgroundColor: "#fde047",
                    borderRadius: "50%",
                    animation: "bounce 1s infinite 0.1s",
                  }}
                />
                <Box
                  style={{
                    position: "absolute",
                    top: rem(16),
                    right: "25%",
                    width: rem(12),
                    height: rem(12),
                    backgroundColor: "#fef3c7",
                    borderRadius: "50%",
                    animation: "bounce 1s infinite 0.3s",
                  }}
                />
                <Box
                  style={{
                    position: "absolute",
                    bottom: rem(16),
                    left: "33%",
                    width: rem(8),
                    height: rem(8),
                    backgroundColor: "#facc15",
                    borderRadius: "50%",
                    animation: "bounce 1s infinite 0.5s",
                  }}
                />
              </Box>

              <Center>
                <Stack
                  align="center"
                  gap="md"
                  style={{ position: "relative", zIndex: 10 }}
                >
                  <ThemeIcon
                    size={80}
                    radius="xl"
                    style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
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
            backgroundColor: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
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
                />

                {/* Reset Button */}
                <Button
                  onClick={handleReset}
                  radius="xl"
                  size="sm"
                  variant="gradient"
                  gradient={{ from: "orange", to: "red" }}
                  leftSection={<IconRefresh size="1rem" />}
                  style={{
                    transition: "all 200ms ease",
                    "&:hover": {
                      transform: "scale(1.05)",
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
                  gradient={{ from: "teal", to: "blue" }}
                  leftSection={
                    showNewGameControls ? (
                      <IconSettings size="1rem" />
                    ) : (
                      <IconPlus size="1rem" />
                    )
                  }
                  style={{
                    transition: "all 200ms ease",
                    "&:hover": {
                      transform: "scale(1.05)",
                    },
                  }}
                >
                  {showNewGameControls ? "Settings" : "New Game"}
                </Button>

                {/* Combined Size and Difficulty Pill */}
                <Badge
                  size="lg"
                  radius="xl"
                  variant="gradient"
                  gradient={{ from: "indigo", to: "pink" }}
                  style={{
                    textTransform: "capitalize",
                    padding: `${rem(8)} ${rem(16)}`,
                    fontSize: rem(14),
                    fontWeight: 600,
                    height: rem(36), // Match button height
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {puzzleSize}×{puzzleSize} • {difficulty}
                </Badge>
              </Group>
            )}

            {/* Conditional Puzzle Settings - Only show when New Game is clicked */}
            {showNewGameControls && (
              <Stack align="center" gap="sm">
                <Group justify="center" gap="md">
                  {/* Size Selector */}
                  <Stack align="center" gap="xs">
                    <Text size="sm" fw={600} c="gray.6">
                      Size
                    </Text>
                    <Select
                      value={puzzleSize.toString()}
                      onChange={handleSizeChange}
                      data={[
                        { value: "4", label: "4×4" },
                        { value: "5", label: "5×5" },
                        { value: "6", label: "6×6" },
                        { value: "7", label: "7×7" },
                        { value: "8", label: "8×8" },
                        { value: "9", label: "9×9" },
                      ]}
                      styles={{
                        input: {
                          background:
                            "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: rem(50),
                          fontWeight: 600,
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          "&:focus": {
                            boxShadow: "0 0 0 4px rgba(139, 92, 246, 0.3)",
                          },
                        },
                      }}
                    />
                  </Stack>

                  {/* Difficulty Selector */}
                  <Stack align="center" gap="xs">
                    <Text size="sm" fw={600} c="gray.6">
                      Difficulty
                    </Text>
                    <Select
                      value={difficulty}
                      onChange={handleDifficultyChange}
                      data={[
                        { value: "easy", label: "Easy" },
                        { value: "medium", label: "Medium" },
                        { value: "hard", label: "Hard" },
                        { value: "expert", label: "Expert" },
                      ]}
                      styles={{
                        input: {
                          background:
                            "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: rem(50),
                          fontWeight: 600,
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          textTransform: "capitalize",
                          "&:focus": {
                            boxShadow: "0 0 0 4px rgba(236, 72, 153, 0.3)",
                          },
                        },
                      }}
                    />
                  </Stack>
                </Group>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default App;
