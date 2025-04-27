/**
 * Custom hook for managing game settings and URL synchronization
 */
import { useState, useEffect, useCallback } from "react";

export type GameSettings = {
  puzzleSize: number;
  difficulty: string;
};

export type UISettings = {
  selectedSize: number;
  selectedDifficulty: string;
};

// Helper functions for URL parameter management
const getURLParams = (): GameSettings => {
  const params = new URLSearchParams(window.location.search);
  const size = parseInt(params.get("size") || "7", 10);
  const difficulty = params.get("difficulty") || "medium";

  // Validate size (between 4 and 7)
  const validSize = size >= 4 && size <= 7 ? size : 7;

  // Validate difficulty
  const validDifficulties = ["easiest", "easy", "medium", "hard", "expert"];
  const validDifficulty = validDifficulties.includes(difficulty)
    ? difficulty
    : "medium";

  return { puzzleSize: validSize, difficulty: validDifficulty };
};

const updateURL = (size: number, difficulty: string) => {
  const params = new URLSearchParams();
  params.set("size", size.toString());
  params.set("difficulty", difficulty);

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, "", newURL);
};

export const useGameSettings = () => {
  // Initialize from URL
  const initialParams = getURLParams();

  // Current active settings
  const [gameSettings, setGameSettings] = useState<GameSettings>(initialParams);

  // UI-only settings (what user has selected but not applied yet)
  const [uiSettings, setUISettings] = useState<UISettings>({
    selectedSize: initialParams.puzzleSize,
    selectedDifficulty: initialParams.difficulty,
  });

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = getURLParams();
      setGameSettings(urlParams);
      setUISettings({
        selectedSize: urlParams.puzzleSize,
        selectedDifficulty: urlParams.difficulty,
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Update UI settings
  const updateSelectedSize = useCallback((size: number) => {
    setUISettings((prev) => ({ ...prev, selectedSize: size }));
  }, []);

  const updateSelectedDifficulty = useCallback((difficulty: string) => {
    setUISettings((prev) => ({ ...prev, selectedDifficulty: difficulty }));
  }, []);

  // Apply UI settings to active game settings
  const applySettings = useCallback(() => {
    const newSettings = {
      puzzleSize: uiSettings.selectedSize,
      difficulty: uiSettings.selectedDifficulty,
    };
    setGameSettings(newSettings);
    updateURL(newSettings.puzzleSize, newSettings.difficulty);
  }, [uiSettings]);

  // Reset UI settings to match current game settings
  const resetUISettings = useCallback(() => {
    setUISettings({
      selectedSize: gameSettings.puzzleSize,
      selectedDifficulty: gameSettings.difficulty,
    });
  }, [gameSettings]);

  return {
    gameSettings,
    uiSettings,
    updateSelectedSize,
    updateSelectedDifficulty,
    applySettings,
    resetUISettings,
  };
};
