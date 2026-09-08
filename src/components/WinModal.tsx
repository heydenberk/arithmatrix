/**
 * WinModal
 *
 * The solve celebration, as an overlay on every device.
 *
 * This used to be a card appended below the grid. On mobile that put it off the
 * bottom of a viewport that is deliberately scroll-locked (see index.css), so
 * the player never saw it - they just noticed the timer stop. A modal has no
 * such problem, and on desktop it reads better than a panel that pushes the
 * controls down.
 */

import React from 'react';
import { Box, Button, Group, Modal, Stack, Text, ThemeIcon, Title, rem } from '@mantine/core';
import { IconLayoutGrid, IconTrophy } from '@tabler/icons-react';
import AchievementNotification from './AchievementNotification';
import type { AchievementResult } from '../utils/achievements';

interface WinModalProps {
  opened: boolean;
  /** Dismiss the modal and leave the solved board on screen. */
  onClose: () => void;
  /** Open the gallery to pick the next puzzle. */
  onNewPuzzle: () => void;
  /** Seconds taken, as the timer read when the last cell landed. */
  elapsedSeconds: number;
  achievement: AchievementResult | null;
  size: number;
  difficulty: string;
}

const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/** One of the confetti dots behind the trophy. */
const Particle: React.FC<{
  style: React.CSSProperties;
  size: number;
  color: string;
  delay: string;
}> = ({ style, size, color, delay }) => (
  <Box
    style={{
      position: 'absolute',
      width: rem(size),
      height: rem(size),
      backgroundColor: color,
      borderRadius: '50%',
      animation: `bounce 1s infinite ${delay}`,
      ...style,
    }}
  />
);

const WinModal: React.FC<WinModalProps> = ({
  opened,
  onClose,
  onNewPuzzle,
  elapsedSeconds,
  achievement,
  size,
  difficulty,
}) => (
  <Modal
    opened={opened}
    onClose={onClose}
    centered
    withCloseButton={false}
    radius="xl"
    padding={0}
    size="sm"
    overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
    styles={{ content: { overflow: 'hidden' } }}
    aria-label="Puzzle solved"
  >
    <Box
      p="xl"
      style={{
        background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
        color: 'white',
        position: 'relative',
      }}
    >
      {/* Celebration particles */}
      <Box style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Particle style={{ top: 0, left: '25%' }} size={16} color="#fde047" delay="0.1s" />
        <Particle style={{ top: rem(16), right: '25%' }} size={12} color="#fef3c7" delay="0.3s" />
        <Particle style={{ bottom: rem(16), left: '33%' }} size={8} color="#facc15" delay="0.5s" />
      </Box>

      <Stack align="center" gap="md" style={{ position: 'relative', zIndex: 10 }}>
        <ThemeIcon size={72} radius="xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}>
          <IconTrophy size="2.25rem" />
        </ThemeIcon>
        <Title order={2}>🎉 Congratulations! 🎉</Title>
        <Text size="lg" style={{ opacity: 0.9 }}>
          Solved in {formatTime(elapsedSeconds)}
        </Text>
        {achievement && (
          <AchievementNotification result={achievement} size={size} difficulty={difficulty} />
        )}

        <Group gap="sm" mt="xs" justify="center" wrap="wrap">
          <Button
            onClick={onNewPuzzle}
            radius="xl"
            size="md"
            color="dark"
            variant="white"
            leftSection={<IconLayoutGrid size="1rem" />}
          >
            New puzzle
          </Button>
          {/* Leaves the finished grid visible, for a player who wants to look it over */}
          <Button onClick={onClose} radius="xl" size="md" variant="subtle" color="gray.0">
            Close
          </Button>
        </Group>
      </Stack>
    </Box>
  </Modal>
);

export default WinModal;
