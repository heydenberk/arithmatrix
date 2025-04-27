import React from "react";
import { Alert, Stack, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { BLUR_VALUES } from "../constants/gameConstants";

interface ErrorStateProps {
  error: string;
  title?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  title = "Error Loading Puzzle",
}) => {
  return (
    <Alert
      color="red"
      radius="xl"
      icon={<IconAlertCircle size="1.5rem" />}
      styles={{
        root: {
          backgroundColor: "rgba(254, 242, 242, 0.85)",
          backdropFilter: `blur(${BLUR_VALUES.LIGHT})`,
          WebkitBackdropFilter: `blur(${BLUR_VALUES.LIGHT})`,
          border: "1px solid rgba(252, 165, 165, 0.5)",
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
        },
      }}
    >
      <Stack gap="xs">
        <Text fw={600} size="lg">
          {title}
        </Text>
        <Text>{error}</Text>
      </Stack>
    </Alert>
  );
};
