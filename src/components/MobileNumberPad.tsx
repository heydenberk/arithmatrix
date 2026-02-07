/**
 * MobileNumberPad Component
 *
 * A touch-friendly number input panel for mobile devices.
 * Fixed at the bottom of the screen, always visible during gameplay.
 * Includes number buttons and control buttons (undo, redo, pencil, etc.)
 */

import React, { useState } from 'react';
import { Box, Button, Group, ActionIcon, Menu } from '@mantine/core';
import {
  IconEraser,
  IconPencil,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBoltFilled,
  IconDotsVertical,
  IconBookmark,
  IconTrash,
  IconDownload,
} from '@tabler/icons-react';
import { triggerHapticFeedback } from '../utils/touchUtils';
import { APP_VERSION } from '../version';
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
  onClearCheckpoint?: () => void;
  canInstall?: boolean;
  onInstall?: () => void;
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
  onClearCheckpoint,
  canInstall,
  onInstall,
}) => {
  const [menuOpened, setMenuOpened] = useState(false);
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
            variant={canUndo ? 'light' : 'outline'}
            color="orange"
            style={{ opacity: !canUndo ? 0.5 : 1, borderColor: !canUndo ? '#d1d5db' : undefined }}
          >
            <IconArrowBackUp size={iconSize} style={{ color: !canUndo ? '#9ca3af' : undefined }} />
          </ActionIcon>
          <ActionIcon
            onClick={() => handleButtonPress(onRedo)}
            disabled={!canRedo}
            size={buttonSize}
            radius="xl"
            variant={canRedo ? 'light' : 'outline'}
            color="violet"
            style={{ opacity: !canRedo ? 0.5 : 1, borderColor: !canRedo ? '#d1d5db' : undefined }}
          >
            <IconArrowForwardUp size={iconSize} style={{ color: !canRedo ? '#9ca3af' : undefined }} />
          </ActionIcon>
        </Group>

        {/* Center-left: Pencil */}
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

        {/* Right: Erase + More Menu */}
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            onClick={handleClear}
            size={buttonSize}
            radius="xl"
            variant="light"
            color="red"
          >
            <IconEraser size={iconSize} />
          </ActionIcon>

          {/* More Menu */}
          <Menu
            opened={menuOpened}
            onChange={setMenuOpened}
            position="top-end"
            offset={8}
            withinPortal
          >
            <Menu.Target>
              <ActionIcon
                onClick={() => setMenuOpened(o => !o)}
                size={buttonSize}
                radius="xl"
                variant="light"
                color="gray"
              >
                <IconDotsVertical size={iconSize} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconBookmark size="1rem" />}
                onClick={() => {
                  if (onCreateCheckpoint) {
                    handleButtonPress(onCreateCheckpoint);
                  }
                  setMenuOpened(false);
                }}
              >
                {hasCheckpoint ? 'Update Checkpoint' : 'Set Checkpoint'}
              </Menu.Item>
              {hasCheckpoint && onClearCheckpoint && (
                <Menu.Item
                  leftSection={<IconTrash size="1rem" />}
                  color="red"
                  onClick={() => {
                    handleButtonPress(onClearCheckpoint);
                    setMenuOpened(false);
                  }}
                >
                  Clear Checkpoint
                </Menu.Item>
              )}
              {canInstall && onInstall && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconDownload size="1rem" />}
                    onClick={() => {
                      onInstall();
                      setMenuOpened(false);
                    }}
                  >
                    Install App
                  </Menu.Item>
                </>
              )}
              <Menu.Divider />
              <Menu.Label style={{ textAlign: 'center', fontSize: 11, opacity: 0.6 }}>
                v{APP_VERSION}
              </Menu.Label>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Box>
  );
};

export default MobileNumberPad;
