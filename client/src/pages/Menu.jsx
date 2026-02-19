import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import CartPreview from '../components/CartPreview.jsx';
import api from '../services/api.js';
import { toServerAssetUrl } from '../services/assetUrl.js';

const Menu = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, removeFromCart, addToCart, cartTotal, clearCart } = useCart();
  const [showCartPreview, setShowCartPreview] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);

  const [stalls, setStalls] = useState([]);

  useEffect(() => {
    if (!user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    const fetchStalls = async () => {
      try {
        const res = await api.get('/auth/stalls');
        const list = Array.isArray(res.data) ? res.data : res.data?.stalls;
        if (!list || list.length === 0) {
          return;
        }

        const mappedStalls = list.map((stall) => ({
          id: stall._id,
          name: stall.name,
          logoUrl: stall.logoUrl || null
        }));
        setStalls(mappedStalls);
      } catch (err) {
        console.error('Error fetching stalls:', err);
      }
    };

    fetchStalls();
  }, []);

  const handleStallClick = (stallId) => {
    // Navigate to stall menu
    navigate(`/stall/${stallId}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      alert("Cart is empty!");
      return;
    }

    try {
      const api = (await import('../services/api.js')).default;
      const orderData = {
        customerId: user._id,
        items: cartItems.map(item => ({
          menuItemId: item._id,
          name: item.name,
          variation: item.selectedVariation || '',
          riceOption: item.selectedRiceOption || '',
          quantity: item.quantity || 1,
          price: item.price
        })),
        totalAmount: cartTotal,
        paymentMethod: 'cash'
      };

      await api.post('/orders', orderData);
      alert("Order Placed Successfully! Your order number will be displayed.");
      clearCart();
      navigate('/my-orders');
    } catch (err) {
      console.error(err);
      alert("Checkout Failed: " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header Navigation */}
      <header className="bg-[#8B0000] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-3 sm:gap-8 text-sm sm:text-base">
            <button onClick={() => {}} className="hover:opacity-80 font-semibold text-lg">
              STORES
            </button>
            <button onClick={() => navigate('/my-orders')} className="hover:opacity-80 font-semibold text-lg">
              MY ORDERS
            </button>
          </nav>

          {/* User Profile & Cart */}
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="sm:hidden relative">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm uppercase max-w-[120px] truncate">
                  {user?.name || 'User'}
                </p>
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
                    onClick={() => {
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    🏪 Stores
                  </button>
                  <button
                    onClick={() => {
                      navigate('/my-orders');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold"
                  >
                    📋 My Orders
                  </button>
                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-t border-gray-200"
                  >
                    👤 Edit Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileNavMenu(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-red-100 transition-colors font-semibold text-red-600"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>

            <div className="relative hidden sm:block">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="w-8 h-8 bg-white rounded-full" />
                <div className="hidden sm:flex items-center gap-1">
                  <p className="font-semibold text-sm uppercase">{user?.name || 'User'}</p>
                  <p className="text-xs">▼</p>
                </div>
              </button>

              {/* Dropdown Menu */}
              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-48">
                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowProfileMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    👤 Edit Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-red-100 transition-colors font-semibold text-red-600"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">Available Canteen Stalls</h1>
        <p className="text-gray-600 mb-8">Select a stall to view their menu items</p>

        {/* Stalls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
          {stalls.length === 0 ? (
            <div className="col-span-2 sm:col-span-2 md:col-span-3 lg:col-span-4 text-center py-12 bg-white rounded-lg">
              No canteen stalls available yet
            </div>
          ) : (
            stalls.map(stall => (
              <button
                key={stall.id}
                onClick={() => handleStallClick(stall.id)}
                className="bg-white rounded-lg shadow-md sm:shadow-lg hover:shadow-xl transition-shadow p-3 sm:p-6 flex flex-col items-center justify-center text-center border-2 border-gray-200 hover:border-[#8B0000] cursor-pointer"
              >
                {/* Logo/Icon */}
                <div className="w-14 h-14 sm:w-24 sm:h-24 bg-[#8B0000] rounded flex items-center justify-center mb-2 sm:mb-4 text-2xl sm:text-5xl overflow-hidden">
                  {stall.logoUrl ? (
                    <img
                      src={toServerAssetUrl(stall.logoUrl)}
                      alt={`${stall.name} logo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white">🍽️</span>
                  )}
                </div>
                
                {/* Stall Name */}
                <h2 className="text-xs sm:text-xl font-bold text-gray-900 leading-tight line-clamp-2 min-h-[2rem] sm:min-h-0">
                  {stall.name}
                </h2>
              </button>
            ))
          )}
        </div>
      </main>

      {/* Floating Basket Button - Bottom Right */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        <button
          onClick={() => navigate('/cart')}
          onMouseEnter={() => setShowCartPreview(true)}
          onMouseLeave={() => setShowCartPreview(false)}
          className="bg-[#8B0000] text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold hover:bg-red-800 transition-all shadow-lg hover:shadow-xl"
          title="View Basket"
        >
          🛒
          {cartItems.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-yellow-300 text-[#8B0000] rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
              {cartItems.length}
            </span>
          )}
        </button>

        {/* Cart Preview - Shown on Hover */}
        {showCartPreview && (
          <CartPreview 
            cartItems={cartItems}
            cartTotal={cartTotal}
            onCheckoutClick={() => navigate('/cart')}
          />
        )}
      </div>
    </div>
  );
};

export default Menu;