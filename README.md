# Carleton Smart Scheduler

Carleton Smart Scheduler is a capstone project for importing an engineering academic audit, checking prerequisites, selecting courses, and generating conflict-free schedules from locally loaded course and section data. The repository contains a React/Vite client, an Express API, a PostgreSQL database accessed through Prisma, and command-line data tools.

## Status

The main import, course-selection, schedule-generation, and administration flows are implemented. This is a student project rather than a production service. It has not been deployed from this repository.

Raw student audits and PII-bearing project reports are intentionally excluded. The collaborator-owned course repository from which this portfolio copy was prepared retains separate private history and must not be published without a history cleanup and another privacy review.

## Team

This was Group G67's capstone project, developed by Anas Ayoubi, Hakeem Khan, Pietro Adamvoski, and Safiullah Rattar.

Pietro's primary work covered the PostgreSQL/Prisma data model and prerequisite representation and validation. He also contributed to project integration and documentation.

## Requirements

- Node.js 18 or newer
- PostgreSQL
- `pdftotext` from Poppler for PDF audit imports; HTML audit imports do not need it

## Setup

Install the API and client dependencies:

```bash
npm install
npm --prefix Carletonscheduler install
```

Set the runtime environment variables. One option is to keep them in the ignored `.env` file shown below and load that file into the shell before running application commands.

```env
DATABASE_URL="postgresql://user:password@localhost:5432/smart_scheduler?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
CLIENT_URL="http://localhost:3002"
```

```bash
set -a
. ./.env
set +a
```

Create the schema and seed the course and timetable data:

```bash
npm run db:setup
npm run db:seed
```

Create a login. Use `USER_ROLE=ADMIN` only for users who need the administration routes.

```bash
USER_EMAIL="student@example.com" \
USER_PASSWORD="a-long-unique-password" \
USER_NAME="Student" \
USER_ROLE="STUDENT" \
npm run user:create
```

Start both servers:

```bash
npm run dev
```

The client runs at `http://localhost:3002`; the API runs at `http://localhost:3001`.

## Checks

```bash
npm run test:unit
npm run server:build
npm --prefix Carletonscheduler run build
npm run validate:data
```

`npm run benchmark:schedules` runs the schedule-generation benchmark against the configured database and seeded section data.

## Limitations

- Audit parsing depends on Carleton's current exported HTML or PDF layout. PDF extraction is less reliable than HTML extraction.
- Imported audits contain personal academic data. The parse endpoint processes uploads in memory, while the admin-only upload endpoint stores derived student and completion records in PostgreSQL. Raw uploaded audit files are not retained by the application.
- Authentication uses database-backed users, scrypt password hashes, and JWTs. Account registration, password reset, token revocation, and rate limiting are not implemented.
- Course, prerequisite, and section data are snapshots and can become outdated.
- The frontend API URL is currently configured in `Carletonscheduler/src/config/constants.ts` for local development.
- Database changes use `prisma db push`; versioned migrations are not included.
- Automated coverage is focused on prerequisite evaluation. API, parser, and browser-level integration tests are limited.

## Data Sources

Course descriptions and prerequisite information were collected from Carleton University course pages. Timetable data must be supplied locally in the format expected by `Sched.csv`. This project is not affiliated with or endorsed by Carleton University.
