# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commonly Used Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 2025 with Turbopack |
| `npm run build` | Build the application for production with Turbopack |
| `npm run start` | Start the production server |
| `npm run format` | Format code with Prettier |
| `npm run svg` | Generate SVG components index using custom script |

## High-Level Architecture
This is a Next.js 16 blog application with the following structure:

### Core Directories
- **src/app/**: Next.js app directory router structure
  - **(home)/**: Homepage components and logic
  - **blog/**: Blog article pages and API endpoints
  - **write/**: Blog writing and editing interface
  - **share/**: Sharing functionality
  - **api/**: API endpoints, including custom comment system
  - **svg/**: SVG components

- **src/components/**: Reusable React components
- **src/hooks/**: Custom React hooks
- **src/lib/**: Utility functions and business logic
- **src/layout/**: Layout components and backgrounds

### Key Features
- **Markdown Blog System**: Articles are written in Markdown and rendered with custom markdown rendering
- **Comment System**: Local JSON-based comment system implemented in `src/lib/comments.ts` and `/api/comments/` endpoints
- **GitHub App Integration**: For content management (details in README.md)
- **Interactive Components**: Includes LiquidGrass background animation, motion effects

### Tech Stack
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- motion (animation)
- Shiki (code highlighting)
- Zustand (state management)
- SWR (data fetching)

## Important Files
- `src/app/blog/[id]/page.tsx`: Article detail page
- `src/components/blog-preview.tsx`: Article rendering component
- `src/lib/comments.ts`: Comment system core logic
- `src/hooks/use-markdown-render.ts`: Custom hook for rendering markdown
- `README.md`: Detailed setup and usage instructions

## Notes
- The project uses GitHub App for content management, see README.md for setup details
- Environment variables are defined in `src/consts.ts`
- SVG components are generated via the `npm run svg` command
