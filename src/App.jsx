import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Home = lazy(() => import('./pages/Home'));
const Calendar = lazy(() => import('./pages/Calendar'));
const CreatePost = lazy(() => import('./pages/CreatePost'));
const ReadPost = lazy(() => import('./pages/ReadPost'));
const SpacePage = lazy(() => import('./pages/SpacePage'));
const SharedSpacePage = lazy(() => import('./pages/SharedSpacePage'));
const SettingsProfile = lazy(() => import('./pages/SettingsProfile'));
const SettingsSpaces = lazy(() => import('./pages/SettingsSpaces'));
const SettingsPeople = lazy(() => import('./pages/SettingsPeople'));
const SettingsTags = lazy(() => import('./pages/SettingsTags'));
const PersonProfile = lazy(() => import('./pages/PersonProfile'));
const ErrorPage = lazy(() => import('./pages/ErrorPage'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading...
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const rawRedirect = new URLSearchParams(location.search).get('redirect') || '/';
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';
  if (loading) return null;
  if (user) return <Navigate to={redirect} replace />;
  return children;
}

function HomeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  function handleSearchChange(value) {
    setSearchQuery(value);
    if (urlQuery && !value) {
      setSearchParams({}, { replace: true });
    }
  }

  return (
    <Layout onSearch={handleSearchChange} initialSearch={searchQuery}>
      <Home searchQuery={searchQuery} />
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        <Route path="/" element={
          <ProtectedRoute>
            <HomeRoute />
          </ProtectedRoute>
        } />
        <Route path="/calendar" element={
          <ProtectedRoute>
            <Layout>
              <Calendar />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/create" element={
          <ProtectedRoute>
            <Layout>
              <CreatePost />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/post/:id" element={
          <ProtectedRoute>
            <Layout>
              <ReadPost />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/space/:id" element={
          <ProtectedRoute>
            <Layout>
              <SpacePage />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/people/:username" element={
          <ProtectedRoute>
            <Layout>
              <PersonProfile />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/shared/:shareLink" element={
          <ProtectedRoute>
            <Layout>
              <SharedSpacePage />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings/profile" element={
          <ProtectedRoute>
            <Layout>
              <SettingsProfile />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings/spaces" element={
          <ProtectedRoute>
            <Layout>
              <SettingsSpaces />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings/people" element={
          <ProtectedRoute>
            <Layout>
              <SettingsPeople />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings/tags" element={
          <ProtectedRoute>
            <Layout>
              <SettingsTags />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="*" element={<ErrorPage code="404" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}
