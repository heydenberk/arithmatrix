import React from "react";
import { Group, Stack, Text, Select, Button, rem } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { VALID_SIZES, DIFFICULTY_LEVELS } from "../constants/gameConstants";
import { UISettings } from "../hooks/useGameSettings";

interface GameSettingsPanelProps {
  uiSettings: UISettings;
  onSizeChange: (size: number) => void;
  onDifficultyChange: (difficulty: string) => void;
  onStartNewGame: () => void;
}

export const GameSettingsPanel: React.FC<GameSettingsPanelProps> = ({
  uiSettings,
  onSizeChange,
  onDifficultyChange,
  onStartNewGame,
}) => {
  const handleSizeChange = (value: string | null) => {
    if (value) {
      onSizeChange(parseInt(value, 10));
    }
  };

  const handleDifficultyChange = (value: string | null) => {
    if (value) {
      onDifficultyChange(value);
    }
  };

  const sizeOptions = VALID_SIZES.map((size) => ({
    value: size.toString(),
    label: `${size}×${size}`,
  }));

  const difficultyOptions = DIFFICULTY_LEVELS.map((level) => ({
    value: level,
    label: level.charAt(0).toUpperCase() + level.slice(1),
  }));

  return (
    <Group justify="center" gap="sm" wrap="wrap">
      {/* Size Selector */}
      <Stack align="center" gap={rem(4)}>
        <Text size="xs" fw={600} c="gray.6">
          Size
        </Text>
        <Select
          value={uiSettings.selectedSize.toString()}
          onChange={handleSizeChange}
          size="xs"
          data={sizeOptions}
          styles={{
            input: {
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "white",
              border: "none",
              borderRadius: rem(50),
              fontWeight: 600,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              "&:focus": {
                boxShadow: "0 0 0 4px rgba(139, 92, 246, 0.3)",
              },
            },
          }}
        />
      </Stack>

      {/* Difficulty Selector */}
      <Stack align="center" gap={rem(4)}>
        <Text size="xs" fw={600} c="gray.6">
          Difficulty
        </Text>
        <Select
          value={uiSettings.selectedDifficulty}
          onChange={handleDifficultyChange}
          size="xs"
          data={difficultyOptions}
          styles={{
            input: {
              background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              color: "white",
              border: "none",
              borderRadius: rem(50),
              fontWeight: 600,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              textTransform: "capitalize",
              "&:focus": {
                boxShadow: "0 0 0 4px rgba(236, 72, 153, 0.3)",
              },
            },
          }}
        />
      </Stack>

      {/* Start New Game Button */}
      <Stack align="center" gap={rem(4)}>
        <Text size="xs" fw={600} c="gray.6">
          Action
        </Text>
        <Button
          onClick={onStartNewGame}
          radius="xl"
          size="xs"
          variant="gradient"
          gradient={{ from: "violet", to: "cyan" }}
          leftSection={<IconSparkles size="0.9rem" />}
          style={{
            transition: "all 200ms ease",
            fontWeight: 600,
            "&:hover": {
              transform: "scale(1.05)",
            },
          }}
        >
          Start New Game
        </Button>
      </Stack>
    </Group>
  );
};
