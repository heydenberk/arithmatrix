/**
 * Custom hook for managing puzzle data loading and caching
 */
import { useState, useEffect } from 'react';
import { PUZZLE_DATA_FILE } from '../constants/gameConstants';
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

  // Note: Difficulty bounds removed - now using human-centered difficulty system

  useEffect(() => {
    const loadPuzzle = async () => {
      setLoading(true);
      setError(null);
      setPuzzleDefinition(null);
      setSolutionGrid(null);

      console.log(`Fetching puzzle: Size ${puzzleSize}, Difficulty ${difficulty}...`);

      try {
        const response = await fetch(PUZZLE_DATA_FILE);
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

        // Filter puzzles by size and actual difficulty (new human-centered system)
        const filteredPuzzles = puzzles.filter(
          puzzle => puzzle.size === puzzleSize && puzzle.difficulty === difficulty
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
