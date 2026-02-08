import React, { useState, useMemo } from 'react';
import {
  Modal,
  Text,
  Group,
  Stack,
  SegmentedControl,
  Tooltip,
  Box,
  Badge,
} from '@mantine/core';
import { OPERATION_TIER_LABELS } from '../constants/gameConstants';
import {
  getAchievements,
  getAchievementProgress,
  getAllCombinations,
  TIER_COLORS,
  TIER_LABELS,
  TIER_ORDER,
  formatTime,
  getTimeThreshold,
  type Achievement,
} from '../utils/achievements';

interface AchievementGalleryProps {
  opened: boolean;
  onClose: () => void;
}

type GroupBy = 'size' | 'difficulty' | 'operations';

const DIFFICULTY_LABELS: Record<string, string> = {
  easiest: 'Easiest',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

const SIZE_LABELS: Record<number, string> = {
  4: '4x4',
  5: '5x5',
  6: '6x6',
  7: '7x7',
};

const LOCKED_COLOR = '#ddd';

const AchievementGallery: React.FC<AchievementGalleryProps> = ({ opened, onClose }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('size');

  const store = useMemo(() => (opened ? getAchievements() : {}), [opened]);
  const progress = useMemo(() => (opened ? getAchievementProgress() : null), [opened]);
  const combos = useMemo(() => getAllCombinations(), []);

  const grouped = useMemo(() => {
    const groups: Record<string, { key: string; size: number; difficulty: string; operationsTier: string; achievement?: Achievement }[]> = {};

    for (const combo of combos) {
      let groupKey: string;
      if (groupBy === 'size') {
        groupKey = SIZE_LABELS[combo.size];
      } else if (groupBy === 'difficulty') {
        groupKey = DIFFICULTY_LABELS[combo.difficulty] || combo.difficulty;
      } else {
        groupKey = OPERATION_TIER_LABELS[combo.operationsTier] || combo.operationsTier;
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({ ...combo, achievement: store[combo.key] });
    }

    return groups;
  }, [combos, store, groupBy]);

  const tooltipContent = (combo: { size: number; difficulty: string; operationsTier: string; achievement?: Achievement }) => {
    const { size, difficulty, operationsTier, achievement } = combo;
    const label = `${SIZE_LABELS[size]} ${DIFFICULTY_LABELS[difficulty]} (${OPERATION_TIER_LABELS[operationsTier]})`;

    if (!achievement) {
      const bronzeTime = getTimeThreshold(size, difficulty, 'silver');
      return `${label}\nLocked - Complete to unlock\nSilver: < ${formatTime(bronzeTime)}`;
    }

    const tierLabel = TIER_LABELS[achievement.tier];
    const time = formatTime(achievement.timeSeconds);
    let nextLine = '';
    const tierIdx = TIER_ORDER.indexOf(achievement.tier);
    if (tierIdx < TIER_ORDER.length - 1) {
      const next = TIER_ORDER[tierIdx + 1];
      nextLine = `\nNext: ${TIER_LABELS[next]} < ${formatTime(getTimeThreshold(size, difficulty, next))}`;
    }

    return `${label}\n${tierLabel} - ${time}${nextLine}`;
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <Text fw={700} size="lg">Achievements</Text>
          {progress && (
            <Badge variant="light" color="indigo" size="lg">
              {progress.unlocked} / {progress.total}
            </Badge>
          )}
        </Group>
      }
      fullScreen={isMobile}
      size="lg"
      centered
    >
      <Stack gap="md">
        {/* Tier legend */}
        <Group gap="sm" justify="center">
          {TIER_ORDER.map(t => (
            <Group key={t} gap={4}>
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: TIER_COLORS[t],
                  border: '1px solid rgba(0,0,0,0.15)',
                }}
              />
              <Text size="xs" c="dimmed">{TIER_LABELS[t]}{progress ? ` (${progress.byTier[t]})` : ''}</Text>
            </Group>
          ))}
          <Group gap={4}>
            <Box
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: LOCKED_COLOR,
                border: '1px solid rgba(0,0,0,0.1)',
              }}
            />
            <Text size="xs" c="dimmed">Locked</Text>
          </Group>
        </Group>

        <SegmentedControl
          value={groupBy}
          onChange={v => setGroupBy(v as GroupBy)}
          data={[
            { value: 'size', label: 'By Size' },
            { value: 'difficulty', label: 'By Difficulty' },
            { value: 'operations', label: 'By Operations' },
          ]}
          fullWidth
        />

        {Object.entries(grouped).map(([groupLabel, items]) => (
          <Box key={groupLabel}>
            <Text fw={600} size="sm" mb={6}>{groupLabel}</Text>
            <Group gap={6} wrap="wrap">
              {items.map(item => {
                const achievement = item.achievement;
                const color = achievement ? TIER_COLORS[achievement.tier] : LOCKED_COLOR;
                const tip = tooltipContent(item);

                return (
                  <Tooltip
                    key={item.key}
                    label={tip}
                    multiline
                    w={220}
                    style={{ whiteSpace: 'pre-line' }}
                    position="top"
                    withArrow
                  >
                    <Box
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: achievement ? '2px solid rgba(0,0,0,0.15)' : '1px solid rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'transform 150ms ease',
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.3)';
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                        (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Group>
          </Box>
        ))}
      </Stack>
    </Modal>
  );
};

export default AchievementGallery;
