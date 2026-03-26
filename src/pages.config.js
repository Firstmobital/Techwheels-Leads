import Home from './pages/Home';
import InviteUsers from './pages/InviteUsers';
import Report from './pages/Report';
import Templates from './pages/Templates';
import DailyDigest from './pages/DailyDigest';
import Accountability from './pages/Accountability';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Home": Home,
    "InviteUsers": InviteUsers,
    "Report": Report,
    "Templates": Templates,
    "DailyDigest": DailyDigest,
    "Accountability": Accountability,
}

export const ROUTES = [
    { path: '/Home', component: Home, title: 'Home' },
    { path: '/InviteUsers', component: InviteUsers, title: 'Invite Users' },
    { path: '/Report', component: Report, title: 'Report' },
    { path: '/Templates', component: Templates, title: 'Templates' },
    { path: '/DailyDigest', component: DailyDigest, title: 'DailyDigest' },
    { path: '/Accountability', component: Accountability, title: 'Accountability' },
];

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    routes: ROUTES,
    Layout: __Layout,
};