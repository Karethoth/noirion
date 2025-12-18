import { User } from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken } from '../utils/auth.js';

export class UsersService {
  constructor(dbPool) {
    this.userModel = new User(dbPool);
  }

  async createUser(userData) {
    try {
      const hashedPassword = await hashPassword(userData.password);

      const user = await this.userModel.create({
        ...userData,
        password_hash: hashedPassword
      });

      return user;
    } catch (error) {
      console.error('Error in createUser service:', error);
      throw error;
    }
  }

  async getUserById(id) {
    try {
      const user = await this.userModel.findById(id);
      return user;
    } catch (error) {
      console.error('Error in getUserById service:', error);
      throw error;
    }
  }

  async getUserByUsername(username) {
    try {
      const user = await this.userModel.findByUsername(username);
      return user;
    } catch (error) {
      console.error('Error in getUserByUsername service:', error);
      throw error;
    }
  }

  async login(username, password) {
    try {
      const user = await this.userModel.findByUsername(username);

      if (!user) {
        throw new Error('Invalid username or password');
      }

      const isValid = await verifyPassword(password, user.password_hash);

      if (!isValid) {
        throw new Error('Invalid username or password');
      }

      // Don't return password_hash
      const { password_hash: _password_hash, ...userWithoutPassword } = user;

      // Generate JWT token
      const token = generateToken(userWithoutPassword);

      return {
        token,
        user: userWithoutPassword
      };
    } catch (error) {
      console.error('Error in login service:', error);
      throw error;
    }
  }
}
