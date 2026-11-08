# Healthcare Scheduling System

A GraphQL-based healthcare scheduling system built with NestJS, PostgreSQL, Prisma ORM, Redis, and Docker. The application follows a microservices architecture with separate Authentication, Scheduling, and Notification services.

## Features

### Authentication Service

- User registration and login.
- Password hashing using bcrypt.
- JWT-based authentication.
- Token validation for inter-service authentication.
- Normalized email addresses.
- Configurable JWT expiration.

### Schedule Service

- Customer management (CRUD).
- Doctor management (CRUD).
- Schedule management (CRUD).
- Schedule filtering by customer, doctor, and date range.
- Pagination using `skip` and `take`.
- JWT authentication through the Auth Service.
- Prevention of doctor double-booking.
- Soft deletion for customers, doctors, and schedules.
- Audit logging for create, update, and delete operations.
- Redis caching for schedule queries.
- Cache invalidation after schedule mutations.
- Asynchronous email notification jobs through Bull.

### Notification Service

- Asynchronous email processing using Bull.
- Redis-backed job queue.
- SMTP email delivery using Nodemailer.
- Configurable SMTP settings.
- Automatic job retries.
- Email notifications when appointments are created.
- Mailpit integration for local email testing.

## Architecture

The application consists of three independent NestJS services, two PostgreSQL databases, and supporting Redis and SMTP infrastructure.

### Architecture Diagram

```mermaid
flowchart TB
    Client["GraphQL Client"]

    subgraph Docker["Docker Compose"]
        Auth["Auth Service<br/>NestJS · Port 3001"]
        Schedule["Schedule Service<br/>NestJS · Port 3002"]
        Notification["Notification Service<br/>NestJS · Port 3003"]

        DB[("PostgreSQL 16")]
        AuthDB[("auth_db")]
        ScheduleDB[("schedule_db")]

        Redis[("Redis")]
        Mailpit["Mailpit<br/>SMTP · Port 1025"]

        Auth --> AuthDB
        Schedule --> ScheduleDB

        AuthDB --- DB
        ScheduleDB --- DB

        Schedule -->|"Enqueue email job"| Redis
        Redis -->|"Process email job"| Notification
        Notification -->|"SMTP"| Mailpit

        Schedule -->|"Cache schedule queries"| Redis
    end

    Client -->|"Register / Login"| Auth
    Client -->|"Authenticated GraphQL requests"| Schedule
    Schedule -->|"validateToken"| Auth
```

### Service Responsibilities

| Component            |        Port | Responsibility                            |
| -------------------- | ----------: | ----------------------------------------- |
| Auth Service         |        3001 | Registration, login, JWT validation       |
| Schedule Service     |        3002 | Customer, doctor, and schedule management |
| Notification Service |        3003 | Asynchronous email processing             |
| PostgreSQL           | 5433 (host) | Persistent database storage               |
| Redis                | 6380 (host) | Queue storage and schedule caching        |
| Mailpit SMTP         |        1025 | Local email delivery                      |
| Mailpit UI           |        8025 | Email inspection and testing              |

PostgreSQL contains two separate databases:

- `auth_db`: Authentication data.
- `schedule_db`: Customers, doctors, schedules, and audit logs.

The Schedule Service validates incoming JWTs by communicating with the Auth Service through its GraphQL API.

### Authentication Flow

1. The client registers or logs in through the Auth Service.
2. The Auth Service verifies credentials and returns a signed JWT.
3. The client sends the JWT using the `Authorization: Bearer <token>` header when accessing the Schedule Service.
4. The Schedule Service calls the Auth Service's `validateToken` operation.
5. The Auth Service verifies the token and retrieves the associated user.
6. If the token is valid, the request proceeds. Otherwise, the Schedule Service returns an authentication error.

### Email Notification Flow

1. A client creates a schedule through the Schedule Service.
2. The Schedule Service saves the schedule and its audit record.
3. The Schedule Service publishes an email notification job to the Bull queue.
4. Redis stores the queued job.
5. The Notification Service processes the job asynchronously.
6. Nodemailer sends the email through the configured SMTP server.
7. Mailpit receives the email in the local development environment.

Email processing is asynchronous, so the Schedule Service does not need to wait for email delivery before responding to the client.

### Redis Caching

The Schedule Service uses Redis to cache schedule query results.

- Schedule query results are cached for 30 seconds.
- Cache keys include the query filters, pagination parameters, and a cache version.
- Creating, updating, or deleting a schedule increments the cache version.
- Version-based invalidation prevents subsequent queries from using outdated cache entries.
- Cache failures are handled gracefully so that database operations can continue.

Cache invalidation is best-effort. If Redis is unavailable during a mutation, existing cache entries may remain until their TTL expires.

## Technology Stack

- **Backend:** NestJS, TypeScript
- **API:** GraphQL, Apollo Server
- **Database:** PostgreSQL 16
- **ORM:** Prisma 6
- **Authentication:** JWT, bcrypt
- **Validation:** class-validator
- **Queue:** Bull
- **Cache:** Redis, ioredis
- **Email:** Nodemailer, SMTP
- **Email Testing:** Mailpit
- **Containerization:** Docker, Docker Compose
- **Testing:** Vitest

## Project Structure

```text
healthcare-scheduling/
├── auth-service/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── auth/
│   │   └── prisma/
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── schedule-service/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── auth/
│   │   ├── audit/
│   │   ├── cache/
│   │   ├── customers/
│   │   ├── doctors/
│   │   ├── schedules/
│   │   └── prisma/
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── notification-service/
│   ├── src/
│   │   ├── notifications/
│   │   └── app.controller.ts
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── docker/
│   └── postgres/
│       └── init/
│           └── 01-create-databases.sql
│
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

## Prerequisites

For Docker deployment:

- Docker Desktop
- Docker Compose
- Git

For local development without Docker:

- Node.js 24
- npm
- PostgreSQL 16
- Redis 7
- SMTP server or Mailpit

## Environment Configuration

Copy the root environment example:

```bash
cp .env.example .env
```

Configure the root environment variables:

| Variable            | Description                 |
| ------------------- | --------------------------- |
| `POSTGRES_USER`     | PostgreSQL username         |
| `POSTGRES_PASSWORD` | PostgreSQL password         |
| `POSTGRES_PORT`     | PostgreSQL host port        |
| `JWT_SECRET`        | Secret used for JWT signing |
| `JWT_EXPIRES_IN`    | JWT expiration duration     |

Example root `.env`:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_me
POSTGRES_PORT=5433
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1h
```

### Service Environment Files

The project uses separate environment files depending on the execution mode.

- **Root `.env`** — Used by Docker Compose to configure PostgreSQL, JWT, and container settings.
- **`auth-service/.env`** — Used when running the Auth Service locally outside Docker.
- **`schedule-service/.env`** — Used when running the Schedule Service locally outside Docker.
- **`notification-service/.env`** — Used when running the Notification Service locally outside Docker.

For Docker deployment, only the root `.env` is required. Docker Compose provides the database connection strings, Redis host, SMTP host, and service URLs internally.

For local development, configure the individual service environment files.

Auth Service (`auth-service/.env`):

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5433/auth_db?schema=public"
JWT_SECRET="your_long_random_secret"
JWT_EXPIRES_IN="1h"
PORT=3001
```

Schedule Service (`schedule-service/.env`):

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5433/schedule_db?schema=public"
AUTH_SERVICE_URL="http://localhost:3001/graphql"
PORT=3002
REDIS_HOST=localhost
REDIS_PORT=6380
```

Notification Service (`notification-service/.env`):

```env
PORT=3003
REDIS_HOST=localhost
REDIS_PORT=6380
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Healthcare Scheduling <no-reply@healthcare.local>"
```

Supported JWT expiration formats include:

- `30s` — 30 seconds
- `15m` — 15 minutes
- `1h` — 1 hour
- `7d` — 7 days

Use strong, unique credentials in production. Never commit actual `.env` files or secrets to Git.

## Running with Docker Compose

Build and start all services:

```bash
docker compose up --build -d
```

Check container status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

View logs for a specific service:

```bash
docker compose logs -f auth-service
docker compose logs -f schedule-service
docker compose logs -f notification-service
```

The application endpoints are:

- Auth Service: http://localhost:3001/graphql
- Schedule Service: http://localhost:3002/graphql
- Notification Service health check: http://localhost:3003/health
- Mailpit UI: http://localhost:8025

Stop the application:

```bash
docker compose down
```

To remove the PostgreSQL and Redis data volumes as well:

```bash
docker compose down -v
```

**Warning:** Removing the volumes permanently deletes the databases, cached data, and queued jobs.

## Database Migrations

Database migrations are managed by Prisma.

Docker Compose runs migrations before starting the application services using `prisma migrate deploy`.

To create and apply migrations during local development:

```bash
# Auth Service
cd auth-service
npx prisma migrate dev

# Schedule Service
cd ../schedule-service
npx prisma migrate dev
```

For deployment environments, apply existing migrations using:

```bash
npx prisma migrate deploy
```

The Schedule Service includes a PostgreSQL partial unique index that prevents duplicate active bookings for the same doctor and scheduled time while allowing previously soft-deleted time slots to be reused.

## GraphQL API Examples

All GraphQL operations are available through the respective service endpoints.

### Authentication

Register:

```graphql
mutation {
  register(input: { email: "user@example.com", password: "Password123!" }) {
    accessToken
    tokenType
    expiresIn
    user {
      id
      email
    }
  }
}
```

Login:

```graphql
mutation {
  login(input: { email: "user@example.com", password: "Password123!" }) {
    accessToken
    tokenType
    expiresIn
    user {
      id
      email
    }
  }
}
```

### Authentication Header

Protected Schedule Service operations require a JWT.

Configure the GraphQL request header:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN"
}
```

### Create a Customer

```graphql
mutation {
  createCustomer(input: { name: "John Doe", email: "john@example.com" }) {
    id
    name
    email
  }
}
```

### Create a Doctor

```graphql
mutation {
  createDoctor(input: { name: "Dr. Sarah Johnson" }) {
    id
    name
  }
}
```

### Create a Schedule

```graphql
mutation {
  createSchedule(
    input: {
      objective: "General Health Consultation"
      customerId: "CUSTOMER_UUID"
      doctorId: "DOCTOR_UUID"
      scheduledAt: "2026-11-10T09:00:00.000Z"
    }
  ) {
    id
    objective
    scheduledAt
    customer {
      id
      name
    }
    doctor {
      id
      name
    }
  }
}
```

Creating a schedule also queues an asynchronous appointment confirmation email for the customer.

### List Schedules with Pagination and Filters

```graphql
query {
  schedules(
    skip: 0
    take: 10
    filters: {
      doctorId: "DOCTOR_UUID"
      from: "2026-11-10T00:00:00.000Z"
      to: "2026-11-10T23:59:59.999Z"
    }
  ) {
    items {
      id
      objective
      scheduledAt
      customer {
        id
        name
      }
      doctor {
        id
        name
      }
    }
    total
    skip
    take
  }
}
```

### Pagination

Schedule and audit log queries support offset-based pagination using `skip` and `take`.

| Parameter | Default | Constraint                         |
| --------- | ------: | ---------------------------------- |
| `skip`    |       0 | Must be greater than or equal to 0 |
| `take`    |      20 | Must be between 1 and 100          |

### Update a Schedule

```graphql
mutation {
  updateSchedule(
    id: "SCHEDULE_UUID"
    input: { objective: "Follow-up Consultation" }
  ) {
    id
    objective
    updatedAt
  }
}
```

### Delete a Schedule

```graphql
mutation {
  deleteSchedule(id: "SCHEDULE_UUID")
}
```

Deletion is implemented as a soft delete. Deleted records remain in the database and are excluded from active schedule queries.

### Audit Logs

The Schedule Service maintains audit records for create, update, and delete operations.

Available queries:

- `auditLogs`: Retrieve audit records with pagination.
- `auditLogsByEntity`: Retrieve audit records for a specific entity.
- `myAuditLogs`: Retrieve audit records created by the authenticated user.

Example:

```graphql
query {
  myAuditLogs(skip: 0, take: 20) {
    total
    items {
      id
      action
      entity
      entityId
      details
      createdAt
    }
  }
}
```

All audit log queries require JWT authentication.

## Business Rules

### Doctor Availability

A doctor cannot have two active schedules at exactly the same `scheduledAt` timestamp.

This rule is enforced at the PostgreSQL level through a partial unique index:

```sql
CREATE UNIQUE INDEX "schedules_doctor_scheduled_at_active_key"
ON "schedules" ("doctorId", "scheduledAt")
WHERE "deletedAt" IS NULL;
```

This database-level constraint also protects against concurrent booking requests.

The current implementation checks exact timestamp equality. It does not check overlapping appointment durations because schedules do not define an appointment end time or duration.

For example:

| Schedule      | Time  | Result   |
| ------------- | ----- | -------- |
| Appointment A | 09:00 | Allowed  |
| Appointment B | 09:00 | Rejected |
| Appointment C | 09:30 | Allowed  |

### Customer and Doctor Validation

Schedules can only be created or updated using active customers and doctors.

### Soft Deletion

Customers, doctors, and schedules use soft deletion through `deletedAt` and `deletedBy` fields.

Deleted records are excluded from normal queries but remain in the database for historical and audit purposes.

### Audit Logging

Create, update, and delete operations generate audit records containing:

- Authenticated user ID.
- Action performed.
- Entity type and entity ID.
- Relevant before/after values for update operations.
- Timestamp of the operation.

Audit records are written transactionally with the corresponding business operation.

## Error Handling

The GraphQL API exposes meaningful error codes, including:

| Code                  | Meaning                               |
| --------------------- | ------------------------------------- |
| `BAD_REQUEST`         | Invalid input                         |
| `UNAUTHORIZED`        | Missing, invalid, or expired JWT      |
| `FORBIDDEN`           | Insufficient permissions              |
| `NOT_FOUND`           | Requested resource not found          |
| `CONFLICT`            | Duplicate booking or conflicting data |
| `SERVICE_UNAVAILABLE` | Dependent service unavailable         |

## Testing

Run unit tests for each service.

### Auth Service

```bash
cd auth-service

npm run test -- --coverage
npm run build
```

### Schedule Service

```bash
cd schedule-service

npm run test -- --coverage
npm run build
```

### Notification Service

```bash
cd notification-service

npm run test -- --coverage
npm run build
```

The project includes unit tests for:

- Authentication and token validation.
- Customer, doctor, and schedule management.
- Input validation and booking conflicts.
- Soft deletion and audit logging.
- Redis caching and cache invalidation.
- Email job processing and SMTP configuration.
- Notification Service health checks.

### Test Coverage

The latest reported coverage results are:

| Service              | Statements | Branches | Functions |  Lines |
| -------------------- | ---------: | -------: | --------: | -----: |
| Auth Service         |     92.45% |   85.00% |    83.33% | 92.45% |
| Schedule Service     |     94.54% |   86.01% |    95.55% | 94.54% |
| Notification Service |       100% |   83.33% |      100% |   100% |

All three services exceed the assignment's minimum 50% unit test coverage requirement.

## License

This project was developed as part of the RATA.id Skill Test.
