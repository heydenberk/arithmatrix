/**
 * Custom hook for managing puzzle data loading and caching
 */
import { useState, useEffect } from 'react';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

type RawPuzzleData = {
  puzzle: {
    size: number;
    cages: Array<{ value: number; operation: string; cells: number[] }>;
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

type PuzzleData = PuzzleDefinition & {
  solution: number[][];
  difficulty: string;
  difficulty_operations?: number;
};

interface UsePuzzleDataProps {
  puzzleSize: number;
  difficulty: string;
  refreshKey: number;
}

export const usePuzzleData = ({ puzzleSize, difficulty, refreshKey }: UsePuzzleDataProps) => {
  const [puzzleDefinition, setPuzzleDefinition] = useState<PuzzleDefinition | null>(null);
  const [solutionGrid, setSolutionGrid] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Difficulty bounds configuration
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
  } as const;

  const getDifficultyBounds = (size: number, difficulty: string): [number, number] => {
    const sizeBounds = difficultyBounds[size as keyof typeof difficultyBounds];
    if (!sizeBounds) {
      return difficultyBounds[7].medium as [number, number];
    }
    return (sizeBounds[difficulty as keyof typeof sizeBounds] || sizeBounds.medium) as [
      number,
      number,
    ];
  };

  useEffect(() => {
    const loadPuzzle = async () => {
      setLoading(true);
      setError(null);
      setPuzzleDefinition(null);
      setSolutionGrid(null);

      console.log(`Fetching puzzle: Size ${puzzleSize}, Difficulty ${difficulty}...`);

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

        const [minOps, maxOps] = getDifficultyBounds(puzzleSize, difficulty);
        const filteredPuzzles = puzzles.filter(
          puzzle =>
            puzzle.size === puzzleSize &&
            puzzle.difficulty_operations !== undefined &&
            puzzle.difficulty_operations >= minOps &&
            puzzle.difficulty_operations <= maxOps
        );

        if (filteredPuzzles.length === 0) {
          throw new Error(`No puzzles found for size ${puzzleSize} and difficulty ${difficulty}`);
        }

        const randomIndex = Math.floor(Math.random() * filteredPuzzles.length);
        const selectedPuzzle = filteredPuzzles[randomIndex];

        setPuzzleDefinition({
          size: selectedPuzzle.size,
          cages: selectedPuzzle.cages,
          difficulty_operations: selectedPuzzle.difficulty_operations,
        });
        setSolutionGrid(selectedPuzzle.solution);
      } catch (err) {
        console.error('Failed to fetch puzzle:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch puzzle data.');
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();
  }, [puzzleSize, difficulty, refreshKey]);

  return {
    puzzleDefinition,
    solutionGrid,
    loading,
    error,
  };
};
