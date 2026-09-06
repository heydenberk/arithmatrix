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
import { IconBulbFilled, IconChevronRight, IconX } from '@tabler/icons-react';
import { Hint } from '../utils/hints';

interface HintPanelProps {
  hint: Hint;
  /** Index into hint.levels of the level currently shown. */
  level: number;
  onMore: () => void;
  onClose: () => void;
  compact?: boolean;
}

const HintPanel: React.FC<HintPanelProps> = ({ hint, level, onMore, onClose, compact = false }) => {
  const current = hint.levels[Math.min(level, hint.levels.length - 1)];
  const hasMore = level < hint.levels.length - 1;
  const stepped = hint.levels.length > 1;

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

        {hasMore && (
          <Group justify="flex-end">
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
          </Group>
        )}
      </Stack>
    </Paper>
  );
};

export default HintPanel;
