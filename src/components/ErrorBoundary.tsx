import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  Container,
  Paper,
  Stack,
  Title,
  Text,
  Button,
  ThemeIcon,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" style={{ paddingTop: "2rem" }}>
          <Paper
            radius="xl"
            p="xl"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
            }}
          >
            <Stack align="center" gap="md">
              <ThemeIcon size={80} radius="xl" color="red">
                <IconAlertTriangle size="2.5rem" />
              </ThemeIcon>

              <Title order={2} ta="center">
                Something went wrong
              </Title>

              <Text ta="center" c="dimmed">
                The application encountered an unexpected error. Please try
                reloading the page.
              </Text>

              <Button
                onClick={this.handleReload}
                variant="gradient"
                gradient={{ from: "red", to: "orange" }}
                size="lg"
                radius="xl"
              >
                Reload Page
              </Button>
            </Stack>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}
