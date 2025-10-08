# Noirion Frontend

React + Vite frontend for the Noirion image investigation platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Copy `.env.example` to `.env` and update the values:
```bash
cp .env.example .env
```

Required environment variables:
- `VITE_API_URL`: Backend API URL (default: `http://localhost:4000`)

## Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Environment Variables

- `VITE_API_URL`: Backend GraphQL API endpoint
  - Development: `http://localhost:4000`
  - Production: Set to your deployed backend URL

Note: Vite requires all environment variables to be prefixed with `VITE_` to be exposed to the client.
