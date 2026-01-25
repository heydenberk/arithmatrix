/**
 * MobileNumberPad Component
 *
 * A touch-friendly number input panel for mobile devices.
 * Fixed at the bottom of the screen, always visible during gameplay.
 * Includes number buttons and control buttons (undo, redo, pencil, etc.)
 */

import React from 'react';
import { Box, Button, Group, ActionIcon } from '@mantine/core';
import {
  IconEraser,
  IconPencil,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconRefresh,
  IconBoltFilled,
} from '@tabler/icons-react';
import { triggerHapticFeedback } from '../utils/touchUtils';
import './MobileNumberPad.css';

interface MobileNumberPadProps {
  gridSize: number;
  isPencilMode: boolean;
  onNumberSelect: (num: number) => void;
  onClear: () => void;
  onTogglePencilMode: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onAutofillSingles?: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const MobileNumberPad: React.FC<MobileNumberPadProps> = ({
  gridSize,
  isPencilMode,
  onNumberSelect,
  onClear,
  onTogglePencilMode,
  onUndo,
  onRedo,
  onReset,
  onAutofillSingles,
  canUndo,
  canRedo,
}) => {
  const handleNumberClick = (num: number) => {
    triggerHapticFeedback('light');
    onNumberSelect(num);
  };

  const handleClear = () => {
    triggerHapticFeedback('medium');
    onClear();
  };

  const handleButtonPress = (callback: () => void) => {
    triggerHapticFeedback('light');
    callback();
  };

  // Generate number buttons based on grid size
  const numberButtons = Array.from({ length: gridSize }, (_, i) => i + 1);

  const buttonSize = 36;
  const iconSize = '1.1rem';

  return (
    <Box className="mobile-number-pad-fixed">
      {/* Number buttons row */}
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
      </Group>

      {/* Control buttons row */}
      <Group gap={6} justify="center" wrap="nowrap" mt={8}>
        {/* Reset */}
        <ActionIcon
          onClick={() => handleButtonPress(onReset)}
          size={buttonSize}
          radius="xl"
          variant="light"
          color="red"
        >
          <IconRefresh size={iconSize} />
        </ActionIcon>

        {/* Undo */}
        <ActionIcon
          onClick={() => handleButtonPress(onUndo)}
          disabled={!canUndo}
          size={buttonSize}
          radius="xl"
          variant="light"
          color="orange"
          style={{ opacity: !canUndo ? 0.4 : 1 }}
        >
          <IconArrowBackUp size={iconSize} />
        </ActionIcon>

        {/* Redo */}
        <ActionIcon
          onClick={() => handleButtonPress(onRedo)}
          disabled={!canRedo}
          size={buttonSize}
          radius="xl"
          variant="light"
          color="violet"
          style={{ opacity: !canRedo ? 0.4 : 1 }}
        >
          <IconArrowForwardUp size={iconSize} />
        </ActionIcon>

        {/* Pencil Mode */}
        <Box style={{ position: 'relative' }}>
          <ActionIcon
            onClick={() => handleButtonPress(onTogglePencilMode)}
            size={buttonSize}
            radius="xl"
            variant={isPencilMode ? 'gradient' : 'light'}
            gradient={isPencilMode ? { from: 'blue', to: 'indigo' } : undefined}
            color={isPencilMode ? undefined : 'gray'}
          >
            <IconPencil size={iconSize} />
          </ActionIcon>
          {isPencilMode && (
            <Box
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                backgroundColor: '#10b981',
                borderRadius: '50%',
                border: '2px solid white',
              }}
            />
          )}
        </Box>

        {/* Autofill Singles (Zap) */}
        {onAutofillSingles && (
          <ActionIcon
            onClick={() => handleButtonPress(onAutofillSingles)}
            size={buttonSize}
            radius="xl"
            variant="light"
            color="yellow"
          >
            <IconBoltFilled size={iconSize} />
          </ActionIcon>
        )}

        {/* Erase */}
        <ActionIcon
          onClick={handleClear}
          size={buttonSize}
          radius="xl"
          variant="light"
          color="red"
        >
          <IconEraser size={iconSize} />
        </ActionIcon>
      </Group>
    </Box>
  );
};

export default MobileNumberPad;
