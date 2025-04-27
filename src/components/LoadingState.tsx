import React from "react";
import { Paper, Center, Group, Loader, Text, rem } from "@mantine/core";
import { BLUR_VALUES } from "../constants/gameConstants";

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading puzzle...",
}) => {
  return (
    <Paper
      radius="xl"
      p="xl"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        backdropFilter: `blur(${BLUR_VALUES.LIGHT})`,
        WebkitBackdropFilter: `blur(${BLUR_VALUES.LIGHT})`,
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
      }}
    >
      <Center>
        <Group gap="md">
          <Loader color="indigo" size="md" />
          <Text size="xl" fw={500} c="gray.7">
            {message}
          </Text>
        </Group>
      </Center>
    </Paper>
  );
};
