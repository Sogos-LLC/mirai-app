# Mobile Responsive Architecture

The Mirai app uses **device detection** (not viewport width) to determine mobile vs desktop layouts. This ensures desktop browsers never switch to mobile UI when resized.

## Device Detection

Located in `frontend/src/hooks/useBreakpoint.ts`:

```typescript
const { isMobile, isDesktop, deviceType } = useBreakpoint();
const isMobile = useIsMobile();
```

**Detection signals:**
- User Agent patterns (iPhone, iPad, Android)
- Pointer type (`pointer: coarse` vs `pointer: fine`)
- Hover capability (`hover: hover`)

**Result is cached** - device type won't change during a session.

## Mobile Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BottomTabNav` | `components/layout/` | Fixed bottom navigation (5 tabs) |
| `BottomSheet` | `components/ui/` | Swipe-to-dismiss modal pattern |
| `ResponsiveModal` | `components/ui/` | Desktop modal → BottomSheet on mobile |
| `Drawer` | `components/ui/` | Slide-in navigation panel |

## Layout Behavior

| Element | Desktop | Mobile |
|---------|---------|--------|
| Sidebar | Fixed, collapsible | Hidden drawer (hamburger menu) |
| Navigation | Sidebar links | Bottom tab bar |
| Modals | Centered overlay | Bottom sheet |
| Settings | Side tabs + content | Menu list → content view |

## Usage Pattern

```tsx
import { useIsMobile } from '@/hooks/useBreakpoint';

function MyComponent() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

## CSS Classes

Mobile-specific styles use `.device-mobile` class (applied via JS) instead of media queries:

```css
/* Controlled by device detection, not viewport */
.sidebar.device-mobile {
  transform: translateX(-100%);
}
.sidebar.device-mobile.mobile-open {
  transform: translateX(0);
}
```

## Touch Targets

All interactive elements have minimum 44x44px touch targets per Apple HIG guidelines.
