import { useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { createUploadLink } from './utils/uploadLink'
import ImageMap from './components/ImageMap'
import ImageUpload from './components/ImageUpload'
import EntityManager from './components/EntityManager'
import TimelineView from './components/TimelineView'
import Login from './components/Login'
import './App.css'

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: createUploadLink({
    uri: `${import.meta.env.VITE_API_URL}/graphql`,
  }),
})

function MainApp({ user, onLogout }) {
  const [currentView, setCurrentView] = useState('map');
  const [timeCursor, setTimeCursor] = useState(() => {
    return localStorage.getItem('timeCursor') || null;
  });
  const canWrite = user.role === 'admin' || user.role === 'investigator';

  useEffect(() => {
    if (timeCursor) {
      localStorage.setItem('timeCursor', timeCursor);
    } else {
      localStorage.removeItem('timeCursor');
    }
  }, [timeCursor]);

  return (
    <div className="main-app">
      {/* Top Navigation Bar */}
      <nav className="top-nav">
        <div className="nav-tabs">
          <button
            className={`nav-tab ${currentView === 'map' ? 'active' : ''}`}
            onClick={() => setCurrentView('map')}
          >
            🗺️ Map
          </button>
          <button
            className={`nav-tab ${currentView === 'entities' ? 'active' : ''}`}
            onClick={() => setCurrentView('entities')}
          >
            👤 Entities
          </button>
          <button
            className={`nav-tab ${currentView === 'timeline' ? 'active' : ''}`}
            onClick={() => setCurrentView('timeline')}
          >
            📌 Events
          </button>
        </div>
        <div className="nav-actions">
          {canWrite && currentView === 'map' && <ImageUpload />}
          {!canWrite && (
            <div className="read-only-badge" title="Your role has read-only access">
              Read-Only
            </div>
          )}
        </div>
        <div className="nav-user-section">
          <div className="user-info">
            <span className="user-name">{user.full_name || user.username}</span>
            <span className="user-role">{user.role}</span>
          </div>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </nav>

      {/* Content Area */}
      <div className="content-container">
        {currentView === 'map' && (
          <div className="map-container">
            <ImageMap key="image-map" userRole={user.role} timeCursor={timeCursor} />
          </div>
        )}
        {currentView === 'entities' && (
          <EntityManager userRole={user.role} />
        )}
        {currentView === 'timeline' && (
          <TimelineView
            userRole={user.role}
            timeCursor={timeCursor}
            onTimeCursorChange={setTimeCursor}
          />
        )}
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  const handleLoginSuccess = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <ApolloProvider client={client}>
      {user ? (
        <MainApp user={user} onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </ApolloProvider>
  )
}

export default App
