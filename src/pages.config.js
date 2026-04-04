import Home from './pages/Home';
import InviteUsers from './pages/InviteUsers';
import Templates from './pages/Templates';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Home": Home,
    "InviteUsers": InviteUsers,
    "Templates": Templates,
}

export const ROUTES = [
    { path: '/Home', component: Home, title: 'Home' },
    { path: '/InviteUsers', component: InviteUsers, title: 'Invite Users' },
    { path: '/Templates', component: Templates, title: 'Templates' },
];

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    routes: ROUTES,
    Layout: __Layout,
};
