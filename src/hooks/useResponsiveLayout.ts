/**
 * useResponsiveLayout Hook
 *
 * A comprehensive hook for responsive layout management in the Arithmatrix game.
 * Provides real-time information about screen size, device type, and orientation
 * to enable adaptive UI rendering and mobile optimizations.
 */

import { useState, useEffect } from 'react';
import { getScreenSize, isTouchDevice, isIOS, isAndroid } from '../utils/touchUtils';

export interface ResponsiveLayoutInfo {
  // Screen dimensions
  width: number;
  height: number;

  // Device categorization
  isSmallPhone: boolean;
  isLargePhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isMobile: boolean;

  // Orientation
  isLandscape: boolean;
  isPortrait: boolean;

  // Device capabilities
  isTouchDevice: boolean;
  isIOS: boolean;
  isAndroid: boolean;

  // Layout breakpoints
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  // Grid sizing recommendations
  recommendedCellSize: number;
  recommendedGridPadding: number;
  recommendedFontSize: string;

  // Touch target validation
  minTouchTargetSize: number;
}

export const useResponsiveLayout = (): ResponsiveLayoutInfo => {
  const [layoutInfo, setLayoutInfo] = useState<ResponsiveLayoutInfo>(() => calculateLayoutInfo());

  useEffect(() => {
    const handleResize = () => {
      setLayoutInfo(calculateLayoutInfo());
    };

    const handleOrientationChange = () => {
      // Delay to ensure dimensions are updated after orientation change
      setTimeout(() => {
        setLayoutInfo(calculateLayoutInfo());
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Also listen for visual viewport changes (mobile keyboard, etc.)
    if ('visualViewport' in window) {
      window.visualViewport?.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if ('visualViewport' in window) {
        window.visualViewport?.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  return layoutInfo;
};

function calculateLayoutInfo(): ResponsiveLayoutInfo {
  const screenSize = getScreenSize();
  const width = screenSize.width;
  const height = screenSize.height;

  // Device categorization
  const isSmallPhone = width <= 480;
  const isLargePhone = width > 480 && width <= 768;
  const isTablet = width > 768 && width <= 1024;
  const isDesktop = width > 1024;
  const isMobile = isSmallPhone || isLargePhone;

  // Orientation
  const isLandscape = width > height;
  const isPortrait = height >= width;

  // Device capabilities
  const touchDevice = isTouchDevice();
  const iosDevice = isIOS();
  const androidDevice = isAndroid();

  // Breakpoint determination
  let breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  if (width <= 480) breakpoint = 'xs';
  else if (width <= 768) breakpoint = 'sm';
  else if (width <= 1024) breakpoint = 'md';
  else if (width <= 1440) breakpoint = 'lg';
  else breakpoint = 'xl';

  // Calculate recommended sizing based on screen size and device type
  const { recommendedCellSize, recommendedGridPadding, recommendedFontSize } =
    calculateRecommendedSizing(width, height, isLandscape, touchDevice);

  // Touch target size (iOS: 44px, Android: 48px, Desktop: flexible)
  const minTouchTargetSize = iosDevice ? 44 : androidDevice ? 48 : touchDevice ? 44 : 32;

  return {
    width,
    height,
    isSmallPhone,
    isLargePhone,
    isTablet,
    isDesktop,
    isMobile,
    isLandscape,
    isPortrait,
    isTouchDevice: touchDevice,
    isIOS: iosDevice,
    isAndroid: androidDevice,
    breakpoint,
    recommendedCellSize,
    recommendedGridPadding,
    recommendedFontSize,
    minTouchTargetSize,
  };
}

function calculateRecommendedSizing(
  width: number,
  height: number,
  isLandscape: boolean,
  isTouchDevice: boolean
) {
  // Base calculations on available screen space
  const availableWidth = width - 32; // Account for page margins
  const availableHeight = height - 200; // Account for controls and header

  // Grid size considerations (typically 4x4 to 7x7)
  const maxGridSize = 7;
  const minCellSize = isTouchDevice ? 44 : 32; // Minimum touch target

  // Calculate cell size based on available space
  let recommendedCellSize: number;

  if (width <= 480) {
    // Small phones - prioritize usability
    recommendedCellSize = Math.max(
      Math.floor((availableWidth - (maxGridSize - 1) * 12) / maxGridSize),
      minCellSize
    );
  } else if (width <= 768) {
    // Large phones
    recommendedCellSize = Math.max(
      Math.floor((availableWidth - (maxGridSize - 1) * 15) / maxGridSize),
      minCellSize + 10
    );
  } else if (width <= 1024) {
    // Tablets
    recommendedCellSize = Math.max(
      Math.floor((availableWidth - (maxGridSize - 1) * 18) / maxGridSize),
      minCellSize + 20
    );
  } else {
    // Desktop
    recommendedCellSize = 80; // Standard desktop size
  }

  // Adjust for landscape mode on mobile
  if (isLandscape && width <= 768) {
    recommendedCellSize = Math.min(
      recommendedCellSize,
      Math.floor((availableHeight - (maxGridSize - 1) * 8) / maxGridSize)
    );
  }

  // Grid padding based on screen size
  const recommendedGridPadding = width <= 480 ? 8 : width <= 768 ? 12 : 16;

  // Font size for cell inputs
  const baseCellSize = recommendedCellSize;
  let recommendedFontSize: string;

  if (baseCellSize <= 50) {
    recommendedFontSize = '1.25rem';
  } else if (baseCellSize <= 65) {
    recommendedFontSize = '1.5rem';
  } else if (baseCellSize <= 75) {
    recommendedFontSize = '1.75rem';
  } else {
    recommendedFontSize = '2rem';
  }

  return {
    recommendedCellSize,
    recommendedGridPadding,
    recommendedFontSize,
  };
}

// Utility functions for common responsive queries
export const useIsMobile = (): boolean => {
  const { isMobile } = useResponsiveLayout();
  return isMobile;
};

export const useIsLandscape = (): boolean => {
  const { isLandscape } = useResponsiveLayout();
  return isLandscape;
};

export const useBreakpoint = (): ResponsiveLayoutInfo['breakpoint'] => {
  const { breakpoint } = useResponsiveLayout();
  return breakpoint;
};
