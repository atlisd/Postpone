# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Postpone** — a self-hosted family task manager. React 19 + TypeScript frontend, .NET 10 Web API backend, PostgreSQL 17, with SignalR for real-time sync.

## Commands

### Frontend (`client/`)
```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Production build
npm run lint         # ESLint
npm run test:e2e     # Playwright E2E tests
npm run test:e2e:ui  # Playwright with UI
```

### Backend (`src/Tasker.Api/`)
```bash
dotnet watch run                          # Hot-reload dev server
dotnet ef migrations add <Name>           # Create migration
```

### Full Stack (Docker)
```bash
docker compose up --build    # Entire stack (frontend, API, DB)
docker compose up db -d      # Just PostgreSQL for local dev
```

## Architecture

### Data Flow
1. Components call typed API functions in `client/src/api/`
2. `client/src/lib/client.ts` (ky-based) injects JWT, handles 401 with silent token refresh
3. Mutations trigger server-side SignalR broadcasts via `SyncService`
4. `useSignalR` hook receives events; components refetch their data (no client-side cache)

### Real-Time Sync
- SignalR hub at `/hubs/sync` — centralized connection in `client/src/lib/signalr.ts`
- Lazy start: first subscriber initiates; stops when last unsubscribes
- Auto-reconnect with backoff: [0, 1s, 2s, 5s, 10s, 30s]
- Events: `TaskCreated`, `TaskUpdated`, `TaskDeleted`, `ProjectUpdated`, etc.

### Auth
- JWT access tokens (15 min) + rotating refresh tokens (30 days, httpOnly cookie)
- `refreshPromise` deduplication prevents parallel refresh races
- Cross-tab sync via localStorage

### Access Control (Backend)
Three-level hierarchy enforced via `IProjectAccessService` before any operation:
1. **Ownership** — user always sees own projects
2. **Direct share** — `ProjectShares` table
3. **Household membership** — projects linked to a household visible to all members

### Recurring Tasks
- Virtual instance model: one master task in DB, occurrences computed on-the-fly from RRULE
- `RecurrenceException` table stores per-occurrence modifications (skip, complete, edit, reschedule)
- `ExceptionSubtaskCompletion` tracks per-occurrence subtask completion state
- Smart lists and calendar expand occurrences via `RecurrenceService.ExpandOccurrencesAsync`
- Dual-query pattern: non-recurring tasks via SQL + recurring masters expanded in-memory, then merged

### Background Jobs
- **NotificationSchedulerJob** — runs every 15 minutes, sends Pushover notifications for tasks due today and overdue tasks

### Key Directories
```
client/src/
  api/          # One file per resource (tasks.ts, projects.ts, etc.)
  components/   # Feature-organized React components
  contexts/     # AuthContext, ThemeContext
  hooks/        # useSignalR, per-feature query/mutation hooks
  lib/          # client.ts, signalr.ts, dates.ts, priorities.ts
  types/        # TypeScript interfaces matching API DTOs

src/Tasker.Api/
  Controllers/    # REST endpoints (authorize at controller level)
  Services/       # Business logic (AuthService, TokenService, SyncService, etc.)
  Models/Entities/# EF Core entity classes
  Data/           # DbContext + fluent configurations
  Hubs/           # SyncHub (SignalR)
  BackgroundJobs/ # Recurrence + notification jobs
  Middleware/     # ExceptionHandlingMiddleware
```

## Environment

Copy `.env.example` to `.env` for Docker. For local dev, the frontend Vite config proxies `/api` and `/hubs` to `localhost:5001`.

Ports: frontend `3000` (nginx) / `5173` (dev), API `5001`, PostgreSQL `5432`.

First run on empty DB triggers a setup page to create the admin user.
