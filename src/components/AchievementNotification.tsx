import React from 'react';
import { Group, Text, Badge, Stack } from '@mantine/core';
import { IconBrain, IconCheck, IconMedal } from '@tabler/icons-react';
import {
  AchievementResult,
  TIER_COLORS,
  TIER_LABELS,
  nextTier,
  getTimeThreshold,
  formatTime,
} from '../utils/achievements';

interface AchievementNotificationProps {
  result: AchievementResult;
  size: number;
  difficulty: string;
}

const AchievementNotification: React.FC<AchievementNotificationProps> = ({
  result,
  size,
  difficulty,
}) => {
  const color = TIER_COLORS[result.tier];
  const label = TIER_LABELS[result.tier];
  const next = nextTier(result.tier);

  const BADGE_LABELS: Record<string, string> = { unaided: 'Unaided', clean: 'Clean sheet' };

  let headline: string | null = null;
  if (result.isNew) {
    headline = `${label} Achievement!`;
  } else if (result.isUpgrade) {
    headline = `Upgraded to ${label}!`;
  }
  // A badge is worth announcing on its own, even on a slow solve
  if (!headline && result.newBadges.length === 0) return null;

  return (
    <Stack align="center" gap={4} mt="sm">
      {headline && (
        <Group gap="xs" align="center">
          <IconMedal size="1.4rem" style={{ color }} />
          <Badge
            size="lg"
            radius="xl"
            style={{
              backgroundColor: color,
              color: result.tier === 'platinum' || result.tier === 'silver' ? '#333' : '#fff',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {headline}
          </Badge>
        </Group>
      )}

      {result.newBadges.length > 0 && (
        <Group gap={6} justify="center">
          {result.newBadges.map(badge => (
            <Badge
              key={badge}
              size="md"
              radius="xl"
              variant="white"
              color="dark"
              leftSection={
                badge === 'unaided' ? <IconBrain size="0.8rem" /> : <IconCheck size="0.8rem" />
              }
            >
              {BADGE_LABELS[badge]}
            </Badge>
          ))}
        </Group>
      )}
      {headline && next && (
        <Text size="sm" style={{ opacity: 0.85, color: 'white' }}>
          {TIER_LABELS[next]} target: {formatTime(getTimeThreshold(size, difficulty, next))}
        </Text>
      )}
    </Stack>
  );
};

export default AchievementNotification;
