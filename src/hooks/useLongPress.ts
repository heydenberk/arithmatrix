/**
 * useLongPress Hook
 *
 * Gives a button a secondary action on press-and-hold while leaving its normal
 * tap or click intact.
 *
 * The tap action stays on the element's own `onClick` rather than being fired
 * from `pointerup`, so keyboard activation still works: a click with no
 * preceding pointerdown simply runs the tap action. When a long press has just
 * fired, the click that follows it is swallowed.
 */

import { useCallback, useEffect, useRef } from 'react';
import { triggerHapticFeedback } from '../utils/touchUtils';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick: () => void;
  /** How long to hold before the secondary action fires. */
  delay?: number;
}

export const useLongPress = ({ onLongPress, onClick, delay = 500 }: UseLongPressOptions) => {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Don't leave a timer running if the button unmounts mid-press
  useEffect(() => clearTimer, [clearTimer]);

  const handlePointerDown = useCallback(() => {
    firedRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      timerRef.current = null;
      // Confirms the hold registered, since the action itself is off-screen
      triggerHapticFeedback('medium');
      onLongPress();
    }, delay);
  }, [clearTimer, delay, onLongPress]);

  const handleClick = useCallback(() => {
    clearTimer();
    if (firedRef.current) {
      // Swallow the click that trails a completed long press
      firedRef.current = false;
      return;
    }
    onClick();
  }, [clearTimer, onClick]);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: clearTimer,
    onPointerLeave: clearTimer,
    onPointerCancel: clearTimer,
    // A held press otherwise raises the text-selection callout on touch
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClick: handleClick,
  };
};
