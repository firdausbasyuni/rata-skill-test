# Healthcare Scheduling System

A GraphQL-based healthcare scheduling system built with NestJS, PostgreSQL, Prisma ORM, and Docker. The application follows a microservices architecture with separate Authentication and Scheduling services.

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

## Architecture

The application consists of two independent NestJS services and one PostgreSQL instance.

### Architecture Diagram

```mermaid
flowchart TB
    Client["GraphQL Client"]

    subgraph Docker["Docker Compose"]
        Auth["Auth Service<br/>NestJS · Port 3001"]
        Schedule["Schedule Service<br/>NestJS · Port 3002"]
        DB[("PostgreSQL 16")]

        AuthDB[("auth_db")]
        ScheduleDB[("schedule_db")]

        Auth --> AuthDB
        Schedule --> ScheduleDB

        AuthDB --- DB
        ScheduleDB --- DB
    end

    Client -->|"Register / Login"| Auth
    Client -->|"Authenticated GraphQL requests"| Schedule
    Schedule -->|"validateToken"| Auth
```

### Service Responsibilities

| Component        |        Port | Responsibility                            |
| ---------------- | ----------: | ----------------------------------------- |
| Auth Service     |        3001 | Registration, login, JWT validation       |
| Schedule Service |        3002 | Customer, doctor, and schedule management |
| PostgreSQL       | 5433 (host) | Persistent database storage               |

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

## Technology Stack

- **Backend:** NestJS, TypeScript
- **API:** GraphQL, Apollo Server
- **Database:** PostgreSQL 16
- **ORM:** Prisma 6
- **Authentication:** JWT, bcrypt
- **Validation:** class-validator
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
│   │   ├── prisma/
│   │   └── ...
│   ├── Dockerfile
│   └── .dockerignore
│
├── schedule-service/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── auth/
│   │   ├── audit/
│   │   ├── customers/
│   │   ├── doctors/
│   │   ├── schedules/
│   │   ├── prisma/
│   │   └── ...
│   ├── Dockerfile
│   └── .dockerignore
│
├── docker/
│   └── postgres/
│       └── init/
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

For Docker deployment, only the root `.env` is required. Docker Compose provides the database connection strings and service URLs internally.

For local development, configure the individual service environment files as shown below.

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

The application endpoints are:

- Auth Service: http://localhost:3001/graphql
- Schedule Service: http://localhost:3002/graphql

Stop the application:

```bash
docker compose down
```

To remove the PostgreSQL data volume as well:

```bash
docker compose down -v
```

**Warning:** Removing the volume permanently deletes the databases and their data.

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

Auth Service:

```bash
cd auth-service

npm test
npm run test:cov
```

Schedule Service:

```bash
cd schedule-service

npm test
npm run test:cov
```

Build both services:

```bash
cd auth-service
npm run build

cd ../schedule-service
npm run build
```

The project includes unit tests for authentication, schedule management, validation, booking conflicts, soft deletion, and audit logging.

### Test Coverage

The latest reported coverage results are:

| Service          | Statements | Branches | Functions |  Lines |
| ---------------- | ---------: | -------: | --------: | -----: |
| Auth Service     |     92.45% |   85.00% |    83.33% | 92.45% |
| Schedule Service |     88.88% |   83.82% |    86.66% | 88.88% |

Both services exceed the assignment's minimum 50% unit test coverage requirement.

## License

This project was developed as part of the RATA.id Skill Test.
