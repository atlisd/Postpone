# Postpone

A self-hosted general purpose task manager. Built with .NET 10, React 19, and PostgreSQL.

Postpone lets family members manage their own private task lists while selectively sharing projects with their household. Each user gets their own account (created by an admin), private projects by default, and the ability to collaborate through households with invite codes.

## Features

### Task Management
- **Projects** — organize tasks into color-coded projects, each with their own task list
- **Smart Lists** — Today, Tomorrow, Next 7 Days, All Tasks, Assigned to Me
- **Calendar View** — month grid with drag-and-drop to reschedule tasks
- **Subtasks/Checklists** — break tasks into smaller steps with reordering
- **Recurring Tasks** — daily, weekly, monthly, yearly, or custom RRULE patterns with lazy instance generation
- **Priority Levels** — none, low, medium, high with visual indicators
- **Tags** — per-user color-coded tags assignable to tasks
- **Due Dates** — with optional time, overdue highlighting
- **Task Assignment** — assign tasks to household members

### Collaboration
- **Households** — create a household and invite family members via an 8-character invite code
- **Shared Projects** — link a project to a household so all members can see and edit tasks
- **Private by Default** — personal projects stay private unless explicitly shared
- **Real-Time Sync** — changes sync instantly across devices via SignalR WebSockets
- **Project Sharing** — share individual private projects with specific users

### User Management
- **Admin-Created Accounts** — no public registration; the admin creates all users
- **JWT Authentication** — access tokens (15 min) + rotating refresh tokens (30 days) with theft detection
- **First-Run Setup** — on first launch, create your admin account directly in the browser

### Notifications
- **Pushover Integration** — receive push notifications for tasks due today (sent at 8-9 AM local time) and overdue tasks
- **Deduplication** — won't send the same notification twice

### Mobile & PWA
- **Mobile-First Design** — responsive layout with hamburger sidebar and full-screen modals on mobile
- **PWA Ready** — installable as a home screen app with offline caching via service worker

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | .NET 10 Web API, Entity Framework Core, Npgsql |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Database | PostgreSQL 17 |
| Real-Time | SignalR |
| Auth | JWT (access + refresh tokens), BCrypt |
| Notifications | Pushover API |
| Logging | Serilog |
| Validation | FluentValidation |
| Recurrence | iCal.NET (RRULE parsing) |
| Drag & Drop | @dnd-kit/react |
| HTTP Client | ky |
| Deployment | Docker Compose, nginx |

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Or for local development: .NET 10 SDK, Node.js 22+, PostgreSQL 17

### Quick Start with Docker

```bash
# Clone the repository
git clone <repo-url> && cd Postpone

# Configure environment
cp .env.example .env
# Edit .env and set secure values for DB_PASSWORD and JWT_SECRET

# Start the stack
docker compose up --build
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:5001
- **Health Check**: http://localhost:5001/health

### First-Run Setup

On first startup with an empty database, you'll be greeted with a setup page to create your admin account. After logging in, go to **Admin** in the sidebar to create accounts for family members.

### Local Development

**Backend:**

```bash
cd src/Tasker.Api

# Make sure PostgreSQL is running (or use Docker for just the DB)
docker compose up db -d

# Run the API with hot reload
dotnet watch run
```

The API starts at http://localhost:5001 with Swagger UI enabled in development mode.

**Frontend:**

```bash
cd client
npm install
npm run dev
```

The dev server starts at http://localhost:5173 with API requests proxied to http://localhost:5001.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | `changeme` |
| `JWT_SECRET` | JWT signing key (min 32 chars) | dev default |
| `PUSHOVER_API_TOKEN` | Pushover application API token | _(empty, notifications disabled)_ |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Browser    │────▶│   nginx     │────▶│  .NET API    │
│  React SPA   │◀────│  (port 80)  │◀────│  (port 8080) │
│             │     │             │     │              │
│  SignalR ◀──┼─────┼──WebSocket──┼─────┤  SyncHub     │
└─────────────┘     └─────────────┘     │              │
                                        │  EF Core ────┼──▶ PostgreSQL
                                        │              │
                                        │  Background  │
                                        │  Jobs:       │
                                        │  - Recurrence│
                                        │  - Notify    │──▶ Pushover API
                                        └──────────────┘
```

**Data access is controlled by three paths:**
1. **Ownership** — you always see your own projects
2. **Direct Share** — a project owner can share with specific users
3. **Household Membership** — projects linked to a household are visible to all members

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/setup-status` | Check if first-run setup is needed |
| POST | `/api/auth/setup` | Create initial admin account |
| POST | `/api/auth/login` | Login (rate limited) |
| POST | `/api/auth/refresh` | Refresh tokens (rate limited) |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/me` | Update profile (name, timezone) |
| PUT | `/api/auth/me/password` | Change password |
| PUT | `/api/auth/me/pushover` | Set Pushover user key |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| PUT | `/api/admin/users/{id}` | Update user |
| DELETE | `/api/admin/users/{id}` | Delete user |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List accessible projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/{id}` | Get project |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project |
| GET | `/api/projects/{id}/members` | List assignable members |
| POST | `/api/projects/{id}/share` | Share with user |
| DELETE | `/api/projects/{id}/share/{userId}` | Unshare |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/{id}/tasks` | List tasks in project |
| POST | `/api/projects/{id}/tasks` | Create task |
| GET | `/api/tasks/{id}` | Get task |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Soft delete task |
| POST | `/api/tasks/{id}/complete` | Mark complete |
| POST | `/api/tasks/{id}/uncomplete` | Mark incomplete |
| PUT | `/api/tasks/{id}/move` | Move to another project |
| PUT | `/api/tasks/{id}/due-date` | Update due date |
| PUT | `/api/tasks/{id}/recurrence` | Set recurrence rule |
| DELETE | `/api/tasks/{id}/recurrence` | Remove recurrence |

### Subtasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/{id}/subtasks` | List subtasks |
| POST | `/api/tasks/{id}/subtasks` | Create subtask |
| PUT | `/api/subtasks/{id}` | Update subtask |
| DELETE | `/api/subtasks/{id}` | Delete subtask |
| PUT | `/api/tasks/{id}/subtasks/reorder` | Reorder subtasks |

### Tags
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List user's tags |
| POST | `/api/tags` | Create tag |
| PUT | `/api/tags/{id}` | Update tag |
| DELETE | `/api/tags/{id}` | Delete tag |
| POST | `/api/tasks/{id}/tags` | Add tag to task |
| DELETE | `/api/tasks/{id}/tags/{tagId}` | Remove tag from task |

### Smart Lists
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/smart-lists/{type}` | Get smart list (today, tomorrow, next7days, all, assigned-to-me) |

### Calendar
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calendar?start=&end=` | Get tasks in date range |

### Households
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/households` | List my households |
| POST | `/api/households` | Create household |
| GET | `/api/households/{id}` | Get household details |
| PUT | `/api/households/{id}` | Update household name |
| DELETE | `/api/households/{id}` | Delete household |
| POST | `/api/households/join` | Join via invite code |
| POST | `/api/households/{id}/regenerate-invite` | Regenerate invite code |
| GET | `/api/households/{id}/members` | List members |
| DELETE | `/api/households/{id}/members/{userId}` | Remove/leave member |

### Infrastructure
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (DB connectivity) |

## Households & Sharing

1. **Create a household** from the Households page in the sidebar
2. **Share the invite code** with family members — they enter it on the same page to join
3. **Create shared projects** — when creating a new project, select a household from the dropdown to make it visible to all members
4. **Assign tasks** — in shared projects, open a task's detail panel to assign it to any household member

## Pushover Notifications

1. Create a Pushover application at [pushover.net](https://pushover.net) and copy the API token
2. Set `PUSHOVER_API_TOKEN` in your `.env` file
3. Each user enters their personal Pushover user key in **Settings > Notifications**
4. Notifications are sent for tasks due today (between 8-9 AM in the user's configured timezone) and overdue tasks

## Database

Postpone uses PostgreSQL 17 with EF Core migrations. Migrations run automatically on startup.

To create a new migration during development:

```bash
cd src/Tasker.Api
dotnet ef migrations add MigrationName
```

## License

This project is for personal/family use.
