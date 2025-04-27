/**
 * Custom hook for managing timer state and window focus/blur events
 */
import { useState, useEffect } from "react";

interface UseTimerProps {
  resetKey: number;
}

export const useTimer = ({ resetKey }: UseTimerProps) => {
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

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

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Reset timer state when resetKey changes
  useEffect(() => {
    setIsTimerRunning(true);
  }, [resetKey]);

  return {
    isTimerRunning,
    setIsTimerRunning,
  };
};
