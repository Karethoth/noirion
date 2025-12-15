# GraphQL Schema

This directory contains the versioned GraphQL schema for the Noirion API.

## Files

- `schema.graphql` - The canonical GraphQL schema definition (generated)

## Usage

### Generate Schema
```bash
npm run schema:generate
```

This reads the schema from `src/graphql/schemas/schema.js` and outputs it here.

### Schema Validation

The schema is automatically validated on pull requests. If you modify the GraphQL schema:

1. Make your changes to `src/graphql/schemas/schema.js`
2. Run `npm run schema:generate` to update the schema file
3. Commit both files together

The CI will fail if the schema file is out of sync with the source.

## Why?

Versioning the schema file provides:
- **Change tracking**: See exactly how the API evolves over time
- **Breaking change detection**: Catch breaking changes before they reach production
- **Documentation**: Serves as a single source of truth for the API
- **Client generation**: Can be used to generate typed clients
