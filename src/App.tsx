// import "./App.css"; // Removed unused import
import React, { useState, useEffect } from "react";
import KenkenGrid from "./components/KenkenGrid";
import Timer from "./components/Timer"; // Import the Timer component
// import { fetchPuzzleDefinition } from "./utils/puzzleAPI"; // Assuming you have this

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
  const [puzzleSize, setPuzzleSize] = useState<number>(4);
  const [difficulty, setDifficulty] = useState<string>("medium"); // Add difficulty state
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
    // Center content vertically and horizontally, add padding
    <div className="min-h-screen flex flex-col items-center justify-center p-10 font-sans">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-indigo-700 mb-4">
          KenKen Puzzle
        </h1>
        <div className="inline-flex items-center bg-white p-2 rounded shadow">
          <label
            htmlFor="puzzle-size"
            className="mr-2 font-medium text-gray-700"
          >
            Size:
          </label>
          <select
            id="puzzle-size"
            value={puzzleSize}
            onChange={handleSizeChange}
            className="border border-gray-300 rounded p-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 mr-4" // Add margin right
          >
            {[3, 4, 5, 6, 7, 8].map((size) => (
              <option key={size} value={size}>
                {size}x{size}
              </option>
            ))}
          </select>

          {/* Difficulty Selector */}
          <label
            htmlFor="puzzle-difficulty"
            className="mr-2 font-medium text-gray-700"
          >
            Difficulty:
          </label>
          <select
            id="puzzle-difficulty"
            value={difficulty}
            onChange={handleDifficultyChange}
            className="border border-gray-300 rounded p-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          {/* End Difficulty Selector */}
        </div>
      </header>

      <main className="flex flex-col items-center">
        {/* Display Timer above the grid when puzzle is loaded */}
        {!loading && !error && puzzleDefinition && solutionGrid && (
          <Timer isRunning={isTimerRunning} setIsRunning={setIsTimerRunning} />
        )}

        {loading && (
          <div className="text-lg font-medium text-gray-600">
            Loading puzzle...
          </div>
        )}
        {error && (
          <div className="text-lg font-medium text-red-600">Error: {error}</div>
        )}
        {!loading && !error && puzzleDefinition && solutionGrid && (
          <KenkenGrid
            puzzleDefinition={puzzleDefinition}
            solution={solutionGrid}
            onWin={handleWin}
            isTimerRunning={isTimerRunning}
            isGameWon={isGameWon}
          />
        )}
        {/* Handle the case where loading is done, no error, but still no definition */}
        {!loading && !error && !puzzleDefinition && (
          <div className="text-lg font-medium text-gray-600">
            Could not load puzzle data.
          </div>
        )}

        {/* Celebration Message */}
        {isGameWon && (
          <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded shadow-md">
            <h2 className="text-2xl font-bold">Congratulations!</h2>
            <p className="text-lg">You solved the puzzle!</p>
            {/* You could add the final time here */}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
