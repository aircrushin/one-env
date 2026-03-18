# oneenv

oneenv is a lightweight environment variable management center for individuals and small teams.

It provides:

- Project + environment structure
- Import / export `.env`
- Variable CRUD
- Global variables
- Search (key/value/description)
- Automatic version history + rollback

Storage defaults to Notion (single flat database schema). If Notion is not configured, oneenv runs with in-memory fallback for local development.

## Tech Stack

- TanStack Start + React + TypeScript
- TanStack Router file-based routes
- Tailwind CSS v4
- Notion API (optional in local dev)

## Quick Start

```bash
npm install
npm run dev
```

App runs on `http://localhost:3000`.

## Required Environment Variables

Create `.env` for server runtime:

```bash
ONEENV_ADMIN_PASSWORD_HASH=<sha256 hex of your admin password>
ONEENV_SESSION_SECRET=<long-random-secret>

# Optional but recommended for production:
NOTION_API_TOKEN=<notion integration token>
NOTION_DATABASE_ID=<notion database id>
```

Alternative for local quick testing:

```bash
ONEENV_ADMIN_PASSWORD=<plain-text-password>
```

If both `ONEENV_ADMIN_PASSWORD_HASH` and `ONEENV_ADMIN_PASSWORD` are set, hash takes precedence.

## Admin Password Hash Example

```bash
node -e "console.log(require('crypto').createHash('sha256').update('your-password').digest('hex'))"
```

## Scripts

```bash
npm run dev
npm run build
npm run test
```

## API Surface (MVP)

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET /api/v1/status`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `PATCH /api/v1/projects/:projectId`
- `GET /api/v1/projects/:projectId/environments`
- `POST /api/v1/projects/:projectId/environments`
- `GET /api/v1/variables`
- `POST /api/v1/variables`
- `PATCH /api/v1/variables/:id`
- `DELETE /api/v1/variables/:id`
- `POST /api/v1/env/import`
- `GET /api/v1/env/export`
- `GET /api/v1/search`
- `GET /api/v1/versions`
- `POST /api/v1/versions/:versionEventId/rollback`

## Notes

- Export precedence is fixed: environment variables override global variables with the same key.
- Every create/update/delete/import/rollback writes a version event.
- Current implementation stores values as plain text in Notion (accepted MVP tradeoff).
