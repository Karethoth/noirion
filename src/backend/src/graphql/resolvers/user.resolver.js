import { UsersService } from '../../services/users.js';

const userResolvers = {
  Query: {
    user: async (parent, args, context) => {
      const usersService = new UsersService(context.dbPool);
      return await usersService.getUserById(args.id);
    },
    users: async (parent, args, context) => {
      // In a real app, we'd fetch all users
      return [];
    }
  },

  Mutation: {
    login: async (parent, args, context) => {
      const usersService = new UsersService(context.dbPool);
      return await usersService.login(args.username, args.password);
    },
    createUser: async (parent, args, context) => {
      const usersService = new UsersService(context.dbPool);
      const userData = {
        username: args.username,
        email: args.email,
        password: args.password
      };
      return await usersService.createUser(userData);
    },
    updateUser: async (parent, args, context) => {
      // In a real app, we'd update user by id
      return null;
    },
    deleteUser: async (parent, args, context) => {
      // In a real app, we'd delete user by id
      return false;
    }
  }
};

export default userResolvers;
