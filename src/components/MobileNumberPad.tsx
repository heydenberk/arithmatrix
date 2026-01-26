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
  IconBoltFilled,
  IconBookmark,
  IconRestore,
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
  onAutofillSingles?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasCheckpoint?: boolean;
  onCreateCheckpoint?: () => void;
  onRevertToCheckpoint?: () => void;
}

const MobileNumberPad: React.FC<MobileNumberPadProps> = ({
  gridSize,
  isPencilMode,
  onNumberSelect,
  onClear,
  onTogglePencilMode,
  onUndo,
  onRedo,
  onAutofillSingles,
  canUndo,
  canRedo,
  hasCheckpoint,
  onCreateCheckpoint,
  onRevertToCheckpoint,
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

      {/* Control buttons row - spaced layout */}
      <Group justify="space-between" wrap="nowrap" mt={8} w="100%">
        {/* Left: Undo/Redo */}
        <Group gap={4} wrap="nowrap">
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
        </Group>

        {/* Center-left: Pencil + Snapshot */}
        <Group gap={4} wrap="nowrap">
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
          {/* Snapshot: Create or Restore */}
          <ActionIcon
            onClick={() => {
              if (hasCheckpoint && onRevertToCheckpoint) {
                handleButtonPress(onRevertToCheckpoint);
              } else if (onCreateCheckpoint) {
                handleButtonPress(onCreateCheckpoint);
              }
            }}
            size={buttonSize}
            radius="xl"
            variant={hasCheckpoint ? 'gradient' : 'light'}
            gradient={hasCheckpoint ? { from: 'teal', to: 'cyan' } : undefined}
            color={hasCheckpoint ? undefined : 'gray'}
          >
            {hasCheckpoint ? <IconRestore size={iconSize} /> : <IconBookmark size={iconSize} />}
          </ActionIcon>
        </Group>

        {/* Center-right: Zap */}
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

        {/* Right: Erase */}
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
