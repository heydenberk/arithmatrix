/**
 * HintPanel
 *
 * Shows one level of a hint at a time, with a button to ask for more.
 *
 * Deliberately not a modal. The later levels highlight cells on the board, so
 * anything covering the grid would defeat the point; this sits above it.
 */

import React from 'react';
import { ActionIcon, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import {
  IconArrowBackUp,
  IconBulbFilled,
  IconCheck,
  IconChevronRight,
  IconX,
} from '@tabler/icons-react';
import { Hint } from '../utils/hints';

interface HintPanelProps {
  hint: Hint;
  /** Index into hint.levels of the level currently shown. */
  level: number;
  onMore: () => void;
  onClose: () => void;
  /** Carries out the hint's move. Absent when there is nothing to carry out. */
  onApply?: () => void;
  /**
   * Winds the board back to before the mistake. Offered only for the hints
   * that report one, and only when there is a sound position to return to.
   */
  onRewind?: () => void;
  compact?: boolean;
}

const HintPanel: React.FC<HintPanelProps> = ({
  hint,
  level,
  onMore,
  onClose,
  onApply,
  onRewind,
  compact = false,
}) => {
  const current = hint.levels[Math.min(level, hint.levels.length - 1)];
  const hasMore = level < hint.levels.length - 1;
  const stepped = hint.levels.length > 1;
  /*
   * Only at the end. Offering it earlier would let the player take the move
   * without ever seeing the reasoning, which is the opposite of the point.
   */
  const canApply = !hasMore && hint.action && onApply;
  /*
   * The precise fix and the rewind are different bargains: clearing the wrong
   * cells keeps everything else you have done, while rewinding also gives
   * back the pencil marks as they were before you crossed the answer off. So
   * both are offered rather than one chosen for the player.
   */
  const canRewind = !hasMore && onRewind;

  return (
    <Paper
      radius="lg"
      p={compact ? 'xs' : 'sm'}
      style={{
        background: 'rgba(255, 255, 255, 0.94)',
        boxShadow: '0 8px 20px -8px rgba(0, 0, 0, 0.25)',
        maxWidth: compact ? undefined : 560,
        width: '100%',
      }}
    >
      <Stack gap={6}>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconBulbFilled size={16} color="var(--mantine-color-yellow-6)" />
            <Text size="xs" fw={700} c="gray.8">
              {current.title}
            </Text>
            {stepped && (
              <Badge size="xs" variant="light" color="gray">
                {Math.min(level, hint.levels.length - 1) + 1}/{hint.levels.length}
              </Badge>
            )}
            {/* The technique's name, kept out of the sentence itself so the
                explanation leads rather than the solver's jargon. */}
            {hint.techniqueLabel && (
              <Badge size="xs" variant="transparent" color="gray" px={2} tt="none">
                {hint.techniqueLabel}
              </Badge>
            )}
          </Group>
          <ActionIcon
            size="sm"
            radius="xl"
            variant="subtle"
            color="gray"
            onClick={onClose}
            aria-label="Dismiss hint"
          >
            <IconX size="0.9rem" />
          </ActionIcon>
        </Group>

        <Text size="sm" c="gray.8" style={{ lineHeight: 1.45 }}>
          {current.body}
        </Text>

        {(hasMore || canApply || canRewind) && (
          <Group justify="flex-end" gap="xs">
            {canRewind && (
              <Button
                size="compact-xs"
                radius="xl"
                variant="light"
                color="gray"
                leftSection={<IconArrowBackUp size="0.8rem" />}
                onClick={onRewind}
              >
                Rewind to before it
              </Button>
            )}
            {hasMore ? (
              <Button
                size="compact-xs"
                radius="xl"
                variant="light"
                color="yellow"
                rightSection={<IconChevronRight size="0.8rem" />}
                onClick={onMore}
              >
                {/* The last step is the solver's own wording, which names the value */}
                {level === hint.levels.length - 2 ? 'Show the move' : 'Tell me more'}
              </Button>
            ) : (
              canApply && (
                <Button
                  size="compact-xs"
                  radius="xl"
                  variant="filled"
                  color="teal"
                  leftSection={<IconCheck size="0.8rem" />}
                  onClick={onApply}
                >
                  {hint.action!.label}
                </Button>
              )
            )}
          </Group>
        )}
      </Stack>
    </Paper>
  );
};

export default HintPanel;
