const bcrypt = require('bcrypt');

exports.up = async (pgClient) => {
  // Generate password hash once and reuse it
  const password = 'password';
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const users = [
      {
        username: 'investigator_user',
        email: 'investigator@noirion.dev',
        full_name: 'Investigator User',
        role: 'investigator',
        password_hash: password_hash
      },
      {
        username: 'admin_user',
        email: 'admin@noirion.dev',
        full_name: 'Administrator',
        role: 'admin',
        password_hash: password_hash
      },
      {
        username: 'analyst_user',
        email: 'analyst@noirion.dev',
        full_name: 'Data Analyst',
        role: 'analyst',
        password_hash: password_hash
      },
      {
        username: 'readonly_user',
        email: 'readonly@noirion.dev',
        full_name: 'Read-only User',
        role: 'readonly',
        password_hash: password_hash
      }
    ];
    
    // Create each user
    for (const user of users) {
      await pgClient.query(
        `INSERT INTO users (username, email, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.username, user.email, user.full_name, user.role, user.password_hash]
      );
    }
    
    console.log('Default users created successfully');
  } catch (error) {
    console.error('Error creating default users:', error);
    throw error;
  }
};

exports.down = async (pgClient) => {
  try {
    // Delete the default users we created
    await pgClient.query(`DELETE FROM users WHERE username IN ('investigator_user', 'admin_user', 'analyst_user', 'readonly_user')`);
    console.log('Default users deleted successfully');
  } catch (error) {
    console.error('Error deleting default users:', error);
    throw error;
  }
};