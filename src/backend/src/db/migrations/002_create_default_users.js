import { hashPassword } from '../../utils/password.js';

export const up = async (pgClient) => {
  const password = 'password';

  try {
    const users = [
      {
        username: 'investigator',
        email: 'investigator@noirion.dev',
        full_name: 'Investigator User',
        role: 'investigator'
      },
      {
        username: 'admin',
        email: 'admin@noirion.dev',
        full_name: 'Administrator',
        role: 'admin'
      },
      {
        username: 'analyst',
        email: 'analyst@noirion.dev',
        full_name: 'Data Analyst',
        role: 'analyst'
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
    await pgClient.query(`DELETE FROM users WHERE username IN ('investigator', 'admin', 'analyst')`);
    console.log('Default users deleted successfully');
  } catch (error) {
    console.error('Error deleting default users:', error);
    throw error;
  }
};
