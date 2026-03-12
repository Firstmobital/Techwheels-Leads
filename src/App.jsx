import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Login from './pages/Login';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

const { Pages, Layout, mainPage, routes = [] } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;
const loginPath = import.meta.env.VITE_LOGIN_PATH || '/login';
const normalizedRoutes = Array.isArray(routes) && routes.length > 0
  ? routes
  : Object.entries(Pages).map(([path, component]) => ({ path: `/${path}`, component, title: path }));

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path={loginPath}
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/" element={
        isAuthenticated ? (
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        ) : (
          <Navigate to={loginPath} replace />
        )
      } />
      {normalizedRoutes.map((route) => {
        const routePath = route?.path || '/';
        const Page = route?.component;
        const currentPageName = route?.title || routePath.replace(/^\//, '');
        if (!Page) return null;
        return (
        <Route
          key={routePath}
          path={routePath}
          element={
            isAuthenticated ? (
              <LayoutWrapper currentPageName={currentPageName}>
                <Page />
              </LayoutWrapper>
            ) : (
              <Navigate to={loginPath} replace />
            )
          }
        />
      )})}
      <Route
        path="*"
        element={isAuthenticated ? <PageNotFound /> : <Navigate to={loginPath} replace />}
      />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplitPath: true }}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
