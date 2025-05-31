import React, { useState, useEffect, useRef } from "react";

interface TimerProps {
  // Add any props needed, e.g., initial time, callbacks
  isRunning: boolean; // Receive running state as a prop
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>; // Receive setter as a prop
}

const Timer: React.FC<TimerProps> = ({ isRunning, setIsRunning }) => {
  // Destructure props
  const [seconds, setSeconds] = useState<number>(0);
  // const [isRunning, setIsRunning] = useState<boolean>(true); // Remove internal state
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    } else if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Cleanup interval on component unmount or when isRunning changes
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]); // Rerun effect when isRunning changes (now from props)

  const handleTogglePause = () => {
    setIsRunning(!isRunning); // Use the setter from props
  };

  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-center space-x-4">
      <div className="relative">
        {/* Timer display with elegant styling */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-3 rounded-2xl shadow-lg border border-slate-600/50">
          <div className="flex items-center space-x-2">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" />
            </svg>
            <span className="font-mono text-xl font-bold tracking-wider">
              {formatTime(seconds)}
            </span>
          </div>
        </div>

        {/* Pulsing dot indicator when running */}
        {isRunning && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg"></div>
        )}
      </div>

      {/* Elegant pause/resume button */}
      <button
        onClick={handleTogglePause}
        className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 shadow-lg ${
          isRunning
            ? "bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white focus:ring-amber-300 shadow-amber-200"
            : "bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-500 hover:to-green-600 text-white focus:ring-emerald-300 shadow-emerald-200"
        }`}
      >
        <div className="flex items-center space-x-2">
          {isRunning ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,19H18V5H14M6,19H10V5H6V19Z" />
              </svg>
              <span>Pause</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
              </svg>
              <span>Resume</span>
            </>
          )}
        </div>

        {/* Subtle shine effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
      </button>
    </div>
  );
};

export default Timer;
