// @ts-nocheck
import React, { useState } from'react';
import { Link, useLocation, useNavigate } from'react-router-dom';
import { createPageUrl } from'@/utils';
import { MessageCircle, Users, LogOut } from'lucide-react';
import { cn } from'@/lib/utils';
import { motion } from'framer-motion';
import { useAuth } from'@/lib/AuthContext';
import { useCurrentUser } from'@/lib/CurrentUserContext';
import { isAdminUser } from'@/lib/authUserUtils';

export default function Layout({ children, currentPageName }) {
 const [showLogoutDialog, setShowLogoutDialog] = useState(false);
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const location = useLocation();
 const navigate = useNavigate();
 const { logout } = useAuth();
 const { currentUser } = useCurrentUser();
 const isAdmin = isAdminUser(currentUser);

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
 ];

 // Admin-only nav items
 const adminNavItems = isAdmin ? [
 { to: createPageUrl('InviteUsers'), label:'Team', icon: Users, page:'InviteUsers' },
 ] : [];

 const allNavItems = [...navItems, ...adminNavItems];

 const SidebarContents = () => (
 <>
 <div className="px-4 py-4 border-b border-gray-100">
 <div className="flex items-center gap-2.5">
 <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
 <span className="text-[10px] font-bold text-white">TW</span>
 </div>
 <h2 className="text-sm font-semibold text-gray-900">TechWheels</h2>
 </div>
 </div>
 <nav className="flex-1 px-2 py-3 space-y-1">
 {allNavItems.map(item => {
 const Icon = item.icon;
 const isActive = currentPageName === item.page;
 return (
 <Link
 key={item.page}
 to={item.to}
 onClick={() => setSidebarOpen(false)}
 className={cn(
"w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all user-select-none",
 isActive
 ? "bg-gray-100 text-gray-900"
 : "text-gray-500 hover:bg-gray-50"
 )}
 >
 <Icon className="w-4 h-4" />
 <span>{item.label}</span>
 </Link>
 );
 })}
 </nav>
 {!isHome && (
 <div className="p-2 border-t border-gray-100">
 <button
 onClick={() => setShowLogoutDialog(true)}
 className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all user-select-none"
 >
 <LogOut className="w-4 h-4" />
 <span>Logout</span>
 </button>
 </div>
 )}
 </>
 );

 return (
 <div className="min-h-screen bg-gray-50">
 {/* Desktop Sidebar — always visible on md+ */}
 <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[220px] border-r z-40 flex-col bg-white border-gray-100">
 <SidebarContents />
 </aside>

 {/* Mobile Drawer Overlay */}
 {sidebarOpen && (
 <div className="fixed inset-0 z-50 md:hidden">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/40"
 onClick={() => setSidebarOpen(false)}
 />
 {/* Drawer panel */}
 <aside className="absolute left-0 top-0 h-full w-[220px] flex flex-col bg-white border-r border-gray-100 shadow-xl">
 <SidebarContents />
 </aside>
 </div>
 )}

 <div className="min-h-screen flex flex-col md:ml-[220px]">
 <motion.div
 key={location.pathname}
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.2 }}
 className="flex-1"
 >
 {children}
 </motion.div>

 {/* Bottom Nav — mobile only, full width */}
 <div
 className="fixed bottom-0 left-0 right-0 border-t flex justify-around z-40 md:hidden bg-white border-gray-100"
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
 isActive ? "text-gray-900" : "text-gray-400"
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
