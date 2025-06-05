import React, { useState, useEffect, useRef } from 'react';
import { Paper, Text, ActionIcon, Box, rem } from '@mantine/core';
import { IconClock, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';

type TimerProps = {
  // Add any props needed, e.g., initial time, callbacks
  isRunning: boolean; // Receive running state as a prop
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>; // Receive setter as a prop
  resetKey?: number; // Optional key to trigger timer reset
  initialTime?: number; // Initial time in seconds for restored games
  onTimeUpdate?: (seconds: number) => void; // Callback to pass current time to parent
};

const Timer: React.FC<TimerProps> = ({
  isRunning,
  setIsRunning,
  resetKey,
  initialTime,
  onTimeUpdate,
}) => {
  // Destructure props
  const [seconds, setSeconds] = useState<number>(initialTime || 0);
  const intervalRef = useRef<number | null>(null);

  // Reset timer when resetKey changes
  useEffect(() => {
    if (resetKey !== undefined) {
      setSeconds(initialTime || 0);
    }
  }, [resetKey, initialTime]);

  // Update timer when initialTime changes (for restored games)
  useEffect(() => {
    if (initialTime !== undefined && initialTime !== seconds) {
      console.log('⏰ Timer: Setting initial time to', initialTime);
      setSeconds(initialTime);
    }
  }, [initialTime]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setSeconds(prevSeconds => {
          const newSeconds = prevSeconds + 1;
          // Call the callback with the new time
          if (onTimeUpdate) {
            onTimeUpdate(newSeconds);
          }
          return newSeconds;
        });
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
  }, [isRunning, onTimeUpdate]); // Rerun effect when isRunning or onTimeUpdate changes

  const handleTogglePause = () => {
    setIsRunning(!isRunning); // Use the setter from props
  };

  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  return (
    <Box style={{ position: 'relative', display: 'inline-block' }}>
      {/* Compact timer display with embedded pause button */}
      <Paper
        radius="xl"
        px="xs"
        py={rem(4)}
        style={{
          background: 'linear-gradient(135deg, #334155 0%, #475569 100%)',
          color: 'white',
          border: '1px solid rgba(100, 116, 139, 0.5)',
          boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: rem(6),
          minWidth: rem(120),
          height: rem(36), // Match button height
        }}
      >
        {/* Clock icon */}
        <IconClock size="0.9rem" style={{ color: '#10b981', flexShrink: 0 }} />

        {/* Timer text */}
        <Text
          size="sm"
          fw={600}
          style={{
            fontFamily: 'monospace',
            letterSpacing: rem(0.5),
            flex: 1,
            textAlign: 'center',
          }}
        >
          {formatTime(seconds)}
        </Text>

        {/* Embedded pause/play button */}
        <ActionIcon
          onClick={handleTogglePause}
          size="xs"
          radius="lg"
          variant="subtle"
          color={isRunning ? 'yellow' : 'teal'}
          style={{
            flexShrink: 0,
            transition: 'all 200ms ease',
            '&:hover': {
              transform: 'scale(1.1)',
            },
          }}
        >
          {isRunning ? <IconPlayerPause size="0.75rem" /> : <IconPlayerPlay size="0.75rem" />}
        </ActionIcon>
      </Paper>

      {/* Pulsing dot indicator when running */}
      {isRunning && (
        <Box
          style={{
            position: 'absolute',
            top: rem(-3),
            right: rem(-3),
            width: rem(8),
            height: rem(8),
            backgroundColor: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            zIndex: 10,
          }}
          className="animate-pulse"
        />
      )}
    </Box>
  );
};

export default Timer;
