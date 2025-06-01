/**
 * KenkenControls Component
 *
 * Renders the control panel at the bottom of the KenKen puzzle interface.
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
 *
 * The component is fully controlled by props, making it easy to test
 * and integrate with different state management approaches.
 */

import React from "react";
import { Group, ActionIcon, Tooltip, rem, Box } from "@mantine/core";
import {
  IconPencil,
  IconCheck,
  IconArrowBackUp,
  IconArrowForwardUp,
} from "@tabler/icons-react";
import { KenkenControlsProps } from "../types/KenkenTypes";

const KenkenControls: React.FC<KenkenControlsProps> = ({
  isPencilMode,
  onTogglePencilMode,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCheckCell,
  onCheckPuzzle,
}) => {
  return (
    <Group justify="center" gap="md">
      {/* Pencil Mode Toggle Button */}
      <Tooltip
        label={`Toggle pencil mode (${isPencilMode ? "On" : "Off"})`}
        position="bottom"
      >
        <Box style={{ position: "relative" }}>
          <ActionIcon
            onClick={onTogglePencilMode}
            size={rem(40)}
            radius="xl"
            variant={isPencilMode ? "gradient" : "filled"}
            gradient={isPencilMode ? { from: "blue", to: "indigo" } : undefined}
            color={isPencilMode ? undefined : "gray"}
            style={{
              transition: "all 300ms ease",
              transform: "scale(1)",
              boxShadow: isPencilMode
                ? "0 15px 30px -8px rgba(59, 130, 246, 0.3)"
                : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
              "&:hover": {
                transform: "scale(1.1)",
              },
            }}
          >
            <IconPencil size="1.2rem" />
          </ActionIcon>

          {/* Active Indicator Dot */}
          {isPencilMode && (
            <Box
              style={{
                position: "absolute",
                top: rem(-4),
                right: rem(-4),
                width: rem(12),
                height: rem(12),
                backgroundColor: "#10b981",
                borderRadius: "50%",
                border: "3px solid white",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              }}
              className="animate-pulse"
            />
          )}
        </Box>
      </Tooltip>

      {/* Check Puzzle Button */}
      <Tooltip
        label="Check the entire puzzle for correctness"
        position="bottom"
      >
        <ActionIcon
          onClick={onCheckPuzzle}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: "teal", to: "green" }}
          style={{
            transition: "all 300ms ease",
            transform: "scale(1)",
            boxShadow: "0 15px 30px -8px rgba(16, 185, 129, 0.3)",
            "&:hover": {
              transform: "scale(1.1)",
            },
          }}
        >
          <IconCheck size="1.2rem" />
        </ActionIcon>
      </Tooltip>

      {/* Undo Button */}
      <Tooltip label="Undo last action" position="bottom">
        <ActionIcon
          onClick={onUndo}
          disabled={!canUndo}
          size={rem(40)}
          radius="xl"
          variant="gradient"
          gradient={{ from: "yellow", to: "orange" }}
          style={{
            transition: "all 300ms ease",
            transform: "scale(1)",
            boxShadow: canUndo
              ? "0 15px 30px -8px rgba(251, 191, 36, 0.3)"
              : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
            opacity: !canUndo ? 0.5 : 1,
            "&:hover": {
              transform: canUndo ? "scale(1.1)" : "scale(1)",
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
          gradient={{ from: "indigo", to: "purple" }}
          style={{
            transition: "all 300ms ease",
            transform: "scale(1)",
            boxShadow: canRedo
              ? "0 15px 30px -8px rgba(99, 102, 241, 0.3)"
              : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
            opacity: !canRedo ? 0.5 : 1,
            "&:hover": {
              transform: canRedo ? "scale(1.1)" : "scale(1)",
            },
          }}
        >
          <IconArrowForwardUp size="1.2rem" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

export default KenkenControls;
