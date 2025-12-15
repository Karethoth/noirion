export class User {
  constructor(dbPool) {
    this.pool = dbPool;
  }

  async create(userData) {
    const query = `
      INSERT INTO users(username, email, password_hash)
      VALUES($1, $2, $3)
      RETURNING id, username, email, created_at
    `;
    
    const values = [
      userData.username,
      userData.email,
      userData.password_hash
    ];
    
    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async findById(id) {
    const query = 'SELECT id, username, email, created_at FROM users WHERE id = $1';
    
    try {
      const result = await this.pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user:', error);
      throw error;
    }
  }

  async findByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    
    try {
      const result = await this.pool.query(query, [username]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  }
}