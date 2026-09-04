/**
 * InstallDiagnostics Component
 *
 * Reports why the browser is or isn't offering to install the app.
 *
 * Installability failures are invisible from the outside: the manifest, service
 * worker and icons can all be provably valid while the browser still declines
 * to offer an install, for reasons that live on the device (already installed,
 * an in-app WebView with no install UI, a browser that doesn't implement the
 * prompt at all). This gathers the facts that distinguish those cases and
 * offers them as copyable text.
 *
 * Shown inside the install-instructions modal, which is only reached when no
 * native prompt was available - exactly when the answer matters.
 */

import React, { useEffect, useState } from 'react';
import { Box, Button, Code, Group, Stack, Text } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';

type Report = Record<string, string>;

const readInstallPromptFired = (): boolean =>
  (window as unknown as { __installPromptFired?: boolean }).__installPromptFired === true;

const displayMode = (): string => {
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
  const match = modes.find(mode => window.matchMedia?.(`(display-mode: ${mode})`).matches);
  return match ?? 'unknown';
};

/**
 * Flags contexts that have no install affordance at all, which is the most
 * common reason a valid PWA appears to be un-installable: links opened inside
 * another app's browser (Slack, Gmail, Instagram, ...) run in a WebView.
 */
const browserContext = (ua: string): string => {
  if (/\bFBAN|FBAV|Instagram|Twitter|Line\/|MicroMessenger/i.test(ua)) {
    return 'in-app WebView (no install support)';
  }
  if (/\bwv\b/.test(ua)) return 'Android WebView (no install support)';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS/i.test(ua)) return 'Firefox';
  if (/CriOS/i.test(ua)) return 'Chrome on iOS (uses Safari engine)';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'unrecognised';
};

const gather = async (): Promise<Report> => {
  const ua = navigator.userAgent;
  const report: Report = {
    'Install prompt offered': readInstallPromptFired() ? 'yes' : 'no',
    'beforeinstallprompt supported':
      'onbeforeinstallprompt' in window ? 'yes' : 'no (not Chromium)',
    Browser: browserContext(ua),
    'Display mode': displayMode(),
    Origin: window.location.origin,
    Path: window.location.pathname,
  };

  // Service worker: registered, activated, and actually controlling this page
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    if (!registrations || registrations.length === 0) {
      report['Service worker'] = 'none registered';
    } else {
      const states = registrations.map(
        r => `${r.scope} (${r.active?.state ?? 'no active worker'})`
      );
      report['Service worker'] = states.join('; ');
      report['SW controlling page'] = navigator.serviceWorker.controller ? 'yes' : 'no';
    }
  } catch (error) {
    report['Service worker'] = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  // Manifest reachable and parseable from this origin
  try {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]');
    if (!link) {
      report['Manifest'] = 'no <link rel=manifest>';
    } else {
      const response = await fetch(link.href);
      const json = await response.json();
      report['Manifest'] = `${response.status} ${json.name ?? '(no name)'}`;
    }
  } catch (error) {
    report['Manifest'] = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  // Any installed app the browser associates with this origin
  try {
    const related = (
      navigator as unknown as {
        getInstalledRelatedApps?: () => Promise<unknown[]>;
      }
    ).getInstalledRelatedApps;
    report['Installed related apps'] = related
      ? String((await related.call(navigator)).length)
      : 'API unavailable';
  } catch {
    report['Installed related apps'] = 'unavailable';
  }

  report['User agent'] = ua;
  return report;
};

const InstallDiagnostics: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gather().then(result => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const asText = report
    ? Object.entries(report)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    : '';

  const handleCopy = () => {
    navigator.clipboard?.writeText(asText).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false)
    );
  };

  if (!report) return null;

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="xs" fw={700} c="dimmed">
          Why install isn&apos;t being offered
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={copied ? <IconCheck size="0.8rem" /> : <IconCopy size="0.8rem" />}
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Group>
      <Box style={{ maxHeight: 200, overflowY: 'auto' }}>
        <Code block style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {asText}
        </Code>
      </Box>
    </Stack>
  );
};

export default InstallDiagnostics;
