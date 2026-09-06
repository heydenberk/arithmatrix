/**
 * useInstallPrompt
 *
 * Owns everything about offering to install the app: whether the browser has
 * given us a prompt to fire, whether we are already running installed, and
 * whether the player has waved the banner away.
 *
 * The prompt itself is captured by an inline script in index.html rather than
 * here, because Chrome fires `beforeinstallprompt` once and can do so before
 * React mounts - a listener registered in an effect used to miss it entirely,
 * after which nothing could ever offer an install. This hook reads what that
 * script stashed and listens for the custom event it dispatches.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PromptHolder = { __installPrompt?: BeforeInstallPromptEvent | null };

const getInstallPrompt = (): BeforeInstallPromptEvent | null =>
  (window as unknown as PromptHolder).__installPrompt ?? null;

const clearInstallPrompt = () => {
  (window as unknown as PromptHolder).__installPrompt = null;
};

/** True when the app is already running as an installed PWA. */
const isRunningInstalled = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  window.matchMedia?.('(display-mode: minimal-ui)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const INSTALL_DISMISSED_KEY = 'arithmatrix_install_dismissed';

export type InstallPromptState = {
  /** Show the banner: a prompt exists, we're not installed, not dismissed. */
  showBanner: boolean;
  /** Fires the native prompt, or asks for the instructions modal instead. */
  promptToInstall: () => Promise<void>;
  dismissBanner: () => void;
  /** True when no native prompt was available and we should explain manually. */
  needsManualInstructions: boolean;
  clearManualInstructions: () => void;
};

export const useInstallPrompt = (): InstallPromptState => {
  const [canInstall, setCanInstall] = useState<boolean>(() => getInstallPrompt() !== null);
  const [installed, setInstalled] = useState<boolean>(() => isRunningInstalled());
  const [needsManualInstructions, setNeedsManualInstructions] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => {
      setCanInstall(getInstallPrompt() !== null);
      setInstalled(isRunningInstalled());
    };
    window.addEventListener('installpromptchange', sync);
    window.addEventListener('appinstalled', sync);
    // The event may have fired between the first render and now
    sync();
    return () => {
      window.removeEventListener('installpromptchange', sync);
      window.removeEventListener('appinstalled', sync);
    };
  }, []);

  const promptToInstall = useCallback(async () => {
    const prompt = getInstallPrompt();
    if (!prompt) {
      // iOS Safari never fires the event, and Chrome may not have offered one
      setNeedsManualInstructions(true);
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      clearInstallPrompt();
      setCanInstall(false);
      setInstalled(true);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // A failed write just means the banner returns next session
    }
  }, []);

  return {
    showBanner: canInstall && !installed && !dismissed,
    promptToInstall,
    dismissBanner,
    needsManualInstructions,
    clearManualInstructions: useCallback(() => setNeedsManualInstructions(false), []),
  };
};
