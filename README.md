# Noirion

[![Tests](https://github.com/Karethoth/noirion/actions/workflows/test.yml/badge.svg)](https://github.com/Karethoth/noirion/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://www.postgresql.org/)
[![PostGIS](https://img.shields.io/badge/PostGIS-3.3-blue.svg)](https://postgis.net/)

> **🤖 AI-Assisted Development**  
> This project uses AI assistance as a testing ground to explore development workflows.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Running with Docker Compose

1. Clone the repository:
```bash
git clone https://github.com/Karethoth/noirion.git
cd noirion
```

2. Start all services:
```bash
docker-compose up
```

3. Access the application:
   - **Frontend**: http://localhost:2000
   - **Backend API**: http://localhost:4000/graphql
   - **Health Check**: http://localhost:4000/health

### Default User Accounts

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| admin | password | admin | Full access (read, write, admin) |
| investigator | password | investigator | Read and write access |
| analyst | password | analyst | Read-only access |

## Database Management

### Running Migrations

Migrations are automatically run when the backend starts. To manually run migrations:

```bash
cd src/backend
node scripts/run-migrations.js
```

### Reset Database and Re-run Migrations

If you need to start fresh with a clean database:

1. **Drop and recreate the schema:**
```bash
docker exec -it noirion-db-1 psql -U noirion -d noirion -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO noirion; GRANT ALL ON SCHEMA public TO public;"
```

2. **Run migrations:**
```bash
cd src/backend
node scripts/run-migrations.js
```

3. **Restart the backend:**
```bash
docker-compose restart backend
```

### Database Connection

The database is accessible at:
- **Host**: localhost
- **Port**: 5432
- **Database**: noirion
- **User**: noirion
- **Password**: secret (default)

Connect using psql:
```bash
docker exec -it noirion-db-1 psql -U noirion -d noirion
```

## Development

### Backend Development

```bash
cd src/backend
npm install
npm run dev
```

See [Backend README](src/backend/README.md) for more details.

### Frontend Development

```bash
cd src/frontend
npm install
npm run dev
```

See [Frontend README](src/frontend/README.md) for more details, including environment variable configuration.

### Running Tests

```bash
# Backend tests
cd src/backend
npm test

# Frontend tests
cd src/frontend
npm test
```

## Authentication

The application uses JWT-based authentication. See [AUTHENTICATION.md](AUTHENTICATION.md) for detailed documentation on:
- Login flow and token management
- Role-based permissions
- Protected resources
- Security considerations
- Testing authorization

## Project Structure

```
noirion/
├── src/
│   ├── backend/          # Node.js GraphQL API
│   │   ├── src/
│   │   │   ├── db/       # Database migrations and connection
│   │   │   ├── graphql/  # GraphQL resolvers and schemas
│   │   │   ├── models/   # Data models
│   │   │   ├── services/ # Business logic
│   │   │   └── utils/    # Utilities (auth, logging, etc.)
│   │   └── scripts/      # Migration and utility scripts
│   └── frontend/         # React + Vite frontend
│       ├── src/
│       │   ├── components/  # React components
│       │   └── utils/       # Frontend utilities
│       └── .env.example     # Environment variables template
├── docker-compose.yml    # Docker services configuration
└── AUTHENTICATION.md     # Authentication documentation
```

## Technologies

### Backend
- **Node.js** - Runtime environment
- **Apollo Server** - GraphQL server
- **PostgreSQL + PostGIS** - Database with spatial extensions
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **sharp** - Image processing
- **exifr** - EXIF metadata extraction

### Frontend
- **React** - UI framework
- **Vite** - Build tool
- **Apollo Client** - GraphQL client
- **Leaflet** - Interactive maps
- **React Leaflet** - React bindings for Leaflet

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and contribution process.

## License

See [LICENSE](LICENSE) for license information.
