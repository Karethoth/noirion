const typeDefs = `#graphql
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

const resolvers = {
  Query: {
    hello: () => 'world',
    health: async () => 'Service is healthy',
    user: async (parent, args, context) => {
      // In a real app, we'd use the service here
      return null;
    },
    users: async (parent, args, context) => {
      // In a real app, we'd use the service here
      return [];
    }
  },
  
  Mutation: {
    createUser: async (parent, args, context) => {
      // In a real app, we'd use the service here
      return null;
    },
    updateUser: async (parent, args, context) => {
      // In a real app, we'd use the service here
      return null;
    },
    deleteUser: async (parent, args, context) => {
      // In a real app, we'd use the service here
      return false;
    }
  }
};

module.exports = { typeDefs, resolvers };
