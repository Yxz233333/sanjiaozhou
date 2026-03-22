# Delta Force Loot UI Generator

A React full-stack web app for creating loot overlay videos for Delta Force game content creators.

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Framer Motion
- **Backend:** Express (serves static files + minimal API)
- **Routing:** Wouter with hash routing (for GitHub Pages compatibility)
- **Deployment:** GitHub Pages at `sanjiaozhou.zmh.icu` via GitHub Actions

## Key Features

- **Home Page (`/`):** Animated loot card overlay preview. Select items from a grid, preview stacked animated overlay with configurable timing, scale, etc.
- **Video Export Page (`/video-export`):** Upload a video, mark timestamps, pick items or text overlays, export composited WebM video.
- **Custom Item Library:** Add custom items with compressed images (≤192px WebP). Delete defaults or custom items. Restore deleted defaults. Persisted in localStorage.
- **Language toggle:** Chinese (default) / English
- **JSON session export/import** with per-event overrides (scale, duration, font size)
- **Right-click context menus** on event list for per-event customization

## Important Files

- `client/src/pages/home.tsx` — main overlay preview page
- `client/src/pages/video-export.tsx` — video marking & export tool
- `client/src/lib/useItemLibrary.ts` — custom item library hook (localStorage: `item_library_custom_v1`, `item_library_deleted_v1`)
- `client/src/components/AddItemDialog.tsx` — dialog for adding custom items
- `client/src/data.json` — default item data (English/pinyin filenames)
- `client/public/images/items/` — static item images
- `.github/workflows/deploy.yml` — GitHub Pages deployment
- `client/public/CNAME` — custom domain config

## LocalStorage Keys

- `loot_marker_session_v1` — saved video export session (events + overrides)
- `item_library_custom_v1` — user-added custom items
- `item_library_deleted_v1` — IDs of deleted default items

## Rarity Colors

- Mythic: `#ef4444`, Legendary: `#f59e0b`, Epic: `#8b5cf6`, Rare: `#3b82f6`, Prismatic: rainbow gradient

## Canvas Card Drawing Notes

- `rightEdge = canvasW - CARD_X_OFFSET * itemScale`
- During expand: `cardX = rightEdge - CARD_W * cardScale`
- Height fixed at `H = CARD_H * itemScale` (no height change on expand)
- Images drawn in contain-mode to prevent distortion
- `cardLifetime` state in **milliseconds** (default 2000ms)
