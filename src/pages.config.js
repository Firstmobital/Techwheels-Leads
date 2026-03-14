/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Home from './pages/Home';
import InviteUsers from './pages/InviteUsers';
import Report from './pages/Report';
import SyncMonitoring from './pages/SyncMonitoring';
import Templates from './pages/Templates';
import __Layout from './Layout.jsx';

const ENABLE_LEGACY_SYNC_ROUTES = import.meta.env.VITE_ENABLE_LEGACY_SYNC_ROUTES === 'true';


export const PAGES = {
    "Home": Home,
    "InviteUsers": InviteUsers,
    "Report": Report,
    "Templates": Templates,
    ...(ENABLE_LEGACY_SYNC_ROUTES ? { "SyncMonitoring": SyncMonitoring } : {}),
}

export const ROUTES = [
    { path: '/Home', component: Home, title: 'Home' },
    { path: '/InviteUsers', component: InviteUsers, title: 'Invite Users' },
    { path: '/Report', component: Report, title: 'Report' },
    { path: '/Templates', component: Templates, title: 'Templates' },
    ...(ENABLE_LEGACY_SYNC_ROUTES ? [{ path: '/sync-monitoring', component: SyncMonitoring, title: 'Sync Monitoring (Legacy)' }] : []),
];

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    routes: ROUTES,
    Layout: __Layout,
};