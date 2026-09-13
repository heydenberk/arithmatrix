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
  IconBulbFilled,
  IconDotsVertical,
  IconTrash,
  IconDownload,
  IconTrophy,
  IconRefresh,
  IconRestore,
  IconFlag,
  IconFlagFilled,
} from '@tabler/icons-react';
import { triggerHapticFeedback } from '../utils/touchUtils';
import { useLongPress } from '../hooks/useLongPress';
import { APP_VERSION } from '../version';
import { reloadApp } from '../utils/reloadApp';
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
  /** Long-press the zap: pencil in every candidate for unmarked cells. */
  onFillAllCandidates?: () => void;
  /** Asks for the next hint. */
  onHint?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasCheckpoint?: boolean;
  onCreateCheckpoint?: () => void;
  /** Put the board back to the checkpoint. Desktop had this; mobile did not. */
  onRevertToCheckpoint?: () => void;
  onClearCheckpoint?: () => void;
  onInstall?: () => void;
  onShowAchievements?: () => void;
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
  onFillAllCandidates,
  onHint,
  canUndo,
  canRedo,
  hasCheckpoint,
  onCreateCheckpoint,
  onRevertToCheckpoint,
  onClearCheckpoint,
  onInstall,
  onShowAchievements,
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

  const zapLongPress = useLongPress({
    onClick: () => onAutofillSingles && handleButtonPress(onAutofillSingles),
    onLongPress: () => onFillAllCandidates?.(),
  });

  // Generate number buttons based on grid size
  const numberButtons = Array.from({ length: gridSize }, (_, i) => i + 1);

  // Nine controls across: 34px keeps the row inside a 360px viewport with its
  // 12px padding (9 x 34 + gaps = 338 of 336 available would not, at 36)
  const buttonSize = 34;
  const iconSize = '1.05rem';

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
            <IconArrowForwardUp
              size={iconSize}
              style={{ color: !canRedo ? '#9ca3af' : undefined }}
            />
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

        {/* Hint */}
        {onHint && (
          <ActionIcon
            onClick={() => handleButtonPress(onHint)}
            size={buttonSize}
            radius="xl"
            variant="light"
            color="orange"
            aria-label="Hint"
          >
            <IconBulbFilled size={iconSize} />
          </ActionIcon>
        )}

        {/* Center-right: Zap. Tap autofills singles, hold pencils in candidates. */}
        {onAutofillSingles && (
          <ActionIcon
            {...zapLongPress}
            size={buttonSize}
            radius="xl"
            variant="light"
            color="yellow"
            aria-label="Autofill singles; hold to pencil in all candidates"
          >
            <IconBoltFilled size={iconSize} />
          </ActionIcon>
        )}

        {/* Checkpoint: set/update, and revert. Same pair as the desktop bar;
            these lived in the menu, where the revert was missing altogether */}
        {onCreateCheckpoint && (
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              onClick={() => handleButtonPress(onCreateCheckpoint)}
              size={buttonSize}
              radius="xl"
              variant={hasCheckpoint ? 'gradient' : 'light'}
              gradient={hasCheckpoint ? { from: 'pink', to: 'red' } : undefined}
              color={hasCheckpoint ? undefined : 'gray'}
              aria-label={hasCheckpoint ? 'Update checkpoint' : 'Save checkpoint'}
            >
              {hasCheckpoint ? <IconFlagFilled size={iconSize} /> : <IconFlag size={iconSize} />}
            </ActionIcon>
            {onRevertToCheckpoint && (
              <ActionIcon
                onClick={() => handleButtonPress(onRevertToCheckpoint)}
                disabled={!hasCheckpoint}
                size={buttonSize}
                radius="xl"
                variant={hasCheckpoint ? 'light' : 'outline'}
                color="red"
                aria-label="Revert to checkpoint"
                style={{
                  opacity: !hasCheckpoint ? 0.5 : 1,
                  borderColor: !hasCheckpoint ? '#d1d5db' : undefined,
                }}
              >
                <IconRestore
                  size={iconSize}
                  style={{ color: !hasCheckpoint ? '#9ca3af' : undefined }}
                />
              </ActionIcon>
            )}
          </Group>
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
              {onShowAchievements && (
                <Menu.Item
                  leftSection={<IconTrophy size="1rem" />}
                  onClick={() => {
                    onShowAchievements();
                    setMenuOpened(false);
                  }}
                >
                  Achievements
                </Menu.Item>
              )}
              {onInstall && (
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
              {/* The scroll-locked layout has no pull-to-refresh, and installed
                  there is no browser reload button either */}
              <Menu.Item
                leftSection={<IconRefresh size="1rem" />}
                onClick={() => {
                  setMenuOpened(false);
                  void reloadApp();
                }}
              >
                Reload App
              </Menu.Item>
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
