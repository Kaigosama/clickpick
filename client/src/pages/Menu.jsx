import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import CartPreview from '../components/CartPreview.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';
import api from '../services/api.js';
import { toServerAssetUrl } from '../services/assetUrl.js';
import { getSocket } from '../services/socket.js';

const normalizeStoreOpen = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'closed', 'no'].includes(normalized)) return false;
  if (['true', '1', 'open', 'yes'].includes(normalized)) return true;
  return true;
};

const Menu = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, cartTotal } = useCart();
  const [showCartPreview, setShowCartPreview] = useState(false);

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
          logoUrl: stall.logoUrl || null,
          storeOpen: normalizeStoreOpen(stall.storeOpen)
        }));
        setStalls(mappedStalls);
      } catch (err) {
        console.error('Error fetching stalls:', err);
      }
    };

    fetchStalls();
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleStoreStatusUpdated = (payload) => {
      const updatedStallId = String(payload?.stallId || '');
      if (!updatedStallId) return;

      setStalls((prev) => prev.map((entry) => (
        String(entry.id) === updatedStallId
          ? { ...entry, storeOpen: normalizeStoreOpen(payload?.storeOpen) }
          : entry
      )));
    };

    socket.on('store:status_updated', handleStoreStatusUpdated);

    return () => {
      socket.off('store:status_updated', handleStoreStatusUpdated);
    };
  }, []);

  const handleStallClick = (stallId) => {
    // Navigate to stall menu
    navigate(`/stall/${stallId}`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <CustomerHeader activePage="stores" />

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
                className={`bg-white rounded-lg shadow-md sm:shadow-lg transition-shadow p-3 sm:p-6 flex flex-col items-center justify-center text-center border-2 ${stall.storeOpen ? 'border-gray-200 hover:border-[#8B0000] hover:shadow-xl cursor-pointer' : 'border-gray-300 opacity-75 cursor-not-allowed'}`}
                disabled={!stall.storeOpen}
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
                <h2 className="text-sm sm:text-xl font-bold text-gray-900 leading-tight line-clamp-2 min-h-[2rem] sm:min-h-0">
                  {stall.name}
                </h2>
                <p className={`mt-1 text-xs sm:text-sm font-semibold ${stall.storeOpen ? 'text-green-600' : 'text-red-600'}`}>
                  {stall.storeOpen ? 'Open' : 'Closed'}
                </p>
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