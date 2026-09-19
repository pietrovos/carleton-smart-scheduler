# Carleton Smart Scheduler

Smart Scheduler was built for a Carleton engineering capstone project. It reads
an academic audit, checks course prerequisites, and generates schedules from
locally loaded course and section data. The application has a React/Vite client,
an Express API, a PostgreSQL database managed through Prisma, and command-line
tools for importing data.

The project handles the main audit-import, course-selection, schedule-generation,
and administration flows. It has not been deployed, and it should be treated as
a course project rather than a production advising service.

Raw academic audits and reports containing student information are excluded from
this portfolio repository. The original course repository remains private.

## Team and contributions

Group G67 consisted of Anas Ayoubi, Hakeem Khan, Pietro Adamvoski, and Safiullah
Rattar.

Pietro worked primarily on the PostgreSQL and Prisma data model, including the
tree representation used for prerequisite rules. He also contributed to the
prerequisite evaluator, project integration, and documentation.

## Requirements

- Node.js 18 or newer
- PostgreSQL
- `pdftotext` from Poppler for PDF imports

HTML audit imports do not require `pdftotext`.

## Setup

Install the API and client dependencies:

```bash
npm install
npm --prefix Carletonscheduler install
```

Set the database connection, JWT secret, and browser origin. These values can be
kept in an ignored `.env` file and loaded into the shell before starting the
application.

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

Create the schema and load the course and timetable data:

```bash
npm run db:setup
npm run db:seed
```

Create a user account. Set `USER_ROLE=ADMIN` only for someone who needs access
to the administration routes.

```bash
USER_EMAIL="student@example.com" \
USER_PASSWORD="a-long-unique-password" \
USER_NAME="Student" \
USER_ROLE="STUDENT" \
npm run user:create
```

Start the API and client together:

```bash
npm run dev
```

The client runs at `http://localhost:3002`, and the API runs at
`http://localhost:3001`.

## Checks

```bash
npm run test:unit
npm run server:build
npm --prefix Carletonscheduler run build
npm run validate:data
```

The unit tests focus on prerequisite evaluation and password hashing. API,
parser, and browser-level integration coverage is still limited.

To run the schedule-generation benchmark against the configured database and
seeded section data:

```bash
npm run benchmark:schedules
```

## Current limits

Audit parsing depends on the layout of Carleton's exported HTML and PDF files.
HTML gives more reliable results because PDF extraction can lose layout
information. The parser processes uploaded audits in memory, and the application
does not retain the raw files. An administrator can store the resulting student
and course-completion records in PostgreSQL.

Users are stored in the database with scrypt password hashes. The API uses JWTs
for authenticated requests and checks the administrator role on restricted
routes. Registration, password reset, token revocation, and rate limiting have
not been implemented.

Course prerequisites and timetable sections are snapshots and will become stale.
The frontend API address is configured for local development in
`Carletonscheduler/src/config/constants.ts`. Database setup currently uses
`prisma db push` instead of versioned migrations.

## Data sources

Course descriptions and prerequisite rules came from Carleton University course
pages. Timetable data must be supplied locally in the format used by `Sched.csv`.
This project is not affiliated with or endorsed by Carleton University.
