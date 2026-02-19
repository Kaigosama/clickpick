import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import api from '../services/api.js';

const Cart = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, removeFromCart, cartTotal, clearCart, increaseQuantity, decreaseQuantity } = useCart();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stalls, setStalls] = useState([]);

  // Group items by store
  const groupedByStore = cartItems.reduce((acc, item) => {
    const storeId = item.stall || item.stallId || 1;
    if (!acc[storeId]) {
      acc[storeId] = [];
    }
    acc[storeId].push(item);
    return acc;
  }, {});

  useEffect(() => {
    const fetchStalls = async () => {
      try {
        const res = await api.get('/auth/stalls');
        const list = Array.isArray(res.data) ? res.data : res.data?.stalls;
        setStalls(list || []);
      } catch (err) {
        console.error('Error fetching stalls:', err);
      }
    };

    fetchStalls();
  }, []);

  const resolveStall = (storeId) => {
    const match = stalls.find((s) => s._id === storeId);
    if (!match) {
      return { name: 'Store', logoUrl: null };
    }
    return match;
  };

  const resolveStallLogo = (stall) => {
    if (!stall?.logoUrl) return null;
    return stall.logoUrl.startsWith('http') ? stall.logoUrl : `http://localhost:5000${stall.logoUrl}`;
  };

  const getStoreTotal = (storeId) => {
    return groupedByStore[storeId]?.reduce((total, item) => total + (item.price * (item.quantity || 1)), 0) || 0;
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      alert("Cart is empty!");
      return;
    }

    setLoading(true);
    try {
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
        paymentMethod: paymentMethod
      };

      await api.post('/orders', orderData);
      alert("Order Placed Successfully! Your order number will be displayed.");
      clearCart();
      navigate('/my-orders');
    } catch (err) {
      console.error(err);
      alert("Checkout Failed: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };



  const handleDeleteStore = (storeId) => {
    // Remove all items from the store
    const storeItems = groupedByStore[storeId] || [];
    storeItems.forEach(item => {
      removeFromCart(item);
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header Navigation */}
      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-3 sm:gap-8 text-sm sm:text-base">
            <button 
              onClick={() => navigate('/menu')}
              className="hover:opacity-80 font-semibold text-lg"
            >
              STORES
            </button>
            <button 
              onClick={() => navigate('/my-orders')}
              className="hover:opacity-80 font-semibold text-lg"
            >
              MY ORDERS
            </button>
          </nav>

          {/* User Profile */}
          <div className="flex items-center gap-6">
            <div className="relative">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="w-8 h-8 bg-white rounded-full" />
                <div className="flex items-center gap-1">
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-100px)]">
        {/* Header Section */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-8 border-b-4 border-[#8B0000]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/menu')}
              className="text-2xl font-bold text-[#8B0000] hover:opacity-80 transition-opacity hover:scale-110"
            >
              ← Back
            </button>
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">My Basket</h1>
          </div>
        </div>

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow-xl p-16 text-center border-4 border-dashed border-[#8B0000]">
            <div className="text-7xl mb-6">🛒</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Your Basket is Empty</h2>
            <p className="text-gray-500 mb-8 text-lg">Add items from a store to get started</p>
            <button
              onClick={() => navigate('/menu')}
              className="bg-[#8B0000] text-white font-semibold py-4 px-8 rounded-lg hover:bg-red-800 transition-all text-lg shadow-md hover:shadow-lg"
            >
              🏪 Browse Stores
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Basket Items */}
            <div className="lg:col-span-2 space-y-6">
              {Object.entries(groupedByStore).map(([storeId, items]) => {
                const stall = resolveStall(storeId);
                const stallLogo = resolveStallLogo(stall);
                const storeTotal = getStoreTotal(storeId);
                
                return (
                  <div key={storeId} className="bg-white rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden">
                    {/* Store Header */}
                    <div className="bg-[#8B0000] text-white p-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center text-2xl overflow-hidden">
                        {stallLogo ? (
                          <img src={stallLogo} alt={stall.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>🍽️</span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold">{stall.name || 'Store'}</h2>
                    </div>

                    {/* Items */}
                    <div className="p-4">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between py-3 border-b border-gray-200 last:border-0">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            {item.selectedVariation && (
                              <p className="text-xs text-gray-600 mt-1">Variation: {item.selectedVariation}</p>
                            )}
                            {item.riceOptionLabel && (
                              <p className="text-xs text-gray-600 mt-1">Rice: {item.riceOptionLabel}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => decreaseQuantity(item)}
                                className="w-6 h-6 bg-red-500 text-white font-bold rounded hover:bg-red-600 transition-colors text-sm"
                              >
                                −
                              </button>
                              <span className="font-bold text-gray-900 min-w-4 text-center text-sm">{item.quantity || 1}</span>
                              <button
                                onClick={() => increaseQuantity(item)}
                                className="w-6 h-6 bg-green-500 text-white font-bold rounded hover:bg-green-600 transition-colors text-sm"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="text-right mr-4">
                            <p className="text-sm text-gray-600">₱{item.price}</p>
                            <p className="font-bold text-gray-900">₱{(item.price * (item.quantity || 1)).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Store Total */}
                    <div className="bg-gray-50 px-4 py-3 border-t-2 border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900">TOTAL</span>
                        <span className="font-bold text-gray-900 text-lg">₱{storeTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="bg-white px-4 py-3 flex gap-2 border-t border-gray-200">
                      <button
                        onClick={() => handleDeleteStore(storeId)}
                        className="flex-1 px-4 py-2 border-2 border-red-400 text-red-600 font-bold rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Delete Order
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6 sticky top-24 space-y-4">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h3>

                {/* Subtotal */}
                <div className="flex justify-between text-gray-900">
                  <span className="text-sm font-semibold">Subtotal:</span>
                  <span className="text-sm">₱{cartTotal.toFixed(2)}</span>
                </div>

                {/* Total */}
                <div className="bg-[#8B0000] text-white rounded-lg p-4 text-center">
                  <p className="text-sm font-semibold mb-1">TOTAL</p>
                  <p className="text-3xl font-bold">₱{cartTotal.toFixed(2)}</p>
                </div>

                {/* Checkout Button */}
                <button
                  onClick={() => navigate('/checkout')}
                  disabled={cartItems.length === 0}
                  className={`w-full py-3 font-bold rounded-lg transition-colors ${
                    cartItems.length === 0
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : 'bg-[#8B0000] text-white hover:bg-red-800'
                  }`}
                >
                  Checkout
                </button>

                {/* Continue Shopping */}
                <button
                  onClick={() => navigate('/menu')}
                  className="w-full py-2 bg-gray-200 text-gray-900 font-bold rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Cart;
