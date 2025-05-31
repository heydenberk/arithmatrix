import React, { useState, useEffect } from "react";
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
  const handleSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPuzzleSize(parseInt(event.target.value, 10));
    setIsTimerRunning(true); // Ensure timer is running for new puzzle
  };

  // Handler for difficulty change
  const handleDifficultyChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setDifficulty(event.target.value);
    setIsTimerRunning(true); // Ensure timer is running for new puzzle
  };

  // Callback for when the puzzle is won
  const handleWin = () => {
    console.log("Puzzle solved!");
    setIsTimerRunning(false); // Pause the timer
    setIsGameWon(true); // Set the win state
  };

  return (
    <div
      className="min-h-screen pt-16"
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-blue-200/30 to-indigo-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto pb-8 px-4">
        {/* Main content area */}
        <main className="space-y-6">
          {/* Loading state with elegant spinner */}
          {loading && (
            <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl border border-white/20 p-12 text-center">
              <div className="inline-flex items-center space-x-3">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <span className="text-xl font-medium text-gray-700">
                  Loading puzzle...
                </span>
              </div>
            </div>
          )}

          {/* Error state with enhanced styling */}
          {error && (
            <div className="bg-red-50/80 backdrop-blur-lg rounded-3xl shadow-xl border border-red-200/50 p-8">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-800">
                    Error Loading Puzzle
                  </h3>
                  <p className="text-red-600">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Game grid with container styling */}
          {!loading && !error && puzzleDefinition && solutionGrid && (
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-xl p-6">
              <KenkenGrid
                puzzleDefinition={puzzleDefinition}
                solution={solutionGrid}
                onWin={handleWin}
                isTimerRunning={isTimerRunning}
                isGameWon={isGameWon}
              />
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && !puzzleDefinition && (
            <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl border border-white/20 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                Puzzle Unavailable
              </h3>
              <p className="text-gray-500">
                Could not load puzzle data. Please try again.
              </p>
            </div>
          )}

          {/* Win celebration with enhanced styling */}
          {isGameWon && (
            <div className="bg-gradient-to-r from-green-400 to-emerald-500 rounded-3xl shadow-xl p-8 text-center text-white relative overflow-hidden">
              {/* Celebration particles */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 left-1/4 w-4 h-4 bg-yellow-300 rounded-full animate-bounce delay-100"></div>
                <div className="absolute top-4 right-1/4 w-3 h-3 bg-yellow-200 rounded-full animate-bounce delay-300"></div>
                <div className="absolute bottom-4 left-1/3 w-2 h-2 bg-yellow-400 rounded-full animate-bounce delay-500"></div>
              </div>

              <div className="relative z-10">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1L13.5 2.5L16.17 5.17L10.5 10.84L16 16.31L21 11.31V9ZM3.5 5.17L6.17 2.5L4.5 1L2 3.5L3.5 5.17ZM2 21L16 7L14.5 5.5L1 19L2 21Z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2">
                  🎉 Congratulations! 🎉
                </h2>
                <p className="text-xl opacity-90">You solved the puzzle!</p>
              </div>
            </div>
          )}
        </main>

        {/* Controls Section - Moved to bottom */}
        <footer className="mt-8">
          <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl p-8">
            {/* Enhanced Controls Section */}
            <div className="flex flex-col items-center gap-6">
              {/* Puzzle Settings */}
              <div className="flex flex-wrap justify-center gap-4">
                {/* Size Selector */}
                <div className="flex flex-col items-center space-y-2">
                  <label className="text-sm font-semibold text-gray-600">
                    Size
                  </label>
                  <select
                    value={puzzleSize}
                    onChange={handleSizeChange}
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg border-none outline-none focus:ring-4 focus:ring-purple-300 focus:ring-opacity-50 cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105"
                  >
                    <option value={4} className="text-gray-800">
                      4×4
                    </option>
                    <option value={5} className="text-gray-800">
                      5×5
                    </option>
                    <option value={6} className="text-gray-800">
                      6×6
                    </option>
                    <option value={7} className="text-gray-800">
                      7×7
                    </option>
                    <option value={8} className="text-gray-800">
                      8×8
                    </option>
                    <option value={9} className="text-gray-800">
                      9×9
                    </option>
                  </select>
                </div>

                {/* Difficulty Selector */}
                <div className="flex flex-col items-center space-y-2">
                  <label className="text-sm font-semibold text-gray-600">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={handleDifficultyChange}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg border-none outline-none focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50 cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105 capitalize"
                  >
                    <option value="easy" className="text-gray-800">
                      Easy
                    </option>
                    <option value="medium" className="text-gray-800">
                      Medium
                    </option>
                    <option value="hard" className="text-gray-800">
                      Hard
                    </option>
                    <option value="expert" className="text-gray-800">
                      Expert
                    </option>
                  </select>
                </div>
              </div>

              {/* Info pills with enhanced styling */}
              <div className="flex flex-wrap justify-center gap-3">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg">
                  Size: {puzzleSize}×{puzzleSize}
                </div>
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg capitalize">
                  Difficulty: {difficulty}
                </div>
              </div>

              {/* Timer component with enhanced styling */}
              {!loading && !error && puzzleDefinition && solutionGrid && (
                <div className="flex justify-center">
                  <Timer
                    isRunning={isTimerRunning}
                    setIsRunning={setIsTimerRunning}
                  />
                </div>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
