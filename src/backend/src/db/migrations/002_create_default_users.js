import { hashPassword } from '../../utils/password.js';

export const up = async (pgClient) => {
  const password = 'password';

  try {
    const users = [
      {
        username: 'investigator_user',
        email: 'investigator@noirion.dev',
        full_name: 'Investigator User',
        role: 'investigator'
      },
      {
        username: 'admin_user',
        email: 'admin@noirion.dev',
        full_name: 'Administrator',
        role: 'admin'
      },
      {
        username: 'analyst_user',
        email: 'analyst@noirion.dev',
        full_name: 'Data Analyst',
        role: 'analyst'
      },
      {
        username: 'readonly_user',
        email: 'readonly@noirion.dev',
        full_name: 'Read-only User',
        role: 'readonly'
      }
    ];
    
    // Create each user with a unique password hash
    for (const user of users) {
      const password_hash = await hashPassword(password);
      await pgClient.query(
        `INSERT INTO users (username, email, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.username, user.email, user.full_name, user.role, password_hash]
      );
    }
    
    console.log('Default users created successfully');
  } catch (error) {
    console.error('Error creating default users:', error);
    throw error;
  }
};

export const down = async (pgClient) => {
  try {
    // Delete the default users we created
    await pgClient.query(`DELETE FROM users WHERE username IN ('investigator_user', 'admin_user', 'analyst_user', 'readonly_user')`);
    console.log('Default users deleted successfully');
  } catch (error) {
    console.error('Error deleting default users:', error);
    throw error;
  }
};