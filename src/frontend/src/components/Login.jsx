import React, { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import './Login.css';
import { LOGIN_MUTATION } from '../graphql/auth';

const Login = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: (data) => {
      setError('');
      // Store token and user info in localStorage
      localStorage.setItem('token', data.login.token);
      localStorage.setItem('user', JSON.stringify(data.login.user));
      onLoginSuccess(data.login.user);
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    try {
      await login({ variables: { username, password } });
    } catch {
      // Error handled by onError callback
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Noirion Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="demo-accounts">
          <p><strong>Demo Accounts:</strong></p>
          <ul>
            <li><code>admin</code> / password (full access)</li>
            <li><code>investigator</code> / password (can edit)</li>
            <li><code>analyst</code> / password (read-only)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Login;
