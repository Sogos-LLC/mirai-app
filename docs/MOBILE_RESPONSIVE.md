# Mobile Responsive Architecture

Device-type detection (not viewport width) determines mobile vs desktop layouts.

## Device Detection

**File**: `frontend/src/hooks/useBreakpoint.ts`

### Hooks

```typescript
useBreakpoint()      // { isMobile, isTablet, isDesktop, deviceType }
useIsMobile()        // boolean - true only on actual mobile devices
useIsDesktop()       // boolean - true on desktop (even if window small)
useIsTouchDevice()   // boolean - true for mobile/tablet
useMediaQuery(query) // raw CSS media query support
```

### Detection Signals

| Signal | Detection Method |
|--------|------------------|
| User Agent | iPhone, iPad, Android, webOS, etc. |
| Pointer Type | `pointer: coarse` (touch) vs `pointer: fine` (mouse) |
| Hover Capability | `hover: hover` vs `hover: none` |
| Touch Points | `maxTouchPoints > 0` |
| Screen Dimensions | Width/height analysis |

**Result is cached** - device type won't change during a session.

### Key Behavior

Desktop browsers **never** switch to mobile layout when resized. Only actual mobile devices get mobile UI.

## Layout Architecture

### Desktop

```
┌─────────────────────────────────────────────────────────┐
│ ┌───────────┐ ┌─────────────────────────────────────┐  │
│ │           │ │ Header                              │  │
│ │  Sidebar  │ ├─────────────────────────────────────┤  │
│ │  (256px   │ │                                     │  │
│ │   or      │ │ Content                             │  │
│ │   80px)   │ │                                     │  │
│ │           │ │                                     │  │
│ └───────────┘ └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Mobile

```
┌──────────────────────────┐
│ Mobile Header (hamburger)│
├──────────────────────────┤
│                          │
│ Content                  │
│                          │
│                          │
├──────────────────────────┤
│ Bottom Tab Navigation    │
└──────────────────────────┘
```

## Mobile Components

### BottomTabNav

**File**: `frontend/src/components/layout/BottomTabNav.tsx`

- Only renders on mobile devices
- Fixed at bottom (64px height)
- 5 navigation items: Home, Library, Create (FAB), Templates, More
- Safe area padding for home indicator

### BottomSheet

**File**: `frontend/src/components/ui/BottomSheet.tsx`

- Slides up from bottom
- Swipe-to-dismiss (100px threshold)
- Drag handle indicator
- Heights: auto, half (50vh), full

### ResponsiveModal

**File**: `frontend/src/components/ui/ResponsiveModal.tsx`

- Desktop: Centered modal dialog
- Mobile: Bottom sheet
- Props: `size` for desktop, `mobileHeight` for mobile
- Escape key (desktop), swipe-to-dismiss (mobile)

### Drawer

**File**: `frontend/src/components/ui/Drawer.tsx`

- Sides: left (default) or right
- Width: 280px default
- Swipe gesture support (80px threshold)
- Escape key to close

## Layout Components

### Sidebar

**File**: `frontend/src/components/layout/Sidebar.tsx`

| State | Desktop | Mobile |
|-------|---------|--------|
| Default | Fixed sidebar | Hidden |
| Expanded | 256px width | Drawer (280px) |
| Collapsed | 80px width | N/A |

### PageLayout

**File**: `frontend/src/components/layout/PageLayout.tsx`

```typescript
// Mobile: no sidebar margin, bottom nav padding
// Desktop: sidebar margin (md:ml-64 or md:ml-20)
className={`
  ${isMobile ? '' : sidebarOpen ? 'md:ml-64' : 'md:ml-20'}
  ${isMobile ? 'pb-20' : ''}
`}
```

## CSS Variables

**File**: `frontend/src/app/globals.css`

```css
:root {
  --sidebar-width-expanded: 256px;
  --sidebar-width-collapsed: 80px;
  --sidebar-transition-speed: 0.3s;
  --header-height: 64px;
  --bottom-nav-height: 64px;
  --drawer-width: 280px;
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
}
```

## Safe Area Support

iOS notch and home indicator support:

```css
.safe-area-top {
  padding-top: var(--safe-area-top);
}
.safe-area-bottom {
  padding-bottom: var(--safe-area-bottom);
}
```

Applied to:
- Mobile header (top)
- Bottom tab navigation (bottom)
- Drawers

## Touch Targets

All interactive elements meet 44x44px minimum (Apple HIG):

```css
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
```

## Animations

**File**: `frontend/src/app/globals.css`

| Animation | Duration | Use |
|-----------|----------|-----|
| slideInFromLeft | 0.3s | Drawer open |
| slideOutToLeft | 0.2s | Drawer close |
| slideInFromBottom | 0.3s | Bottom sheet open |
| slideOutToBottom | 0.2s | Bottom sheet close |
| backdropFadeIn | 0.2s | Overlay show |

## State Management

**File**: `frontend/src/store/zustand/index.ts`

```typescript
// Separate state for desktop and mobile
sidebarOpen: boolean;        // Desktop sidebar
mobileSidebarOpen: boolean;  // Mobile drawer

// Actions
toggleSidebar()
toggleMobileSidebar()
closeMobileSidebar()
openMobileSidebar()
```

## Tailwind Patterns

### Responsive Grid

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

### Flex Direction

```html
<div class="flex flex-col sm:flex-row">
```

### Spacing Progression

```html
<div class="p-4 md:p-6 lg:p-8">
<div class="gap-4 md:gap-6 lg:gap-8">
```

### Text Scaling

```html
<h1 class="text-3xl sm:text-4xl lg:text-5xl">
```

## Usage Example

```tsx
import { useIsMobile } from '@/hooks/useBreakpoint';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

function MyComponent() {
  const isMobile = useIsMobile();

  return (
    <ResponsiveModal
      isOpen={open}
      onClose={close}
      title="Settings"
      size="lg"              // Desktop: large modal
      mobileHeight="full"    // Mobile: full-height sheet
    >
      {isMobile ? <MobileContent /> : <DesktopContent />}
    </ResponsiveModal>
  );
}
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useBreakpoint.ts` | Device detection hooks |
| `frontend/src/components/layout/BottomTabNav.tsx` | Mobile navigation |
| `frontend/src/components/layout/Sidebar.tsx` | Responsive sidebar |
| `frontend/src/components/layout/PageLayout.tsx` | Main layout wrapper |
| `frontend/src/components/ui/ResponsiveModal.tsx` | Modal/sheet adapter |
| `frontend/src/components/ui/BottomSheet.tsx` | Mobile sheet |
| `frontend/src/components/ui/Drawer.tsx` | Slide-in panel |
| `frontend/src/app/globals.css` | CSS variables, animations |
| `frontend/src/store/zustand/index.ts` | Layout state |
