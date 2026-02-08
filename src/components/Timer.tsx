import React, { useState, useEffect, useRef } from 'react';
import { Text, ActionIcon, Group, rem } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only sync when initialTime changes, not seconds
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
    <Group gap={2} wrap="nowrap" align="center">
      {/* Timer text */}
      <Text
        size="xs"
        fw={600}
        style={{
          fontFamily: 'monospace',
          color: '#374151',
        }}
      >
        {formatTime(seconds)}
      </Text>

      {/* Pause/play button */}
      <ActionIcon
        onClick={handleTogglePause}
        size={rem(20)}
        radius="xl"
        variant="subtle"
        color={isRunning ? 'gray' : 'teal'}
      >
        {isRunning ? <IconPlayerPause size="0.7rem" /> : <IconPlayerPlay size="0.7rem" />}
      </ActionIcon>
    </Group>
  );
};

export default Timer;
