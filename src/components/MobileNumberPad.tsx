/**
 * MobileNumberPad Component
 *
 * A touch-friendly number input panel for mobile devices.
 * Fixed at the bottom of the screen, always visible during gameplay.
 */

import React from 'react';
import { Box, Button, Group, ActionIcon } from '@mantine/core';
import { IconEraser } from '@tabler/icons-react';
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
}) => {
  const handleNumberClick = (num: number) => {
    triggerHapticFeedback('light');
    onNumberSelect(num);
  };

  const handleClear = () => {
    triggerHapticFeedback('medium');
    onClear();
  };

  // Generate number buttons based on grid size
  const numberButtons = Array.from({ length: gridSize }, (_, i) => i + 1);

  return (
    <Box className="mobile-number-pad-fixed">
      {/* Number buttons + clear in a single row */}
      <Group gap={4} justify="center" wrap="nowrap" className="number-buttons-row">
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
        {/* Clear button inline */}
        <ActionIcon
          className="number-pad-button-compact"
          variant="light"
          color="red"
          size="lg"
          onClick={handleClear}
          aria-label="Clear cell"
        >
          <IconEraser size="1.1rem" />
        </ActionIcon>
      </Group>
    </Box>
  );
};

export default MobileNumberPad;
