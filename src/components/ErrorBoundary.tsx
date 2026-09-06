/**
 * ErrorBoundary
 *
 * Catches render errors so a failure shows a recoverable screen rather than a
 * blank page.
 *
 * The reload button alone is not enough: the app restores a saved game on
 * startup, so a corrupt saved record would crash again on every boot with no
 * way out. Hence the second action, which clears saved games (leaving stats and
 * achievements alone) before reloading.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Button,
  Code,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { recordError } from '../utils/errorLog';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const SAVED_GAMES_KEY = 'arithmatrix_saved_games';
const LEGACY_GAME_KEY = 'arithmatrix_current_game_state';

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    recordError(error, 'ErrorBoundary');
  }

  handleReload = () => {
    window.location.reload();
  };

  /** Last resort for a saved game that crashes the app on every boot. */
  handleResetSavedGames = () => {
    try {
      localStorage.removeItem(SAVED_GAMES_KEY);
      localStorage.removeItem(LEGACY_GAME_KEY);
    } catch {
      // Reloading is still worth a try
    }
    window.location.href = window.location.pathname;
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Container size="sm" style={{ paddingTop: '2rem' }}>
        <Paper
          radius="xl"
          p="xl"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          <Stack align="center" gap="md">
            <ThemeIcon size={80} radius="xl" color="red">
              <IconAlertTriangle size="2.5rem" />
            </ThemeIcon>

            <Title order={2} ta="center">
              Something went wrong
            </Title>

            <Text ta="center" c="dimmed" size="sm">
              Reloading usually fixes it. If the same error comes back every time, clearing saved
              games will get you unstuck - your stats and achievements are kept.
            </Text>

            {this.state.error && (
              <Code block style={{ fontSize: 11, width: '100%', whiteSpace: 'pre-wrap' }}>
                {this.state.error.message}
              </Code>
            )}

            <Group gap="sm" justify="center">
              <Button
                onClick={this.handleReload}
                variant="gradient"
                gradient={{ from: 'red', to: 'orange' }}
                radius="xl"
              >
                Reload
              </Button>
              <Button
                onClick={this.handleResetSavedGames}
                variant="subtle"
                color="gray"
                radius="xl"
              >
                Clear saved games and reload
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Container>
    );
  }
}

export default ErrorBoundary;
