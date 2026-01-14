import React from 'react';
import { ArrowLeft, Menu } from 'lucide-react';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  showMenu?: boolean;
  onMenuClick?: () => void;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, onBack, showMenu, onMenuClick, subtitle }) => {
  return (
    <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-4 safe-top">
      <div className="flex items-center gap-3">
        {showBack && (
          <button 
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
        )}
        {!showBack && showMenu && (
           <button 
           onClick={onMenuClick}
           className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
         >
           <Menu size={24} />
         </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 font-medium truncate">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};
