import { useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { useQuery } from '@apollo/client/react'
import { createUploadLink } from './utils/uploadLink'
import ImageMap from './components/ImageMap'
import AssetEditor from './components/AssetEditor'
import AssetList from './components/AssetList'
import EntityManager from './components/EntityManager'
import TimelineView from './components/TimelineView'
import Settings from './components/Settings'
import Login from './components/Login'
import './App.css'
import { GET_PROJECT_SETTINGS } from './graphql/settings'
import { setAiConfig } from './utils/aiConfig'

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: createUploadLink({
    uri: `${import.meta.env.VITE_API_URL}/graphql`,
  }),
})

const ALLOWED_VIEWS = new Set(['map', 'entities', 'timeline', 'assets', 'settings', 'asset']);

function parseAppLocation() {
  try {
    const raw = (window.location.hash || '').replace(/^#/, '').trim();
    if (!raw) return { view: 'map', assetId: null };
    const [view, param] = raw.split('/');
    if (!ALLOWED_VIEWS.has(view)) return { view: 'map', assetId: null };
    if (view === 'asset') return { view: 'asset', assetId: param || null };
    return { view, assetId: null };
  } catch {
    return { view: 'map', assetId: null };
  }
}

function makeAppHash(view, assetId) {
  if (view === 'asset') {
    return assetId ? `#asset/${assetId}` : '#asset';
  }
  return `#${view}`;
}

function MainApp({ user, onLogout }) {
  const [currentView, setCurrentView] = useState('map');
  const [assetEditorId, setAssetEditorId] = useState(null);
  const [assetEditorReturnView, setAssetEditorReturnView] = useState('map');
  const [openMapImageId, setOpenMapImageId] = useState(null);
  const [openMapPresenceId, setOpenMapPresenceId] = useState(null);
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

  const { data: projectSettingsData } = useQuery(GET_PROJECT_SETTINGS, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  useEffect(() => {
    const s = projectSettingsData?.projectSettings;
    if (!s) return;
    setAiConfig({
      enabled: s.aiEnabled !== false,
      host: String(s.lmStudioBaseUrl || ''),
      model: String(s.lmStudioModel || ''),
    });
  }, [projectSettingsData?.projectSettings]);

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

  const applyNavState = (nav) => {
    const view = ALLOWED_VIEWS.has(nav?.view) ? nav.view : 'map';
    if (view === 'asset') {
      setAssetEditorId(nav?.assetId || null);
      setAssetEditorReturnView(ALLOWED_VIEWS.has(nav?.returnView) ? nav.returnView : 'map');
      setCurrentView('asset');
      return;
    }

    setAssetEditorId(null);
    setCurrentView(view);
  };

  const navigate = (nextView, opts = {}, navOptions = {}) => {
    const view = ALLOWED_VIEWS.has(nextView) ? nextView : 'map';
    const assetId = view === 'asset' ? (opts.assetId || null) : null;
    const returnView = ALLOWED_VIEWS.has(opts.returnView) ? opts.returnView : assetEditorReturnView;

    const isSame =
      view === currentView &&
      (view !== 'asset' || String(assetId || '') === String(assetEditorId || ''));
    if (isSame && !navOptions?.force) return;

    const state = { view, assetId, returnView };
    const hash = makeAppHash(view, assetId);

    applyNavState(state);

    try {
      if (navOptions?.replace) {
        window.history.replaceState(state, '', hash);
      } else {
        window.history.pushState(state, '', hash);
      }
    } catch {
      // As a fallback, at least keep the hash in sync.
      window.location.hash = hash;
    }
  };

  useEffect(() => {
    // Initialize from history state or URL hash.
    const initialFromHistory = window.history.state;
    const initialFromHash = parseAppLocation();
    const initial = ALLOWED_VIEWS.has(initialFromHistory?.view)
      ? initialFromHistory
      : { view: initialFromHash.view, assetId: initialFromHash.assetId, returnView: 'map' };

    applyNavState(initial);

    // Ensure there's an in-app history state for the current URL.
    try {
      window.history.replaceState(
        {
          view: ALLOWED_VIEWS.has(initial?.view) ? initial.view : 'map',
          assetId: initial?.view === 'asset' ? (initial?.assetId || null) : null,
          returnView: ALLOWED_VIEWS.has(initial?.returnView) ? initial.returnView : 'map',
        },
        '',
        makeAppHash(
          ALLOWED_VIEWS.has(initial?.view) ? initial.view : 'map',
          initial?.view === 'asset' ? (initial?.assetId || null) : null
        )
      );
    } catch {
      // ignore
    }

    const onPopState = (e) => {
      const st = e?.state;
      if (ALLOWED_VIEWS.has(st?.view)) {
        applyNavState(st);
        return;
      }
      const parsed = parseAppLocation();
      applyNavState({ view: parsed.view, assetId: parsed.assetId, returnView: 'map' });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="main-app">
      {/* Top Navigation Bar */}
      <nav className="top-nav">
        <div className="nav-tabs">
          <button
            className={`nav-tab ${currentView === 'map' ? 'active' : ''}`}
            onClick={() => navigate('map')}
          >
            🗺️ Map
          </button>
          <button
            className={`nav-tab ${currentView === 'entities' ? 'active' : ''}`}
            onClick={() => navigate('entities')}
          >
            👤 Entities
          </button>
          <button
            className={`nav-tab ${currentView === 'timeline' ? 'active' : ''}`}
            onClick={() => navigate('timeline')}
          >
            🕒 Timeline
          </button>
          <button
            className={`nav-tab ${currentView === 'assets' ? 'active' : ''}`}
            onClick={() => navigate('assets')}
          >
            🖼️ Assets
          </button>
          <button
            className={`nav-tab ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            ⚙️ Settings
          </button>
        </div>
        <div className="nav-actions">
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
              openPresenceId={openMapPresenceId}
              onOpenPresenceHandled={() => setOpenMapPresenceId(null)}
              onEditImage={(id) => {
                navigate('asset', { assetId: id, returnView: 'map' });
              }}
            />
          </div>
        )}
        {currentView === 'assets' && (
          <AssetList
            readOnly={!canWrite}
            onEdit={(id) => {
              navigate('asset', { assetId: id, returnView: 'assets' });
            }}
          />
        )}
        {currentView === 'asset' && (
          <AssetEditor
            assetId={assetEditorId}
            readOnly={!canWrite}
            onBack={() => {
              // Always navigate within Noirion. Using history.back() can exit the app
              // when the asset view is the first entry (e.g., deep link / refresh).
              navigate(assetEditorReturnView || 'map', {}, { replace: true, force: true });
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
            onOpenPresence={(presenceId) => {
              if (!presenceId) return;
              setOpenMapImageId(null);
              setOpenMapPresenceId(presenceId);
              navigate('map');
            }}
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
