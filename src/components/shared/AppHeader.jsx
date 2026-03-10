import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

export default function AppHeader({ currentPageName, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = currentPageName === 'Home';

  const handleBack = () => {
    navigate(createPageUrl('Home'));
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-5 pt-6 pb-4 safe-area-top flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1">
        {!isHome && (
          <button
            onClick={handleBack}
            className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            {isHome ? 'Techwheels Lead Connect' : children?.title || 'Techwheels'}
          </h1>
          {children?.subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{children.subtitle}</p>
          )}
        </div>
      </div>
      {children?.actions}
    </div>
  );
}