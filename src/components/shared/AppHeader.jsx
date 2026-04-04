import React from'react';
import { useLocation, useNavigate } from'react-router-dom';
import { ChevronLeft, Menu } from'lucide-react';
import { createPageUrl } from'@/utils';

/**
 * @typedef {Object} HeaderChildren
 * @property {React.ReactNode} [title]
 * @property {React.ReactNode} [subtitle]
 * @property {React.ReactNode} [actions]
 */

/**
 * @param {{ currentPageName: string, children?: HeaderChildren, onMenuClick?: () => void }} props
 */
export default function AppHeader({ currentPageName, children = {}, onMenuClick }) {
 const location = useLocation();
 const navigate = useNavigate();
 const isHome = currentPageName ==='Home';

 const handleBack = () => {
 navigate(createPageUrl('Home'));
 };

 return (
 <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4 safe-area-top flex items-center justify-between">
 <div className="flex items-center gap-3 flex-1">
 {isHome && onMenuClick ? (
 <button
 onClick={onMenuClick}
 className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-gray-100 transition-colors md:hidden"
 aria-label="Open navigation"
 >
 <Menu className="w-5 h-5 text-gray-900" />
 </button>
 ) : !isHome ? (
 <button
 onClick={handleBack}
 className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-gray-100 transition-colors"
 >
 <ChevronLeft className="w-5 h-5 text-gray-900" />
 </button>
 ) : null}
 <div>
 <h1 className="text-xl font-bold text-gray-900 tracking-tight">
 {isHome ?'Techwheels Lead Connect' : children?.title ||'Techwheels'}
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
