/**
 * ArithmatrixControls Component
 *
 * Renders the control panel for the Arithmatrix puzzle interface.
 * On mobile, includes timer and menu in one compact row.
 */

import React from 'react';
import { Group, ActionIcon, Tooltip, rem, Box } from '@mantine/core';
import {
  IconPencil,
  IconCheck,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconRefresh,
  IconPlus,
  IconBolt,
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
  onAutofillSingles,
  timerElement,
  onReset,
  onNewGame,
}) => {
  const layout = useResponsiveLayout();
  const isTouch = isTouchDevice();

  // Responsive sizing - compact on mobile
  const buttonSize = layout.isMobile ? rem(28) : rem(40);
  const iconSize = layout.isMobile ? '0.9rem' : '1.2rem';

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

  // Mobile layout: single compact row with all controls inline
  if (layout.isMobile) {
    return (
      <Box
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 12,
          padding: '6px 8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Group justify="space-between" gap={3} wrap="nowrap" w="100%">
          {/* Timer */}
          {timerElement}

          {/* All controls inline */}
          <Group gap={3} wrap="nowrap">
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
                    width: 6,
                    height: 6,
                    backgroundColor: '#10b981',
                    borderRadius: '50%',
                    border: '1px solid white',
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

            {/* Autofill Singles (Zap) */}
            {onAutofillSingles && (
              <ActionIcon
                onClick={handleButtonPress(onAutofillSingles, 'medium')}
                size={buttonSize}
                radius="xl"
                variant="light"
                color="yellow"
              >
                <IconBolt size={iconSize} />
              </ActionIcon>
            )}

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

            {/* Reset */}
            <ActionIcon
              onClick={handleButtonPress(onReset || (() => {}), 'medium')}
              size={buttonSize}
              radius="xl"
              variant="light"
              color="red"
            >
              <IconRefresh size={iconSize} />
            </ActionIcon>

            {/* New Game */}
            <ActionIcon
              onClick={handleButtonPress(onNewGame || (() => {}), 'medium')}
              size={buttonSize}
              radius="xl"
              variant="light"
              color="blue"
            >
              <IconPlus size={iconSize} />
            </ActionIcon>
          </Group>
        </Group>
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

      {/* Autofill Singles (Zap) */}
      {onAutofillSingles && (
        <Tooltip label="Autofill cells with only one possibility" position="bottom">
          <ActionIcon
            onClick={onAutofillSingles}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: 'yellow', to: 'amber' }}
            style={{
              transition: 'all 300ms ease',
              boxShadow: '0 15px 30px -8px rgba(251, 191, 36, 0.3)',
            }}
          >
            <IconBolt size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      )}

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
