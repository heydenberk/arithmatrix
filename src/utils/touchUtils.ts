/**
 * Touch Detection and Gesture Utilities for Mobile Optimization
 *
 * This module provides utilities for:
 * - Detecting touch capabilities
 * - Handling touch events
 * - Recognizing gestures (tap, long-press, swipe)
 * - Providing haptic feedback where supported
 */

// Touch capability detection
export const isTouchDevice = (): boolean => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
};

export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

export const isAndroid = (): boolean => {
  return /Android/.test(navigator.userAgent);
};

// Haptic feedback utilities
export const triggerHapticFeedback = (type: 'light' | 'medium' | 'heavy' = 'light'): void => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
    };
    navigator.vibrate(patterns[type]);
  }

  // iOS specific haptic feedback
  if (isIOS() && 'hapticFeedback' in navigator) {
    // @ts-ignore - iOS haptic feedback API
    navigator.hapticFeedback?.impact?.(type);
  }
};

// Touch gesture recognition
export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface GestureOptions {
  longPressDelay?: number;
  tapThreshold?: number;
  swipeThreshold?: number;
}

export class TouchGestureRecognizer {
  private startPoint: TouchPoint | null = null;
  private options: Required<GestureOptions>;
  private longPressTimer: number | null = null;
  private isLongPressed = false;

  constructor(options: GestureOptions = {}) {
    this.options = {
      longPressDelay: 500,
      tapThreshold: 10,
      swipeThreshold: 50,
      ...options,
    };
  }

  onTouchStart = (event: TouchEvent, callback?: (point: TouchPoint) => void): void => {
    const touch = event.touches[0];
    this.startPoint = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now(),
    };
    this.isLongPressed = false;

    // Set up long press detection
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPressed = true;
      this.onLongPress?.(this.startPoint!);
    }, this.options.longPressDelay);

    callback?.(this.startPoint);
  };

  onTouchEnd = (
    event: TouchEvent,
    callbacks?: {
      onTap?: (point: TouchPoint) => void;
      onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', distance: number) => void;
    }
  ): void => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (!this.startPoint) return;

    const touch = event.changedTouches[0];
    const endPoint: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now(),
    };

    const deltaX = endPoint.x - this.startPoint.x;
    const deltaY = endPoint.y - this.startPoint.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Check for tap (short press with minimal movement)
    if (!this.isLongPressed && distance < this.options.tapThreshold) {
      callbacks?.onTap?.(endPoint);
      triggerHapticFeedback('light');
    }
    // Check for swipe
    else if (distance > this.options.swipeThreshold) {
      const direction = this.getSwipeDirection(deltaX, deltaY);
      callbacks?.onSwipe?.(direction, distance);
      triggerHapticFeedback('medium');
    }

    this.startPoint = null;
  };

  onTouchMove = (event: TouchEvent): void => {
    // Cancel long press if the finger moves too much
    if (this.startPoint && this.longPressTimer) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.startPoint.x;
      const deltaY = touch.clientY - this.startPoint.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > this.options.tapThreshold) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  };

  onLongPress?: (point: TouchPoint) => void;

  private getSwipeDirection(deltaX: number, deltaY: number): 'up' | 'down' | 'left' | 'right' {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }

  cleanup(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}

// Touch event utilities
export const addTouchEventListeners = (
  element: HTMLElement,
  handlers: {
    onTouchStart?: (event: TouchEvent) => void;
    onTouchMove?: (event: TouchEvent) => void;
    onTouchEnd?: (event: TouchEvent) => void;
  }
): (() => void) => {
  const { onTouchStart, onTouchMove, onTouchEnd } = handlers;

  if (onTouchStart) {
    element.addEventListener('touchstart', onTouchStart, { passive: false });
  }
  if (onTouchMove) {
    element.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  if (onTouchEnd) {
    element.addEventListener('touchend', onTouchEnd, { passive: false });
  }

  // Return cleanup function
  return () => {
    if (onTouchStart) {
      element.removeEventListener('touchstart', onTouchStart);
    }
    if (onTouchMove) {
      element.removeEventListener('touchmove', onTouchMove);
    }
    if (onTouchEnd) {
      element.removeEventListener('touchend', onTouchEnd);
    }
  };
};

// Screen size utilities
export const getScreenSize = () => {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    isSmallPhone: window.innerWidth <= 480,
    isLargePhone: window.innerWidth > 480 && window.innerWidth <= 768,
    isTablet: window.innerWidth > 768 && window.innerWidth <= 1024,
    isLandscape: window.innerWidth > window.innerHeight,
  };
};

// Touch target size validation
export const validateTouchTargetSize = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const minSize = 44; // iOS/Android recommended minimum
  return rect.width >= minSize && rect.height >= minSize;
};
