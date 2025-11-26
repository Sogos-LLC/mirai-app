'use client';

import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface BreakpointState {
  /** True when device is a mobile phone */
  isMobile: boolean;
  /** True when device is a tablet */
  isTablet: boolean;
  /** True when device is a desktop/laptop */
  isDesktop: boolean;
  /** Current device type */
  deviceType: DeviceType;
}

/**
 * Detects actual device type using multiple signals:
 * - Touch capability (maxTouchPoints)
 * - Pointer precision (coarse = touch, fine = mouse)
 * - Hover capability
 * - User agent patterns
 *
 * This ensures desktop browsers don't switch to mobile layout when resized.
 */
function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') {
    return 'desktop'; // SSR default
  }

  const ua = navigator.userAgent;

  // Check for mobile user agents
  const isMobileUA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|webOS/i.test(ua);
  const isTabletUA = /iPad|Android(?!.*Mobile)|tablet/i.test(ua);

  // Check pointer type via matchMedia
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;

  // Desktop with touch screen (like Surface) should stay desktop
  // Key indicator: has fine pointer (mouse) AND can hover
  if (hasFinePointer && canHover && !isMobileUA && !isTabletUA) {
    return 'desktop';
  }

  // Mobile phone detection - UA is primary, touch is secondary
  if (isMobileUA) {
    return 'mobile';
  }

  // Tablet detection
  if (isTabletUA) {
    return 'tablet';
  }

  // Touch-only device without UA match (rare edge case)
  if (hasCoarsePointer && !hasFinePointer) {
    // Check screen size to differentiate phone vs tablet
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const minDimension = Math.min(screenWidth, screenHeight);

    // Phones typically have min dimension under 600px
    if (minDimension < 600) {
      return 'mobile';
    }
    return 'tablet';
  }

  // Default to desktop
  return 'desktop';
}

// Cache the device type since it won't change during session
let cachedDeviceType: DeviceType | null = null;

function getDeviceType(): DeviceType {
  if (cachedDeviceType === null) {
    cachedDeviceType = detectDeviceType();
  }
  return cachedDeviceType;
}

/**
 * Hook to detect actual device type (not viewport width)
 * Desktop browsers will always return desktop, even when window is resized.
 *
 * @example
 * const { isMobile, isDesktop, deviceType } = useBreakpoint();
 *
 * return isMobile ? <MobileNav /> : <DesktopSidebar />;
 */
export function useBreakpoint(): BreakpointState {
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');

  useEffect(() => {
    // Detect device type on mount (client-side only)
    setDeviceType(getDeviceType());
    // No resize listener needed - device type doesn't change
  }, []);

  return {
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    deviceType,
  };
}

/**
 * Simple hook to check if actual device is a mobile phone
 * Returns false for desktop browsers even when window is resized small
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(getDeviceType() === 'mobile');
  }, []);

  return isMobile;
}

/**
 * Simple hook to check if actual device is a desktop/laptop
 * Returns true for desktop browsers even when window is resized small
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    setIsDesktop(getDeviceType() === 'desktop');
  }, []);

  return isDesktop;
}

/**
 * Hook to check if device is touch-primary (phone or tablet)
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const deviceType = getDeviceType();
    setIsTouch(deviceType === 'mobile' || deviceType === 'tablet');
  }, []);

  return isTouch;
}

export default useBreakpoint;
