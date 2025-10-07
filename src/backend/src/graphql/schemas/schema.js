export const typeDefs = `#graphql
  type Query {
    hello: String
    health: String
    user(id: Int!): User
    users: [User!]!
  }
  
  type Mutation {
    createUser(username: String!, email: String!, password: String!): User
    updateUser(id: Int!, username: String, email: String): User
    deleteUser(id: Int!): Boolean
  }
  
  type User {
    id: Int
    username: String
    email: String
    created_at: String
  }
`;