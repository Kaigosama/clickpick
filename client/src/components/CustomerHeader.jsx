import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

const CustomerHeader = ({ activePage = '' }) => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileProfileMenu, setShowMobileProfileMenu] = useState(false);

  const navItems = useMemo(() => ([
    { key: 'stores', label: 'STORES', path: '/menu' },
    { key: 'my-orders', label: 'MY ORDERS', path: '/my-orders' },
    { key: 'order-history', label: 'ORDER HISTORY', path: '/order-history' }
  ]), []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const goTo = (path) => {
    navigate(path);
    setShowProfileMenu(false);
    setShowMobileProfileMenu(false);
  };

  if (!user) {
    return null;
  }

  return (
    <>
      {showMobileProfileMenu && (
        <button
          type="button"
          aria-label="Close profile menu"
          onClick={() => setShowMobileProfileMenu(false)}
          className="sm:hidden fixed inset-0 z-[45] bg-transparent"
        />
      )}

      <header className="bg-[#8B0000] text-white font-sans shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3 cursor-pointer" onClick={() => goTo('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-9 h-9 sm:w-12 sm:h-12 object-contain" />
            <span className="text-base sm:text-xl font-semibold sm:font-bold tracking-tight text-white/95 truncate">ClickPick</span>
          </div>

          <nav className="hidden sm:flex items-end gap-3 sm:gap-8 text-sm sm:text-base">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => goTo(item.path)}
                className={`relative font-semibold text-lg pb-2 transition-colors ${activePage === item.key ? 'text-white' : 'text-white/85 hover:text-white'}`}
              >
                {item.label}
                {activePage === item.key && (
                  <span className="absolute left-0 right-0 -bottom-[2px] h-1 rounded-sm bg-[#f4c542]" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="sm:hidden relative min-w-0">
              <button
                onClick={() => {
                  setShowMobileProfileMenu(!showMobileProfileMenu);
                  setShowProfileMenu(false);
                }}
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                aria-label="Open profile menu"
              >
                <p className="font-medium text-xs uppercase max-w-[120px] truncate text-white/95">{user?.name || 'User'}</p>
                <p className="text-xs">{showMobileProfileMenu ? '▲' : '▼'}</p>
              </button>

              {showMobileProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-44 overflow-hidden">
                  <button
                    onClick={() => goTo('/profile')}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 hover:bg-red-100 transition-colors font-semibold text-red-600"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  <p className="font-semibold text-sm uppercase">{user?.name || 'User'}</p>
                  <p className="text-xs">▼</p>
                </div>
              </button>

              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-48">
                  <button
                    onClick={() => goTo('/profile')}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold ${activePage === 'profile' ? 'bg-gray-50 border-b border-gray-200' : 'border-b border-gray-200'}`}
                  >
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 hover:bg-red-100 transition-colors font-semibold text-red-600"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:hidden border-t border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="px-3 py-3 grid grid-cols-3 gap-2 text-[11px] font-bold tracking-wide">
            {navItems.map((item) => (
              <button
                key={`mobile-${item.key}`}
                onClick={() => goTo(item.path)}
                className={`relative w-full text-center pb-1.5 truncate ${activePage === item.key ? 'text-white' : 'text-white/80'}`}
              >
                {item.label}
                {activePage === item.key && (
                  <span className="absolute left-0 right-0 -bottom-[2px] h-1.5 rounded-sm bg-[#f4c542]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>
    </>
  );
};

export default CustomerHeader;
