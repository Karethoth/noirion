import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';

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
}