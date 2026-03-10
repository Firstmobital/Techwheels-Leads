import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MessageCircle, Users, BarChart2, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import AppHeader from '@/components/shared/AppHeader';

export default function Layout({ children, currentPageName }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const location = useLocation();

  useEffect(() => {
    base44.auth.me().then(user => {
      setCurrentUser(user);
      if (user?.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  const prefersDark = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, []);

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      await base44.auth.updateMe({ deleted: true });
      await base44.auth.logout();
    }
  };

  const isHome = currentPageName === 'Home';

  return (
    <div className={cn("min-h-screen flex flex-col", prefersDark ? 'dark bg-gray-900' : 'bg-gray-50')}>
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
      <div className={cn("fixed bottom-0 left-0 right-0 border-t flex justify-around z-50 max-w-lg mx-auto", prefersDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100')} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Link
          to={createPageUrl('Home')}
          className={cn(
            "flex flex-col items-center gap-1 px-6 py-2 rounded-xl text-xs font-medium transition-all user-select-none",
            currentPageName === 'Home' ? (prefersDark ? "text-white" : "text-gray-900") : (prefersDark ? "text-gray-400" : "text-gray-400")
          )}
        >
          <MessageCircle className="w-5 h-5" />
          <span>Leads</span>
        </Link>
        <Link
          to={createPageUrl('Report')}
          className={cn(
            "flex flex-col items-center gap-1 px-6 py-2 rounded-xl text-xs font-medium transition-all user-select-none",
            currentPageName === 'Report' ? (prefersDark ? "text-white" : "text-gray-900") : (prefersDark ? "text-gray-400" : "text-gray-400")
          )}
        >
          <BarChart2 className="w-5 h-5" />
          <span>Report</span>
        </Link>
        {isAdmin && (
          <Link
            to={createPageUrl('InviteUsers')}
            className={cn(
              "flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium transition-all user-select-none",
              currentPageName === 'InviteUsers' ? (prefersDark ? "text-white" : "text-gray-900") : (prefersDark ? "text-gray-400" : "text-gray-400")
            )}
          >
            <Users className="w-5 h-5" />
            <span>Team</span>
          </Link>
        )}
        {!isHome && (
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition-all user-select-none"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        )}
      </div>

      {/* Delete Account Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-lg"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Account?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone. Your account and all associated data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-2 px-4 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="flex-1 py-2 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}