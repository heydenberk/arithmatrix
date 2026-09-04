/**
 * MobileSettingsPanel Component
 *
 * A touch-friendly settings panel for mobile devices.
 * Appears as a bottom sheet when the settings badge is tapped.
 *
 * Features:
 * - Segmented controls for grid size selection
 * - Pill buttons for difficulty selection
 * - Segmented control for operations tier selection
 * - Start New Game button
 * - Haptic feedback on interactions
 */

import React from 'react';
import { Box, Button, Group, Stack, Text, ActionIcon, SegmentedControl } from '@mantine/core';
import { IconX, IconSparkles, IconLayoutGrid } from '@tabler/icons-react';
import { triggerHapticFeedback } from '../utils/touchUtils';
import './MobileSettingsPanel.css';

interface MobileSettingsPanelProps {
  currentSize: number;
  currentDifficulty: string;
  currentOperationsTier: string;
  selectedSize: number;
  selectedDifficulty: string;
  selectedOperationsTier: string;
  onSizeChange: (size: number) => void;
  onDifficultyChange: (difficulty: string) => void;
  onOperationsTierChange: (tier: string) => void;
  onStartGame: () => void;
  /** Opens the puzzle gallery - the secondary way to pick a game. */
  onBrowseGallery: () => void;
  onClose: () => void;
}

const SIZES = [4, 5, 6, 7];
const DIFFICULTIES = ['easiest', 'easy', 'medium', 'hard', 'expert'];
const OPS_TIERS = [
  { value: 'add', label: '+' },
  { value: 'add-sub', label: '+ \u2212' },
  { value: 'no-div', label: '+ \u2212 \u00d7' },
  { value: 'all', label: '+ \u2212 \u00d7 \u00f7' },
];

const MobileSettingsPanel: React.FC<MobileSettingsPanelProps> = ({
  currentSize,
  currentDifficulty,
  currentOperationsTier,
  selectedSize,
  selectedDifficulty,
  selectedOperationsTier,
  onSizeChange,
  onDifficultyChange,
  onOperationsTierChange,
  onStartGame,
  onBrowseGallery,
  onClose,
}) => {
  const handleSizeChange = (value: string) => {
    triggerHapticFeedback('light');
    onSizeChange(parseInt(value, 10));
  };

  const handleDifficultyChange = (diff: string) => {
    triggerHapticFeedback('light');
    onDifficultyChange(diff);
  };

  const handleOperationsTierChange = (value: string) => {
    triggerHapticFeedback('light');
    onOperationsTierChange(value);
  };

  const handleStartGame = () => {
    triggerHapticFeedback('medium');
    onStartGame();
    onClose();
  };

  const handleBrowseGallery = () => {
    triggerHapticFeedback('light');
    onBrowseGallery();
    onClose();
  };

  const handleClose = () => {
    triggerHapticFeedback('light');
    onClose();
  };

  const hasChanges =
    selectedSize !== currentSize ||
    selectedDifficulty !== currentDifficulty ||
    selectedOperationsTier !== currentOperationsTier;

  return (
    <Box className="mobile-settings-overlay">
      <Box className="mobile-settings-backdrop" onClick={handleClose} />
      <Box className="mobile-settings-panel">
        {/* Header */}
        <Group justify="space-between" mb="md" px="xs">
          <Text size="lg" fw={700} c="gray.8">
            Game Settings
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={handleClose}
            aria-label="Close settings"
          >
            <IconX size="1.2rem" />
          </ActionIcon>
        </Group>

        {/* Grid Size Selection */}
        <Stack gap="xs" mb="md">
          <Text size="sm" fw={600} c="gray.6">
            Grid Size
          </Text>
          <SegmentedControl
            value={selectedSize.toString()}
            onChange={handleSizeChange}
            data={SIZES.map(size => ({
              value: size.toString(),
              label: `${size}×${size}`,
            }))}
            fullWidth
            size="md"
            classNames={{
              root: 'settings-segmented-root',
              indicator: 'settings-segmented-indicator',
              label: 'settings-segmented-label',
            }}
          />
        </Stack>

        {/* Difficulty Selection */}
        <Stack gap="xs" mb="md">
          <Text size="sm" fw={600} c="gray.6">
            Difficulty
          </Text>
          <Group gap="xs" justify="center" className="difficulty-pills">
            {DIFFICULTIES.map(diff => (
              <Button
                key={diff}
                variant={selectedDifficulty === diff ? 'filled' : 'light'}
                color={selectedDifficulty === diff ? 'violet' : 'gray'}
                size="sm"
                radius="xl"
                onClick={() => handleDifficultyChange(diff)}
                className="difficulty-pill"
                style={{ textTransform: 'capitalize' }}
              >
                {diff}
              </Button>
            ))}
          </Group>
        </Stack>

        {/* Operations Tier Selection */}
        <Stack gap="xs" mb="lg">
          <Text size="sm" fw={600} c="gray.6">
            Operations
          </Text>
          <SegmentedControl
            value={selectedOperationsTier}
            onChange={handleOperationsTierChange}
            data={OPS_TIERS}
            fullWidth
            size="md"
            classNames={{
              root: 'settings-segmented-root',
              indicator: 'settings-segmented-indicator',
              label: 'settings-segmented-label',
            }}
          />
        </Stack>

        {/* Current vs Selected indicator */}
        {hasChanges && (
          <Text size="xs" c="dimmed" ta="center" mb="sm">
            Current: {currentSize}×{currentSize} • {currentDifficulty}
          </Text>
        )}

        {/* Start Game Button */}
        <Button
          fullWidth
          size="lg"
          radius="xl"
          variant="gradient"
          gradient={{ from: 'violet', to: 'cyan' }}
          leftSection={<IconSparkles size="1.2rem" />}
          onClick={handleStartGame}
          className="start-game-button"
        >
          {hasChanges ? 'Start New Game' : 'New Puzzle'}
        </Button>

        {/* Secondary: pick an exact puzzle instead of a random one */}
        <Button
          fullWidth
          size="md"
          radius="xl"
          variant="subtle"
          color="gray"
          mt="xs"
          leftSection={<IconLayoutGrid size="1.1rem" />}
          onClick={handleBrowseGallery}
        >
          Browse all puzzles
        </Button>
      </Box>
    </Box>
  );
};

export default MobileSettingsPanel;
