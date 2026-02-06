# Task: Reinstate Changes and Fix Search Overlay

## Status
Completed

## Objective
The user requested to reinstate previous changes (improved feed layout, settings, etc.) that had been reverted, but with a critical fix for the search overlay bug. The bug caused the search overlay to appear fullscreen on desktop instead of as a panel, which was traced to a custom `3xl` breakpoint conflict.

## Changes Reinstated & Fixed

### 1. Improved Feed Layout (FeedSection.tsx)
- Split the monolithic `FeedSection` into 3 independent, exportable components: `Top10Section`, `NewReleasesSection`, and `RecentlyPlayedSection`.
- Implemented `RecentlyPlayedSection` as a vertical list (reusing `HomeListItem`) to replace the old horizontal scrolling component.
- **Fix**: Added data fetching logic (`jellyfinClient.getRecentlyPlayed`) directly to `RecentlyPlayedSection` since the independent component it replaced is deleted.

### 2. Responsive Home Page (HomePage.tsx)
- Restored the adaptive grid layout.
- Logic:
    - Mobile (<768px): Stacked (1 column)
    - Medium-Large (768px - 1679px): 2 columns
    - Ultra-wide (>=1680px): 3 columns
- **Fix**: Replaced usage of the custom `3xl` breakpoint with standard Tailwind arbitrary value `min-[1680px]`. This isolates the layout logic and prevents conflicts with the Search Overlay's media queries.

### 3. Settings Improvements (settingsStore.ts, SettingsPage.tsx)
- Replaced the single `showFeed` toggle with 3 granular toggles:
    - `showTop10`
    - `showNewReleases`
    - `showRecentlyPlayed`
- Updated `SettingsPage` to expose these new controls.

### 4. Search UI (SearchBar.tsx)
- Reverted the Search Bar to the cleaner **icon-only button** trigger.
- Removed the `SearchInput` component from the header entirely.

### 5. Layout Adjustments (RecentlyAdded.tsx)
- Restored the adaptive grid for recently added albums.
- **Fix**: Used `min-[1680px]` instead of `3xl` to switch between 8 items (4 cols) and 10 items (5 cols).

### 6. Clean Up
- Deleted `src/components/home/RecentlyPlayed.tsx` (superseded/unused).
- Ensured `tailwind.config.js` is clean of the problematic `3xl` breakpoint.
- Verified build success (`npm run build`).

## Technical Notes
- The custom `3xl` breakpoint in `tailwind.config.js` was causing `SearchOverlay.tsx`'s arbitrary media query `[@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]` to behave unexpectedly or conflict, leading to the mobile fullscreen layout persisting on desktop. By using `min-[1680px]` directly in class names, we avoid modifying the global screen configuration, ensuring standard breakpoints (`lg`, `xl`) work as intended for the Search Overlay.
