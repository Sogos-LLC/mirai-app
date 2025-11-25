# Prefetch and Redux Toolkit Architecture

This document explains how prefetching and Redux Toolkit work together in the Mirai web application to provide instant page navigation and eliminate loading states.

## Table of Contents
- [Overview](#overview)
- [Redux Toolkit Implementation](#redux-toolkit-implementation)
- [Prefetch Strategy](#prefetch-strategy)
- [Component Integration](#component-integration)
- [Performance Benefits](#performance-benefits)
- [Implementation Details](#implementation-details)

## Overview

The application uses a combination of **Redux Toolkit** for state management and **hover-based prefetching** to create a seamless navigation experience. When users hover over navigation items, the app preemptively loads both Next.js routes and API data into Redux state, eliminating loading spinners and providing instant page rendering.

### Key Concepts

1. **Redux Toolkit**: Centralized state management with async thunks for API operations
2. **Prefetching**: Loading data before it's needed (on hover, not on click)
3. **State Flags**: `foldersLoaded` and `coursesLoaded` track what's been prefetched
4. **Instant Rendering**: Components check Redux state first before fetching

## Redux Toolkit Implementation

### Store Configuration

The Redux store is configured in `frontend/src/store/index.ts`:

```typescript
export const store = configureStore({
  reducer: {
    course: courseReducer,
    ui: uiReducer,
    aiGeneration: aiGenerationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['course/saveCourse/fulfilled', 'course/loadCourse/fulfilled'],
      },
    }).concat(persistenceMiddleware),
  preloadedState,
});
```

### Course Slice State Structure

Located in `frontend/src/store/slices/courseSlice.ts`:

```typescript
interface CourseState {
  currentCourse: Partial<Course>;
  courses: Course[];              // Cached course list
  folders: any[];                 // Cached folder tree
  currentStep: number;
  isGenerating: boolean;
  generatedContent: any;
  courseBlocks: CourseBlock[];
  activeBlockId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  foldersLoaded: boolean;         // Flag: folders have been prefetched
  coursesLoaded: boolean;         // Flag: courses have been prefetched
}
```

### Async Thunks for Data Operations

#### Regular Data Loading
```typescript
// Load courses (used when NOT prefetched)
export const loadCourseLibrary = createAsyncThunk(
  'course/loadLibrary',
  async (filters?: { status?: string; folder?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.folder) params.append('folder', filters.folder);

    const response = await fetch(`/api/courses?${params}`);
    if (!response.ok) throw new Error('Failed to load courses');
    const result = await response.json();
    return result.data;
  }
);
```

#### Prefetch Thunks
```typescript
// Prefetch folders for content library
export const prefetchFolders = createAsyncThunk(
  'course/prefetchFolders',
  async (includeCourseCount: boolean = true) => {
    const response = await fetch(`/api/folders?includeCourseCount=${includeCourseCount}`);
    if (!response.ok) throw new Error('Failed to prefetch folders');
    const result = await response.json();
    return result.data;
  }
);

// Prefetch courses for dashboard and content library
export const prefetchCourses = createAsyncThunk(
  'course/prefetchCourses',
  async () => {
    const response = await fetch('/api/courses');
    if (!response.ok) throw new Error('Failed to prefetch courses');
    const result = await response.json();
    return result.data;
  }
);
```

### Reducer Handlers for Prefetch

The reducers handle prefetch responses and set flags:

```typescript
extraReducers: (builder) => {
  // Prefetch folders
  builder
    .addCase(prefetchFolders.fulfilled, (state, action) => {
      state.folders = action.payload || [];
      state.foldersLoaded = true;  // Mark as loaded
    })
    .addCase(prefetchFolders.rejected, (state) => {
      state.foldersLoaded = false;  // Silent fail for prefetch
    });

  // Prefetch courses
  builder
    .addCase(prefetchCourses.fulfilled, (state, action) => {
      if (!state.coursesLoaded) {
        state.courses = action.payload || [];
        state.coursesLoaded = true;  // Mark as loaded
      }
    })
    .addCase(prefetchCourses.rejected, () => {
      // Silent fail for prefetch (no error state set)
    });
}
```

**Key Design Decisions:**
- Prefetch failures are silent (don't show errors to user)
- State flags prevent duplicate API calls
- Data is only written if not already loaded

## Prefetch Strategy

### Sidebar Navigation Component

The prefetch logic lives in `frontend/src/components/layout/Sidebar.tsx`:

```typescript
// Track which paths have already been prefetched
const prefetchedPaths = useRef<Set<string>>(new Set());

// Prefetch handler for aggressive hover prefetching
const handlePrefetch = (path: string) => {
  // Skip if already prefetched
  if (prefetchedPaths.current.has(path)) {
    return;
  }

  // Mark as prefetched
  prefetchedPaths.current.add(path);

  // 1. Prefetch Next.js route (code-splitting bundles)
  router.prefetch(path);

  // 2. Prefetch API data based on the route
  switch (path) {
    case '/dashboard':
      // Dashboard needs courses list
      dispatch(prefetchCourses());
      break;
    case '/content-library':
      // Content library needs folders and courses
      dispatch(prefetchFolders(true));
      dispatch(prefetchCourses());
      break;
    // Templates, Tutorials, Settings, Help, Updates are static pages
    // They only need Next.js route prefetch (no API data)
    default:
      // Just prefetch the Next.js route (already done above)
      break;
  }
};
```

### Applying Prefetch to Navigation Items

```typescript
<Link
  href="/dashboard"
  className="sidebar-header cursor-pointer"
  prefetch={true}  // Next.js automatic prefetch
  onMouseEnter={() => handlePrefetch('/dashboard')}  // Custom API prefetch
>
  <span className="sidebar-brand">Mirai</span>
</Link>
```

**Two-Layer Prefetching:**
1. **Next.js Router**: Prefetches JavaScript bundles for the route
2. **Redux Dispatch**: Prefetches API data needed by the page

## Component Integration

### Dashboard Page

Located at `frontend/src/app/(main)/dashboard/page.tsx`:

```typescript
export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { courses, isLoading, coursesLoaded } = useSelector((state: RootState) => state.course);

  // Load courses on mount (only if not already prefetched)
  useEffect(() => {
    // If courses are already loaded from prefetch, skip
    if (coursesLoaded && courses.length > 0) {
      console.log('Using prefetched courses from Redux - no fetch needed');
      return;
    }

    dispatch(loadCourseLibrary());
  }, [dispatch, coursesLoaded, courses.length]);

  // ... component logic

  // Show loading ONLY when actually loading AND not prefetched
  return (
    {(isLoading && !coursesLoaded) ? (
      <div>Loading courses...</div>
    ) : (
      <div>{/* Render courses */}</div>
    )}
  );
}
```

**Key Pattern:**
1. Check Redux state flags on mount (`coursesLoaded`)
2. Skip API call if data is already in Redux
3. Only show loading when `isLoading && !coursesLoaded`

### Content Library Page

Located at `frontend/src/app/(main)/content-library/page.tsx`:

```typescript
export default function ContentLibrary() {
  const reduxFolders = useSelector((state: RootState) => state.course.folders);
  const reduxCourses = useSelector((state: RootState) => state.course.courses);
  const foldersLoaded = useSelector((state: RootState) => state.course.foldersLoaded);
  const coursesLoaded = useSelector((state: RootState) => state.course.coursesLoaded);

  // Initialize state with Redux data if available (for instant rendering)
  const [folders, setFolders] = useState<FolderNode[]>(
    foldersLoaded ? reduxFolders : []
  );
  const [courses, setCourses] = useState<Course[]>(
    coursesLoaded ? reduxCourses as any : []
  );

  // Only show loading if data is NOT already loaded
  const [loading, setLoading] = useState(!foldersLoaded || !coursesLoaded);

  useEffect(() => {
    // If both are already loaded from prefetch, skip entirely
    if (foldersLoaded && coursesLoaded && reduxFolders.length > 0 && reduxCourses.length > 0) {
      console.log('Using prefetched data - no fetch needed');
      return;
    }

    const loadData = async () => {
      let needsLoading = false;

      // Fetch folders if not prefetched
      if (!foldersLoaded || reduxFolders.length === 0) {
        needsLoading = true;
        // ... fetch folders
      }

      // Fetch courses if not prefetched
      if (!coursesLoaded || reduxCourses.length === 0) {
        needsLoading = true;
        // ... fetch courses
      }

      if (needsLoading) {
        setLoading(false);
      }
    };

    loadData();
  }, [foldersLoaded, reduxFolders, coursesLoaded, reduxCourses]);
}
```

**Instant Rendering Strategy:**
1. Initialize component state from Redux immediately
2. Set `loading=false` if data already exists
3. Skip `useEffect` fetch if flags indicate prefetched data
4. No loading spinner shown when navigating after hover

## Performance Benefits

### Before Prefetch Implementation
```
User Action:              Hover    Click         Page Load        API Call        Render
Timeline:                 [  0s  ] [  0s  ]      [  50ms  ]      [  200ms  ]     [  250ms  ]
User Experience:                    ↓             ↓ loading...     ↓ loading...    ✓ Content
```

### After Prefetch Implementation
```
User Action:              Hover                   Click           Page Load        Render
Timeline:                 [  0s  ]                [  1s  ]        [  1050ms  ]     [  1050ms  ]
Prefetch:                 ↓ API call (200ms)
User Experience:          (background loading)     ↓               ✓ Instant content!
```

### Measured Improvements

Based on the commit messages:

1. **Eliminated Loading State Flash**: No more "Loading courses..." or "Loading folders..." messages
2. **Instant Page Rendering**: Content appears immediately after navigation
3. **Improved Perceived Performance**: Users see content ~250ms faster
4. **Better UX**: Seamless transitions between pages

## Implementation Details

### Commit History Analysis

#### Commit 1a83884: Add prefetching for all navigation items
- Added hover-based prefetching to all navigation links
- Dashboard prefetches courses on hover
- Content Library prefetches both folders and courses
- Static pages only prefetch Next.js routes

#### Commit e81be89: Eliminate loading delay in Content Library
- Initialize component state from Redux on mount
- Skip `useEffect` if data already prefetched
- Set `loading=false` immediately if data exists
- Result: Content Library renders instantly

#### Commit 8c0a71e: Eliminate loading delay in Dashboard
- Check `coursesLoaded` flag before fetching
- Skip `loadCourseLibrary()` if already prefetched
- Only show loading when `isLoading && !coursesLoaded`
- Result: Dashboard renders instantly

### Best Practices Demonstrated

1. **State Flags**: Use boolean flags (`coursesLoaded`, `foldersLoaded`) to track what's cached
2. **Silent Failures**: Prefetch errors don't show to users (graceful degradation)
3. **Deduplication**: `useRef` prevents multiple prefetch calls for same route
4. **Conditional Loading**: Initialize state from Redux for instant rendering
5. **Smart Loading States**: Only show spinner when actually loading AND not prefetched

### RTK Query vs Manual Thunks

This app uses **manual async thunks** instead of RTK Query. Here's why:

**Current Approach (Async Thunks):**
- ✅ Full control over cache logic
- ✅ Custom prefetch flags (`coursesLoaded`)
- ✅ Easy integration with existing Redux patterns
- ❌ More boilerplate code
- ❌ Manual cache invalidation

**RTK Query Alternative:**
- ✅ Built-in caching and invalidation
- ✅ Automatic refetching
- ✅ Less boilerplate
- ❌ Less control over prefetch behavior
- ❌ Would require refactoring existing code

For this application, manual thunks provide the fine-grained control needed for the prefetch pattern.

## Related Concepts

### Next.js Router Prefetch

```typescript
router.prefetch(path);
```

- Preloads JavaScript bundles for code-split routes
- Separate from API data prefetching
- Both are needed for instant page loads

### Redux DevTools Integration

You can observe prefetch actions in Redux DevTools:

1. Hover over navigation item
2. See `course/prefetchCourses/pending` action
3. See `course/prefetchCourses/fulfilled` action
4. Inspect state: `coursesLoaded: true`, `courses: [...]`
5. Navigate to page
6. No additional `loadCourseLibrary` action fires

### Local Storage Persistence

The app uses `persistenceMiddleware` to save Redux state:

```typescript
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['course/saveCourse/fulfilled', 'course/loadCourse/fulfilled'],
    },
  }).concat(persistenceMiddleware),
```

This persists prefetched data across page refreshes!

## Future Enhancements

### Possible Improvements

1. **Stale-While-Revalidate**: Show cached data immediately, fetch fresh data in background
2. **Time-Based Invalidation**: Auto-refetch if data is older than X minutes
3. **Optimistic Updates**: Update UI before API confirms changes
4. **RTK Query Migration**: Automatic cache management and invalidation
5. **Prefetch on Focus**: Prefetch when user focuses on input near a link

### Example: Time-Based Invalidation

```typescript
export const prefetchCourses = createAsyncThunk(
  'course/prefetchCourses',
  async (_, { getState }) => {
    const state = getState() as RootState;
    const lastFetch = state.course.coursesLastFetchedAt;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    // Only fetch if data is stale
    if (lastFetch && lastFetch > fiveMinutesAgo) {
      return state.course.courses; // Return cached data
    }

    const response = await fetch('/api/courses');
    const result = await response.json();
    return result.data;
  }
);
```

## Summary

The Mirai application combines Redux Toolkit's powerful state management with strategic hover-based prefetching to create a near-instant navigation experience. By loading data before it's needed and storing it in a centralized Redux store, the app eliminates loading spinners and provides a seamless user experience.

**Key Takeaways:**
- Redux Toolkit manages global state with async thunks
- Hover prefetching loads data before navigation
- State flags prevent duplicate API calls
- Components check Redux before fetching
- Result: Instant page rendering with no loading delays
