/**
 * ArithmatrixControls Component
 *
 * Renders the control panel for the Arithmatrix puzzle interface.
 * On mobile, includes timer and menu in one compact row.
 */

import React, { useState } from 'react';
import { Group, ActionIcon, Tooltip, rem, Box } from '@mantine/core';
import {
  IconPencil,
  IconCheck,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconMenu2,
  IconRefresh,
  IconPlus,
} from '@tabler/icons-react';
import { ArithmatrixControlsProps } from '../types/ArithmatrixTypes';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { isTouchDevice, triggerHapticFeedback } from '../utils/touchUtils';

const ArithmatrixControls: React.FC<ArithmatrixControlsProps> = ({
  isPencilMode,
  onTogglePencilMode,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCheckPuzzle,
  timerElement,
  onReset,
  onNewGame,
}) => {
  const layout = useResponsiveLayout();
  const isTouch = isTouchDevice();
  const [showMenu, setShowMenu] = useState(false);

  // Responsive sizing - compact on mobile
  const buttonSize = layout.isMobile ? rem(32) : rem(40);
  const iconSize = layout.isMobile ? '0.95rem' : '1.2rem';

  // Handle button press with haptic feedback
  const handleButtonPress = (
    callback: () => void,
    feedbackType: 'light' | 'medium' | 'heavy' = 'light'
  ) => {
    return () => {
      if (isTouch) {
        triggerHapticFeedback(feedbackType);
      }
      callback();
    };
  };

  // Mobile layout: single compact row with timer, controls, and menu
  if (layout.isMobile) {
    return (
      <Box>
        <Group justify="space-between" gap={4} wrap="nowrap" w="100%">
          {/* Timer */}
          {timerElement}

          {/* Core controls */}
          <Group gap={4} wrap="nowrap">
            {/* Pencil Mode */}
            <Box style={{ position: 'relative' }}>
              <ActionIcon
                onClick={handleButtonPress(onTogglePencilMode, 'medium')}
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

            {/* Check */}
            <ActionIcon
              onClick={handleButtonPress(onCheckPuzzle, 'heavy')}
              size={buttonSize}
              radius="xl"
              variant="light"
              color="green"
            >
              <IconCheck size={iconSize} />
            </ActionIcon>

            {/* Undo */}
            <ActionIcon
              onClick={handleButtonPress(onUndo)}
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
              onClick={handleButtonPress(onRedo)}
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

          {/* Menu button */}
          <ActionIcon
            onClick={() => setShowMenu(!showMenu)}
            size={buttonSize}
            radius="xl"
            variant="light"
            color="gray"
          >
            <IconMenu2 size={iconSize} />
          </ActionIcon>
        </Group>

        {/* Expanded menu */}
        {showMenu && (
          <Group justify="center" gap={8} mt={8}>
            <ActionIcon
              onClick={() => {
                if (onReset) {
                  handleButtonPress(onReset, 'medium')();
                }
                setShowMenu(false);
              }}
              size={buttonSize}
              radius="xl"
              variant="light"
              color="red"
            >
              <IconRefresh size={iconSize} />
            </ActionIcon>
            <ActionIcon
              onClick={() => {
                if (onNewGame) {
                  handleButtonPress(onNewGame, 'medium')();
                }
                setShowMenu(false);
              }}
              size={buttonSize}
              radius="xl"
              variant="light"
              color="blue"
            >
              <IconPlus size={iconSize} />
            </ActionIcon>
          </Group>
        )}
      </Box>
    );
  }

  // Desktop layout
  return (
    <Group justify="center" gap="md">
      {/* Pencil Mode Toggle */}
      <Tooltip label={`Toggle pencil mode (${isPencilMode ? 'On' : 'Off'})`} position="bottom">
        <Box style={{ position: 'relative' }}>
          <ActionIcon
            onClick={onTogglePencilMode}
            size={rem(40)}
            radius="xl"
            variant={isPencilMode ? 'gradient' : 'filled'}
            gradient={isPencilMode ? { from: 'blue', to: 'indigo' } : undefined}
            color={isPencilMode ? undefined : 'gray'}
            style={{
              transition: 'all 300ms ease',
              boxShadow: isPencilMode
                ? '0 15px 30px -8px rgba(59, 130, 246, 0.3)'
                : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
            }}
          >
            <IconPencil size="1.2rem" />
          </ActionIcon>
          {isPencilMode && (
            <Box
              style={{
                position: 'absolute',
                top: rem(-4),
                right: rem(-4),
                width: rem(12),
                height: rem(12),
                backgroundColor: '#10b981',
                borderRadius: '50%',
                border: '3px solid white',
              }}
            />
          )}
        </Box>
      </Tooltip>

      {/* Check Puzzle */}
      <Tooltip label="Check the entire puzzle for correctness" position="bottom">
        <ActionIcon
          onClick={onCheckPuzzle}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'teal', to: 'green' }}
          style={{
            transition: 'all 300ms ease',
            boxShadow: '0 15px 30px -8px rgba(16, 185, 129, 0.3)',
          }}
        >
          <IconCheck size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Undo */}
      <Tooltip label="Undo last action" position="bottom">
        <ActionIcon
          onClick={onUndo}
          disabled={!canUndo}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'yellow', to: 'orange' }}
          style={{
            transition: 'all 300ms ease',
            boxShadow: canUndo
              ? '0 15px 30px -8px rgba(251, 191, 36, 0.3)'
              : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
            opacity: !canUndo ? 0.5 : 1,
          }}
        >
          <IconArrowBackUp size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Redo */}
      <Tooltip label="Redo last undone action" position="bottom">
        <ActionIcon
          onClick={onRedo}
          disabled={!canRedo}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'indigo', to: 'purple' }}
          style={{
            transition: 'all 300ms ease',
            boxShadow: canRedo
              ? '0 15px 30px -8px rgba(99, 102, 241, 0.3)'
              : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
            opacity: !canRedo ? 0.5 : 1,
          }}
        >
          <IconArrowForwardUp size="1.2rem" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

export default ArithmatrixControls;
