import { writeFileSync } from 'fs';
import { typeDefs } from '../src/graphql/schemas/index.js';

writeFileSync('./schema/schema.graphql', typeDefs);

console.log('✅ Schema generated successfully at schema/schema.graphql');
