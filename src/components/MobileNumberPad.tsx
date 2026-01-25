/**
 * MobileNumberPad Component
 *
 * A touch-friendly number input overlay for mobile devices.
 * Appears at the bottom of the screen when a cell is selected.
 *
 * Features:
 * - Large touch-friendly number buttons (min 44px)
 * - Clear button for deleting cell contents
 * - Pencil mode toggle for adding candidate numbers
 * - Haptic feedback on interactions
 * - Slide-up animation from bottom
 */

import React from 'react';
import { Box, Button, Group, ActionIcon, Text } from '@mantine/core';
import { IconEraser, IconPencil, IconPencilOff, IconX } from '@tabler/icons-react';
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
  onClose,
  selectedCellValue,
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

  const handleClose = () => {
    triggerHapticFeedback('light');
    onClose();
  };

  // Generate number buttons based on grid size
  const numberButtons = Array.from({ length: gridSize }, (_, i) => i + 1);

  return (
    <Box className="mobile-number-pad-overlay">
      <Box className="mobile-number-pad-backdrop" onClick={handleClose} />
      <Box className="mobile-number-pad">
        {/* Header with mode indicator and close button */}
        <Group justify="space-between" mb="xs" px="xs">
          <Text size="sm" fw={600} c="gray.6">
            {isPencilMode ? 'Pencil Mode' : 'Enter Number'}
            {selectedCellValue && !isPencilMode && (
              <Text span c="gray.4" ml="xs">
                (Current: {selectedCellValue})
              </Text>
            )}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={handleClose}
            aria-label="Close number pad"
          >
            <IconX size="1.1rem" />
          </ActionIcon>
        </Group>

        {/* Number buttons grid */}
        <Group gap="xs" justify="center" mb="sm" className="number-buttons-container">
          {numberButtons.map(num => (
            <Button
              key={num}
              className="number-pad-button"
              variant={isPencilMode ? 'light' : 'filled'}
              color={isPencilMode ? 'blue' : 'indigo'}
              size="lg"
              onClick={() => handleNumberClick(num)}
              aria-label={`Enter ${num}`}
            >
              {num}
            </Button>
          ))}
        </Group>

        {/* Action buttons */}
        <Group gap="sm" justify="center">
          {/* Clear button */}
          <Button
            className="action-button"
            variant="light"
            color="red"
            size="md"
            leftSection={<IconEraser size="1.1rem" />}
            onClick={handleClear}
            aria-label="Clear cell"
          >
            Clear
          </Button>

          {/* Pencil mode toggle */}
          <Button
            className="action-button"
            variant={isPencilMode ? 'filled' : 'light'}
            color="blue"
            size="md"
            leftSection={isPencilMode ? <IconPencilOff size="1.1rem" /> : <IconPencil size="1.1rem" />}
            onClick={handleTogglePencilMode}
            aria-label={isPencilMode ? 'Exit pencil mode' : 'Enter pencil mode'}
          >
            {isPencilMode ? 'Exit Pencil' : 'Pencil'}
          </Button>
        </Group>
      </Box>
    </Box>
  );
};

export default MobileNumberPad;
