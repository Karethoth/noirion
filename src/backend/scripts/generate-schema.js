import { writeFileSync } from 'fs';
import { typeDefs } from '../src/graphql/schemas/schema.js';

writeFileSync('./schema/schema.graphql', typeDefs);

console.log('✅ Schema generated successfully at schema/schema.graphql');
