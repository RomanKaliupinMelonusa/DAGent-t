# Frontend Architecture — Sample App

## Overview

The frontend is a Next.js 15 static export (`next export`) deployed to Azure Static Web Apps. It uses dual-mode authentication (demo + Entra ID) and runtime Zod schema validation for all API responses.

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `page.tsx` | Home / landing page |
| `/about` | `about/page.tsx` | About page |
| `/tasks` | `tasks/page.tsx` | Interactive Kanban task board |

## Kanban Task Board (`/tasks`)

The task board is a `"use client"` page with three columns:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   To Do      │  │ In Progress  │  │    Done      │
│              │  │              │  │              │
│ [New Task]   │  │              │  │              │
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │
│ │ Task     │ │  │ │ Task     │ │  │ │ Task     │ │
│ │ [Start]  │ │  │ │ [Done]   │ │  │ │ [Reopen] │ │
│ └──────────┘ │  │ │ [Back]   │ │  │ └──────────┘ │
│              │  │ └──────────┘ │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `TasksPage` | Main page — state management, API calls, layout |
| `KanbanColumn` | Column container with header and task list |
| `TaskCard` | Individual task with status transition buttons |

### Status Transitions

| Current Status | Action | Target Status |
|----------------|--------|---------------|
| TODO | "Start" | IN_PROGRESS |
| IN_PROGRESS | "Done" | DONE |
| IN_PROGRESS | "Back to To Do" | TODO |
| DONE | "Reopen" | TODO |

### Optimistic UI

Status transitions update local state immediately. If the API call fails, the state reverts to the previous snapshot. This provides instant visual feedback while maintaining data consistency.

### Data Flow

1. On mount: `apiFetch<Task[]>("/tasks", {}, z.array(TaskSchema))` loads all tasks
2. Create: POST to `/tasks` → append to local state
3. Move: PATCH to `/tasks/{id}/status` → optimistic local update → server confirmation or rollback

## Navigation

The `NavBar` component provides navigation links. The "Task Board" link was added after "About":

| Link | Route | Label |
|------|-------|-------|
| Home | `/` | Branded logo |
| About | `/about` | About |
| Task Board | `/tasks` | Task Board |

## Test Coverage

| Suite | File | Tests |
|-------|------|-------|
| apiClient | `src/lib/__tests__/apiClient.test.ts` | 9 |
| DemoLoginForm | `src/components/__tests__/DemoLoginForm.test.tsx` | 5 |
| TasksPage | `src/app/tasks/__tests__/page.test.tsx` | 32 |

**Total: 46 unit tests passing.**

## Design Tokens

The task board uses the existing design token system defined in `globals.css`:

- `bg-surface-card` — card backgrounds
- `border-border` — card/column borders
- `text-text-primary` / `text-text-muted` — text hierarchy
- `bg-primary` — primary action buttons
- Column headers use semantic color overlays (blue for To Do, amber for In Progress, green for Done)
