/**
 * MobileNumberPad Component
 *
 * A touch-friendly number input panel for mobile devices.
 * Fixed at the bottom of the screen, always visible during gameplay.
 *
 * Features:
 * - Large touch-friendly number buttons (min 44px)
 * - Clear button for deleting cell contents
 * - Pencil mode toggle for adding candidate numbers
 * - Haptic feedback on interactions
 * - Non-blocking design allows grid interaction
 */

import React from 'react';
import { Box, Button, Group, Text } from '@mantine/core';
import { IconEraser, IconPencil, IconPencilOff } from '@tabler/icons-react';
import { triggerHapticFeedback } from '../utils/touchUtils';
import './MobileNumberPad.css';

interface MobileNumberPadProps {
  gridSize: number;
  isPencilMode: boolean;
  onNumberSelect: (num: number) => void;
  onClear: () => void;
  onTogglePencilMode: () => void;
  onClose: () => void;
  selectedCellValue: string;
}

const MobileNumberPad: React.FC<MobileNumberPadProps> = ({
  gridSize,
  isPencilMode,
  onNumberSelect,
  onClear,
  onTogglePencilMode,
}) => {
  const handleNumberClick = (num: number) => {
    triggerHapticFeedback('light');
    onNumberSelect(num);
  };

  const handleClear = () => {
    triggerHapticFeedback('medium');
    onClear();
  };

  const handleTogglePencilMode = () => {
    triggerHapticFeedback('medium');
    onTogglePencilMode();
  };

  // Generate number buttons based on grid size
  const numberButtons = Array.from({ length: gridSize }, (_, i) => i + 1);

  return (
    <Box className="mobile-number-pad-fixed">
      {/* Mode indicator */}
      <Text size="xs" fw={600} c={isPencilMode ? 'blue' : 'gray.6'} ta="center" mb={4}>
        {isPencilMode ? '✏️ Pencil Mode - Tap cells to select, then number' : 'Tap a cell, then a number'}
      </Text>

      {/* Number buttons in a single row */}
      <Group gap={6} justify="center" mb={8} wrap="nowrap" className="number-buttons-row">
        {numberButtons.map(num => (
          <Button
            key={num}
            className="number-pad-button-compact"
            variant={isPencilMode ? 'light' : 'filled'}
            color={isPencilMode ? 'blue' : 'indigo'}
            size="sm"
            onClick={() => handleNumberClick(num)}
            aria-label={`Enter ${num}`}
          >
            {num}
          </Button>
        ))}
      </Group>

      {/* Action buttons */}
      <Group gap={8} justify="center" wrap="nowrap">
        {/* Clear button */}
        <Button
          className="action-button-compact"
          variant="light"
          color="red"
          size="xs"
          leftSection={<IconEraser size="0.9rem" />}
          onClick={handleClear}
          aria-label="Clear cell"
        >
          Clear
        </Button>

        {/* Pencil mode toggle */}
        <Button
          className="action-button-compact"
          variant={isPencilMode ? 'filled' : 'light'}
          color="blue"
          size="xs"
          leftSection={isPencilMode ? <IconPencilOff size="0.9rem" /> : <IconPencil size="0.9rem" />}
          onClick={handleTogglePencilMode}
          aria-label={isPencilMode ? 'Exit pencil mode' : 'Enter pencil mode'}
        >
          {isPencilMode ? 'Exit Pencil' : 'Pencil'}
        </Button>
      </Group>
    </Box>
  );
};

export default MobileNumberPad;
