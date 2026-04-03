// @ts-nocheck
import React, { useState, useMemo } from'react';
import { Link, useLocation, useNavigate } from'react-router-dom';
import { createPageUrl } from'@/utils';
import { MessageCircle, Users, BarChart2, LogOut, Bell, Award } from'lucide-react';
import { cn } from'@/lib/utils';
import { motion } from'framer-motion';
import AppHeader from'@/components/shared/AppHeader';
import { useAuth } from'@/lib/AuthContext';
import { useCurrentUser } from'@/lib/CurrentUserContext';
import { isAdminUser } from'@/lib/authUserUtils';

export default function Layout({ children, currentPageName }) {
 const [showLogoutDialog, setShowLogoutDialog] = useState(false);
 const location = useLocation();
 const navigate = useNavigate();
 const { logout } = useAuth();
 const { currentUser } = useCurrentUser();
 const isAdmin = isAdminUser(currentUser);

 const prefersDark = useMemo(() => {
 if (typeof window ==='undefined') return false;
 return window.matchMedia('(prefers-color-scheme: dark)').matches;
 }, []);

 const handleLogout = async () => {
 await logout();
 setShowLogoutDialog(false);
 const loginPath = import.meta.env.VITE_LOGIN_PATH ||'/login';
 navigate(loginPath, { replace: true });
 };

 const isHome = currentPageName ==='Home';

 // Nav items — always visible
 const navItems = [
 { to: createPageUrl('Home'), label:'Leads', icon: MessageCircle, page:'Home' },
 { to: createPageUrl('DailyDigest'), label:'Digest', icon: Bell, page:'DailyDigest' },
 { to: createPageUrl('Report'), label:'Report', icon: BarChart2, page:'Report' },
 ];

 // Admin-only nav items
 const adminNavItems = isAdmin ? [
 { to: createPageUrl('Accountability'), label:'Scores', icon: Award, page:'Accountability' },
 { to: createPageUrl('InviteUsers'), label:'Team', icon: Users, page:'InviteUsers' },
 ] : [];

 const allNavItems = [...navItems, ...adminNavItems];

 return (
 <div className={cn("min-h-screen", prefersDark ?'dark bg-gray-900' :'bg-gray-50')}>
 {/* Desktop Sidebar */}
 <aside
 className={cn(
"hidden md:flex fixed left-0 top-0 h-screen w-[220px] border-r z-40 flex-col",
 prefersDark ?'bg-gray-800 border-gray-700' :'bg-white border-gray-100'
 )}
 >
 <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700">
 <h2 className={cn("text-sm font-semibold", prefersDark ?'text-white' :'text-gray-900')}>Navigation</h2>
 </div>
 <nav className="flex-1 px-2 py-3 space-y-1">
 {allNavItems.map(item => {
 const Icon = item.icon;
 const isActive = currentPageName === item.page;
 return (
 <Link
 key={item.page}
 to={item.to}
 className={cn(
"w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all user-select-none",
 isActive
 ? (prefersDark ?"bg-gray-700 text-white" :"bg-gray-100 text-gray-900")
 : (prefersDark ?"text-gray-400 hover:bg-gray-700" :"text-gray-500 hover:bg-gray-50")
 )}
 >
 <Icon className="w-4 h-4" />
 <span>{item.label}</span>
 </Link>
 );
 })}
 </nav>
 {!isHome && (
 <div className="p-2 border-t border-gray-100 dark:border-gray-700">
 <button
 onClick={() => setShowLogoutDialog(true)}
 className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all user-select-none"
 >
 <LogOut className="w-4 h-4" />
 <span>Logout</span>
 </button>
 </div>
 )}
 </aside>

 <div className="min-h-screen flex flex-col md:ml-[220px]">
 <AppHeader currentPageName={currentPageName} />
 <motion.div
 key={location.pathname}
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.2 }}
 className="flex-1"
 >
 {children}
 </motion.div>

 {/* Bottom Nav */}
 <div
 className={cn(
"fixed bottom-0 left-0 right-0 border-t flex justify-around z-50 max-w-lg mx-auto md:hidden",
 prefersDark ?'bg-gray-800 border-gray-700' :'bg-white border-gray-100'
 )}
 style={{ paddingBottom:'env(safe-area-inset-bottom)' }}
 >
 {allNavItems.map(item => {
 const Icon = item.icon;
 const isActive = currentPageName === item.page;
 return (
 <Link
 key={item.page}
 to={item.to}
 className={cn(
"flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium transition-all user-select-none",
 isActive
 ? (prefersDark ?"text-white" :"text-gray-900")
 : (prefersDark ?"text-gray-400" :"text-gray-400")
 )}
 >
 <Icon className="w-5 h-5" />
 <span>{item.label}</span>
 </Link>
 );
 })}

 {/* Logout — only when not on home */}
 {!isHome && (
 <button
 onClick={() => setShowLogoutDialog(true)}
 className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition-all user-select-none"
 >
 <LogOut className="w-5 h-5" />
 <span>Logout</span>
 </button>
 )}
 </div>
 </div>

 {/* Logout Dialog */}
 {showLogoutDialog && (
 <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
 <motion.div
 initial={{ scale: 0.9, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 className="bg-white rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-sm mx-0 md:mx-4 shadow-lg"
 >
 <h2 className="text-lg font-bold text-gray-900 mb-2">Log out?</h2>
 <p className="text-sm text-gray-600 mb-6">
 You will be signed out and redirected to the login page.
 </p>
 <div className="flex gap-3">
 <button
 onClick={() => setShowLogoutDialog(false)}
 className="flex-1 py-2 px-4 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
 >
 Cancel
 </button>
 <button
 onClick={handleLogout}
 className="flex-1 py-2 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium"
 >
 Log out
 </button>
 </div>
 </motion.div>
 </div>
 )}
 </div>
 );
}