# Puzzle Statistics System

This KenKen application includes a comprehensive statistics tracking system that saves completed puzzle data to localStorage and provides powerful query capabilities.

## Features

- **Automatic Stats Collection**: Every completed puzzle is automatically saved with:

  - Complete puzzle definition (size, cages, operations)
  - Difficulty level and difficulty operations count
  - Completion time in seconds
  - Timestamp of completion
  - Unique puzzle ID

- **Local Storage**: All data is stored in browser localStorage under the key `kenken_puzzle_stats`

- **Window-bound Query Functions**: Access stats via browser dev tools using `window.puzzleStats`

## Usage

### Accessing Stats in Browser Console

Open your browser's developer tools console and use these functions:

```javascript
// Get all completed puzzle stats
window.puzzleStats.getAll();

// Get a comprehensive summary with averages, records, etc.
window.puzzleStats.getSummary();

// Query puzzles with specific criteria
window.puzzleStats.query({
  difficultyLevel: 'medium', // Filter by difficulty
  size: 7, // Filter by puzzle size
  minTime: 60, // Minimum completion time (seconds)
  maxTime: 300, // Maximum completion time (seconds)
  startDate: new Date('2024-01-01'), // Completed after this date
  endDate: new Date('2024-12-31'), // Completed before this date
  limit: 10, // Limit number of results
});

// Clear all stored statistics
window.puzzleStats.clear();

// Export all stats as JSON string (for backup)
window.puzzleStats.export();

// Import stats from JSON string
window.puzzleStats.import(jsonString);

// Format time in human-readable format
window.puzzleStats.formatTime(125); // Returns "2m 5s"
```

### Example Queries

```javascript
// Find your fastest 7x7 expert puzzles
window.puzzleStats.query({
  size: 7,
  difficultyLevel: 'expert',
  limit: 5,
});

// Find all puzzles completed in the last week
const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
window.puzzleStats.query({
  startDate: lastWeek,
});

// Find puzzles that took between 2-5 minutes
window.puzzleStats.query({
  minTime: 120,
  maxTime: 300,
});

// Get summary statistics
const summary = window.puzzleStats.getSummary();
console.log(`Total puzzles completed: ${summary.totalCompleted}`);
console.log(`Average time: ${window.puzzleStats.formatTime(summary.averageCompletionTime)}`);
console.log(`Fastest time: ${window.puzzleStats.formatTime(summary.fastestTime)}`);
```

### Data Structure

Each completed puzzle record contains:

```typescript
{
  id: string;                    // Unique identifier
  completedAt: Date;             // When puzzle was completed
  completionTimeSeconds: number; // Time taken in seconds
  puzzle: PuzzleDefinition;      // Complete puzzle data
  difficultyLevel: string;       // Selected difficulty level
  size: number;                  // Puzzle size (4, 5, 6, or 7)
  difficultyOperations?: number; // Complexity measure
}
```

### Summary Statistics

The `getSummary()` function returns:

```typescript
{
  totalCompleted: number;
  averageCompletionTime: number;
  fastestTime: number;
  slowestTime: number;
  byDifficulty: {
    [level: string]: {
      count: number;
      averageTime: number;
      fastestTime: number;
    }
  };
  bySize: {
    [size: number]: {
      count: number;
      averageTime: number;
      fastestTime: number;
    }
  };
  recentCompletions: CompletedPuzzleStats[]; // Last 10
}
```

## Storage Management

- Stats are automatically limited to the last 1000 completed puzzles to prevent localStorage bloat
- Data persists across browser sessions
- Use `export()` and `import()` functions for backup/restore

## Privacy

All statistics are stored locally in your browser only. No data is sent to external servers.
