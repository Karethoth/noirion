import { useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { createUploadLink } from './utils/uploadLink'
import ImageMap from './components/ImageMap'
import ImageUpload from './components/ImageUpload'
import AssetEditor from './components/AssetEditor'
import AssetList from './components/AssetList'
import EntityManager from './components/EntityManager'
import TimelineView from './components/TimelineView'
import Settings from './components/Settings'
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
  const [assetEditorId, setAssetEditorId] = useState(null);
  const [assetEditorReturnView, setAssetEditorReturnView] = useState('map');
  const [openMapImageId, setOpenMapImageId] = useState(null);
  const [timeStart, setTimeStart] = useState(() => {
    return localStorage.getItem('timeStart') || null;
  });
  const [timeCursor, setTimeCursor] = useState(() => {
    return localStorage.getItem('timeCursor') || null;
  });
  const [ignoreTimeFilter, setIgnoreTimeFilter] = useState(() => {
    try {
      const raw = localStorage.getItem('ignoreTimeFilter');
      if (!raw) return { events: false, presences: false, images: false };
      const parsed = JSON.parse(raw);
      return {
        events: !!parsed?.events,
        presences: !!parsed?.presences,
        images: !!parsed?.images,
      };
    } catch {
      return { events: false, presences: false, images: false };
    }
  });
  const canWrite = user.role === 'admin' || user.role === 'investigator';

  useEffect(() => {
    if (timeStart) {
      localStorage.setItem('timeStart', timeStart);
    } else {
      localStorage.removeItem('timeStart');
    }

    if (timeCursor) {
      localStorage.setItem('timeCursor', timeCursor);
    } else {
      localStorage.removeItem('timeCursor');
    }
  }, [timeStart, timeCursor]);

  useEffect(() => {
    try {
      localStorage.setItem('ignoreTimeFilter', JSON.stringify(ignoreTimeFilter));
    } catch {
      // ignore
    }
  }, [ignoreTimeFilter]);

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
            🕒 Timeline
          </button>
          <button
            className={`nav-tab ${currentView === 'assets' ? 'active' : ''}`}
            onClick={() => setCurrentView('assets')}
          >
            🖼️ Assets
          </button>
          <button
            className={`nav-tab ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            ⚙️ Settings
          </button>
        </div>
        <div className="nav-actions">
          {canWrite && currentView === 'map' && (
            <ImageUpload
              onUploaded={(uploaded) => {
                if (!uploaded?.id) return;

                const hasCoords = Number.isFinite(uploaded.latitude) && Number.isFinite(uploaded.longitude);
                if (hasCoords) {
                  setAssetEditorId(null);
                  setCurrentView('map');
                  setOpenMapImageId(uploaded.id);
                } else {
                  setOpenMapImageId(null);
                  setAssetEditorId(uploaded.id);
                  setAssetEditorReturnView('map');
                  setCurrentView('asset');
                }
              }}
            />
          )}
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
            <ImageMap
              key="image-map"
              userRole={user.role}
              timeCursor={timeCursor}
              timeStart={timeStart}
              ignoreTimeFilter={ignoreTimeFilter}
              openImageId={openMapImageId}
              onOpenImageHandled={() => setOpenMapImageId(null)}
              onEditImage={(id) => {
                setAssetEditorId(id);
                setAssetEditorReturnView('map');
                setCurrentView('asset');
              }}
            />
          </div>
        )}
        {currentView === 'assets' && (
          <AssetList
            readOnly={!canWrite}
            onEdit={(id) => {
              setAssetEditorId(id);
              setAssetEditorReturnView('assets');
              setCurrentView('asset');
            }}
          />
        )}
        {currentView === 'asset' && (
          <AssetEditor
            assetId={assetEditorId}
            readOnly={!canWrite}
            onBack={() => {
              setCurrentView(assetEditorReturnView || 'map');
              setAssetEditorId(null);
            }}
          />
        )}
        {currentView === 'entities' && (
          <EntityManager userRole={user.role} />
        )}
        {currentView === 'timeline' && (
          <TimelineView
            userRole={user.role}
            timeCursor={timeCursor}
            onTimeCursorChange={setTimeCursor}
            timeStart={timeStart}
            onTimeStartChange={setTimeStart}
            ignoreTimeFilter={ignoreTimeFilter}
            onIgnoreTimeFilterChange={setIgnoreTimeFilter}
          />
        )}

        {currentView === 'settings' && (
          <Settings />
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
