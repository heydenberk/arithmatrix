/**
 * ArithmatrixControls Component
 *
 * Renders the control panel at the bottom of the Arithmatrix puzzle interface.
 * This component provides users with essential game controls including:
 *
 * - Pencil Mode Toggle: Switch between normal entry and pencil mark mode
 * - Check Functions: Validate individual cells or the entire puzzle
 * - Undo/Redo: Navigate through the action history
 *
 * Features:
 * - Visual feedback for active states (pencil mode indicator)
 * - Tooltips for user guidance
 * - Disabled states for unavailable actions
 * - Smooth animations and modern styling
 * - Gradient color schemes for visual hierarchy
 * - Mobile-optimized touch targets and responsive design
 *
 * The component is fully controlled by props, making it easy to test
 * and integrate with different state management approaches.
 */

import React from 'react';
import { Group, ActionIcon, Tooltip, rem, Box, Stack, Text } from '@mantine/core';
import {
  IconPencil,
  IconCheck,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBookmark,
  IconBookmarkOff,
  IconRestore,
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
  onCheckCell,
  onCheckPuzzle,
  onAutofillSingles,
  hasCheckpoint = false,
  onCreateCheckpoint,
  onRevertToCheckpoint,
}) => {
  const layout = useResponsiveLayout();
  const isTouch = isTouchDevice();

  // Responsive sizing
  const buttonSize = layout.isMobile ? rem(48) : rem(40);
  const iconSize = layout.isMobile ? '1.4rem' : '1.2rem';
  const gap = layout.isMobile ? 'sm' : 'md';

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

  // Mobile layout: stack buttons in smaller groups for better thumb reach
  if (layout.isMobile) {
    return (
      <Box className="mobile-touch-optimized">
        <Stack gap="xs" align="center">
          {/* Primary actions */}
          <Group justify="center" gap={gap}>
            {/* Pencil Mode Toggle Button */}
            <Tooltip
              label={`${isPencilMode ? 'Exit' : 'Enter'} pencil mode${isTouch ? ' (or long-press cell)' : ''}`}
              position="top"
            >
              <Box style={{ position: 'relative' }}>
                <ActionIcon
                  onClick={handleButtonPress(onTogglePencilMode, 'medium')}
                  size={buttonSize}
                  radius="xl"
                  variant={isPencilMode ? 'gradient' : 'filled'}
                  gradient={isPencilMode ? { from: 'blue', to: 'indigo' } : undefined}
                  color={isPencilMode ? undefined : 'gray'}
                  style={{
                    transition: 'all 200ms ease',
                    boxShadow: isPencilMode
                      ? '0 12px 24px -6px rgba(59, 130, 246, 0.4)'
                      : '0 8px 16px -4px rgba(0, 0, 0, 0.3)',
                    minWidth: layout.minTouchTargetSize,
                    minHeight: layout.minTouchTargetSize,
                  }}
                  className="touch-feedback"
                >
                  <IconPencil size={iconSize} />
                </ActionIcon>

                {/* Active Indicator Dot */}
                {isPencilMode && (
                  <Box
                    style={{
                      position: 'absolute',
                      top: rem(-4),
                      right: rem(-4),
                      width: rem(14),
                      height: rem(14),
                      backgroundColor: '#10b981',
                      borderRadius: '50%',
                      border: '3px solid white',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                    }}
                    className="animate-pulse"
                  />
                )}
              </Box>
            </Tooltip>

            {/* Check Puzzle Button */}
            <Tooltip label="Check puzzle solution" position="top">
              <ActionIcon
                onClick={handleButtonPress(onCheckPuzzle, 'heavy')}
                size={buttonSize}
                radius="xl"
                variant="gradient"
                gradient={{ from: 'teal', to: 'green' }}
                style={{
                  transition: 'all 200ms ease',
                  boxShadow: '0 12px 24px -6px rgba(16, 185, 129, 0.4)',
                  minWidth: layout.minTouchTargetSize,
                  minHeight: layout.minTouchTargetSize,
                }}
                className="touch-feedback"
              >
                <IconCheck size={iconSize} />
              </ActionIcon>
            </Tooltip>

            {/* Autofill Singles Button */}
            {onAutofillSingles && (
              <Tooltip label="Autofill singles" position="top">
                <ActionIcon
                  onClick={handleButtonPress(onAutofillSingles, 'medium')}
                  size={buttonSize}
                  radius="xl"
                  variant="gradient"
                  gradient={{ from: 'cyan', to: 'blue' }}
                  style={{
                    transition: 'all 200ms ease',
                    boxShadow: '0 12px 24px -6px rgba(59, 130, 246, 0.4)',
                    minWidth: layout.minTouchTargetSize,
                    minHeight: layout.minTouchTargetSize,
                  }}
                  className="touch-feedback"
                >
                  <IconBolt size={iconSize} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {/* Secondary actions */}
          <Group justify="center" gap={gap}>
            {/* Undo Button */}
            <Tooltip label="Undo last action" position="top">
              <ActionIcon
                onClick={handleButtonPress(onUndo)}
                disabled={!canUndo}
                size={buttonSize}
                radius="xl"
                variant="gradient"
                gradient={{ from: 'yellow', to: 'orange' }}
                style={{
                  transition: 'all 200ms ease',
                  boxShadow: canUndo
                    ? '0 12px 24px -6px rgba(251, 191, 36, 0.4)'
                    : '0 4px 8px rgba(0, 0, 0, 0.15)',
                  opacity: !canUndo ? 0.5 : 1,
                  minWidth: layout.minTouchTargetSize,
                  minHeight: layout.minTouchTargetSize,
                }}
                className="touch-feedback"
              >
                <IconArrowBackUp size={iconSize} />
              </ActionIcon>
            </Tooltip>

            {/* Redo Button */}
            <Tooltip label="Redo last undone action" position="top">
              <ActionIcon
                onClick={handleButtonPress(onRedo)}
                disabled={!canRedo}
                size={buttonSize}
                radius="xl"
                variant="gradient"
                gradient={{ from: 'indigo', to: 'purple' }}
                style={{
                  transition: 'all 200ms ease',
                  boxShadow: canRedo
                    ? '0 12px 24px -6px rgba(99, 102, 241, 0.4)'
                    : '0 4px 8px rgba(0, 0, 0, 0.15)',
                  opacity: !canRedo ? 0.5 : 1,
                  minWidth: layout.minTouchTargetSize,
                  minHeight: layout.minTouchTargetSize,
                }}
                className="touch-feedback"
              >
                <IconArrowForwardUp size={iconSize} />
              </ActionIcon>
            </Tooltip>

            {/* Checkpoint Controls */}
            {onCreateCheckpoint && (
              <Tooltip
                label={hasCheckpoint ? 'Clear checkpoint' : 'Create checkpoint'}
                position="top"
              >
                <ActionIcon
                  onClick={handleButtonPress(onCreateCheckpoint, 'medium')}
                  size={buttonSize}
                  radius="xl"
                  variant="gradient"
                  gradient={
                    hasCheckpoint ? { from: 'red', to: 'orange' } : { from: 'green', to: 'teal' }
                  }
                  style={{
                    transition: 'all 200ms ease',
                    boxShadow: hasCheckpoint
                      ? '0 12px 24px -6px rgba(239, 68, 68, 0.4)'
                      : '0 12px 24px -6px rgba(16, 185, 129, 0.4)',
                    minWidth: layout.minTouchTargetSize,
                    minHeight: layout.minTouchTargetSize,
                  }}
                  className="touch-feedback"
                >
                  {hasCheckpoint ? (
                    <IconBookmarkOff size={iconSize} />
                  ) : (
                    <IconBookmark size={iconSize} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}

            {onRevertToCheckpoint && (
              <Tooltip label="Revert to checkpoint" position="top">
                <ActionIcon
                  onClick={handleButtonPress(onRevertToCheckpoint, 'medium')}
                  disabled={!hasCheckpoint}
                  size={buttonSize}
                  radius="xl"
                  variant="gradient"
                  gradient={{ from: 'purple', to: 'indigo' }}
                  style={{
                    transition: 'all 200ms ease',
                    boxShadow: hasCheckpoint
                      ? '0 12px 24px -6px rgba(124, 58, 237, 0.4)'
                      : '0 4px 8px rgba(0, 0, 0, 0.15)',
                    opacity: !hasCheckpoint ? 0.5 : 1,
                    minWidth: layout.minTouchTargetSize,
                    minHeight: layout.minTouchTargetSize,
                  }}
                  className="touch-feedback"
                >
                  <IconRestore size={iconSize} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {/* Mobile helper text */}
          {isTouch && (
            <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: 280 }}>
              Long-press any cell to toggle pencil mode
            </Text>
          )}
        </Stack>
      </Box>
    );
  }

  // Desktop layout (original)
  return (
    <Group justify="center" gap="md">
      {/* Pencil Mode Toggle Button */}
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
              transform: 'scale(1)',
              boxShadow: isPencilMode
                ? '0 15px 30px -8px rgba(59, 130, 246, 0.3)'
                : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
              '&:hover': {
                transform: 'scale(1.1)',
              },
            }}
          >
            <IconPencil size="1.2rem" />
          </ActionIcon>

          {/* Active Indicator Dot */}
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
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              }}
              className="animate-pulse"
            />
          )}
        </Box>
      </Tooltip>

      {/* Check Puzzle Button */}
      <Tooltip label="Check the entire puzzle for correctness" position="bottom">
        <ActionIcon
          onClick={onCheckPuzzle}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'teal', to: 'green' }}
          style={{
            transition: 'all 300ms ease',
            transform: 'scale(1)',
            boxShadow: '0 15px 30px -8px rgba(16, 185, 129, 0.3)',
            '&:hover': {
              transform: 'scale(1.1)',
            },
          }}
        >
          <IconCheck size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Autofill Singles Button */}
      {onAutofillSingles && (
        <Tooltip label="Autofill singles" position="bottom">
          <ActionIcon
            onClick={onAutofillSingles}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: 'cyan', to: 'blue' }}
            style={{
              transition: 'all 300ms ease',
              transform: 'scale(1)',
              boxShadow: '0 15px 30px -8px rgba(59, 130, 246, 0.3)',
              '&:hover': {
                transform: 'scale(1.1)',
              },
            }}
          >
            <IconBolt size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      )}

      {/* Undo Button */}
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
            transform: 'scale(1)',
            boxShadow: canUndo
              ? '0 15px 30px -8px rgba(251, 191, 36, 0.3)'
              : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
            opacity: !canUndo ? 0.5 : 1,
            '&:hover': {
              transform: canUndo ? 'scale(1.1)' : 'scale(1)',
            },
          }}
        >
          <IconArrowBackUp size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Redo Button */}
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
            transform: 'scale(1)',
            boxShadow: canRedo
              ? '0 15px 30px -8px rgba(99, 102, 241, 0.3)'
              : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
            opacity: !canRedo ? 0.5 : 1,
            '&:hover': {
              transform: canRedo ? 'scale(1.1)' : 'scale(1)',
            },
          }}
        >
          <IconArrowForwardUp size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Checkpoint Controls */}
      {onCreateCheckpoint && (
        <Tooltip label={hasCheckpoint ? 'Clear checkpoint' : 'Create checkpoint'} position="bottom">
          <ActionIcon
            onClick={onCreateCheckpoint}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={hasCheckpoint ? { from: 'red', to: 'orange' } : { from: 'green', to: 'teal' }}
            style={{
              transition: 'all 300ms ease',
              transform: 'scale(1)',
              boxShadow: hasCheckpoint
                ? '0 15px 30px -8px rgba(239, 68, 68, 0.3)'
                : '0 15px 30px -8px rgba(16, 185, 129, 0.3)',
              '&:hover': {
                transform: 'scale(1.1)',
              },
            }}
          >
            {hasCheckpoint ? <IconBookmarkOff size="1.2rem" /> : <IconBookmark size="1.2rem" />}
          </ActionIcon>
        </Tooltip>
      )}

      {onRevertToCheckpoint && (
        <Tooltip label="Revert to checkpoint" position="bottom">
          <ActionIcon
            onClick={onRevertToCheckpoint}
            disabled={!hasCheckpoint}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: 'purple', to: 'indigo' }}
            style={{
              transition: 'all 300ms ease',
              transform: 'scale(1)',
              boxShadow: hasCheckpoint
                ? '0 15px 30px -8px rgba(124, 58, 237, 0.3)'
                : '0 15px 30px -8px rgba(0, 0, 0, 0.25)',
              opacity: !hasCheckpoint ? 0.5 : 1,
              '&:hover': {
                transform: hasCheckpoint ? 'scale(1.1)' : 'scale(1)',
              },
            }}
          >
            <IconRestore size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
};

export default ArithmatrixControls;
