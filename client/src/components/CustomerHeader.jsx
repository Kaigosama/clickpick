import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

const CustomerHeader = ({ activePage = '' }) => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);

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
    setShowMobileNavMenu(false);
  };

  if (!user) {
    return null;
  }

  return (
    <>
      {showMobileNavMenu && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setShowMobileNavMenu(false)}
          className="sm:hidden fixed inset-0 z-[45] bg-transparent"
        />
      )}

      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => goTo('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          <nav className="hidden sm:flex items-center gap-3 sm:gap-8 text-sm sm:text-base">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => goTo(item.path)}
                className={`font-semibold text-lg transition-opacity ${activePage === item.key ? 'text-yellow-200' : 'hover:opacity-80'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="sm:hidden relative">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm uppercase max-w-[120px] truncate">{user?.name || 'User'}</p>
                <button
                  onClick={() => {
                    setShowMobileNavMenu(!showMobileNavMenu);
                    setShowProfileMenu(false);
                  }}
                  className="w-9 h-9 rounded-md border border-white/40 flex items-center justify-center hover:bg-white/10"
                  aria-label="Open navigation menu"
                >
                  ☰
                </button>
              </div>

              {showMobileNavMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-44 overflow-hidden">
                  <button
                    onClick={() => goTo('/profile')}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => goTo('/menu')}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Stores
                  </button>
                  <button
                    onClick={() => goTo('/my-orders')}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    My Orders
                  </button>
                  <button
                    onClick={() => goTo('/order-history')}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Order History
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
      </header>
    </>
  );
};

export default CustomerHeader;
