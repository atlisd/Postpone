# CLAUDE.md

**Postpone** — self-hosted family task manager. React 19 + TypeScript + Vite 8, .NET 10 Web API, PostgreSQL 17, SignalR real-time sync.

## Commands

### Frontend (`client/`)
```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Production build
npm run lint         # ESLint
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

### Playwright Tests

**Always run Playwright tests yourself using the Playwright MCP server — do not ask the user to run them.**

Use the `mcp__playwright__*` tools to navigate, interact, and verify behavior directly in the browser. The dev server must be running at `http://localhost:5173` before running tests. Run tests proactively after making UI changes to verify correctness before reporting back. Test files live in `client/e2e/`, shared setup in `client/e2e/fixtures.ts`.

## Key Conventions

- **No React Query** — components use direct `async/await` with `useState`/`useCallback` for data fetching. Manual `loading` state. Do NOT introduce React Query or SWR.
- **No component library** — all UI built with Tailwind CSS v4 utility classes. No shadcn, MUI, or Radix. Icons from `lucide-react`, toasts from `sonner`.
- **SignalR refetch pattern** — after mutations, backend calls `SyncService` which broadcasts to SignalR groups (`project:{id}`, `user:{id}`). Frontend calls `useSignalR(fetchData)` to auto-refetch. No optimistic updates, no client-side cache.
- **Access control** — every data endpoint must check `IProjectAccessService.CanAccessProjectAsync()` or `CanEditProjectAsync()` before returning/modifying data. Three tiers: owner → direct share → household member.
- **Soft delete** — tasks use `IsDeleted` flag. Always filter `!t.IsDeleted` in queries.
- **Recurring tasks** — dual-query pattern: non-recurring via SQL + recurring masters expanded in-memory via `RecurrenceService.ExpandOccurrencesAsync`, then merged. Virtual instances carry `occurrenceDate`.
- **Dark mode** — always include `dark:` Tailwind variants alongside light classes.
- **Localization** — 9 locales (en, is, da, sv, nb, de, fr, es, pl). Use `useLocale()` for date formatting with date-fns.

## Adding a Backend Endpoint

1. **DTOs** — add request/response `record` types in `Models/Dtos/{Feature}/{Feature}Dtos.cs`
2. **Validator** — add `AbstractValidator<T>` in `Validators/{Feature}Validators.cs` (auto-discovered by FluentValidation)
3. **Entity** (if new) — create in `Models/Entities/`, add `DbSet` to `Data/TaskerDbContext.cs`, add `IEntityTypeConfiguration` in `Data/Configurations/`
4. **Migration** (if schema changed) — `dotnet ef migrations add {Name} --project src/Tasker.Api`
5. **Controller** — `[ApiController] [Authorize]` with primary constructor DI: `(TaskerDbContext db, IProjectAccessService access, ISyncService sync)`. Use `User.GetUserId()` extension for current user.
6. **Sync** — after mutations, call `sync.TaskUpdated(projectId, response)` or appropriate method to broadcast via SignalR
7. **Service** (if complex logic) — interface `I{Name}Service` + impl in `Services/`, register in `Extensions/ServiceCollectionExtensions.cs`

## Adding a Frontend Feature

1. **Types** — add interfaces to `types/api.ts`
2. **API function** — add to existing file in `api/` or create new one. Pattern: `export async function getThing(): Promise<T> { return api.get('api/...').json<T>(); }` using ky client from `lib/client.ts`
3. **Component** — in `components/{feature}/`. Use `useState` + `useCallback` for fetch, call `useSignalR(fetchData)` for real-time sync. Use `toast.error()`/`toast.success()` from sonner.
4. **Route** (if new page) — add in `App.tsx` inside `<Route path="/app">`, wrap with `<ErrorBoundary>`. Add sidebar link in `components/layout/AppShell.tsx`.
5. **Forms** — React Hook Form + Zod: `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })`

## Key Directories
```
client/src/
  api/             # One file per resource, uses ky client
  components/      # Feature-organized (auth/, calendar/, tasks/, shared/, layout/, etc.)
  contexts/        # AuthContext, ThemeContext, LocaleContext
  hooks/           # useSignalR
  lib/             # client.ts (ky + JWT), signalr.ts, dates.ts, naturalDate.ts
  types/api.ts     # Single file with all API interfaces

src/Tasker.Api/
  Controllers/     # REST endpoints, [Authorize] at controller level
  Models/Dtos/     # Record types in feature subfolders (Tasks/, Auth/, Projects/, etc.)
  Models/Entities/ # EF Core entity classes
  Data/            # TaskerDbContext + Configurations/ (IEntityTypeConfiguration per entity)
  Services/        # Interface + impl pairs (Auth, Token, ProjectAccess, Recurrence, Sync, Pushover)
  Validators/      # FluentValidation, auto-discovered
  Hubs/            # SyncHub (SignalR)
  BackgroundJobs/  # NotificationSchedulerJob (Pushover notifications)
  Extensions/      # ServiceCollectionExtensions (DI registration)
```

## Documentation & Maintenance

Keep `README.md` up to date with any applicable changes:
- New features → add to the Features section
- New or changed API endpoints → update the API Endpoints tables
- New environment variables → add to the Environment Variables table

**Keep this CLAUDE.md current** — when adding new patterns, conventions, or architectural decisions that future work should follow, update the relevant section. If a recipe step changes (e.g., new DI pattern, new state management), update the recipe.

## Environment

Copy `.env.example` to `.env` for Docker. For local dev, the Vite config proxies `/api` and `/hubs` to `localhost:5001`.

Ports: frontend `3000` (nginx) / `5173` (dev), API `5001`, PostgreSQL `5432`. First run on empty DB triggers a setup page to create the admin user.
