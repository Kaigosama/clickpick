import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import api from '../services/api.js';

const Checkout = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, cartTotal, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stalls, setStalls] = useState([]);
  const [orderSuccess, setOrderSuccess] = useState(null);

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
  
  // Calculate estimated time based on cart items
  const calculateEstimatedTime = () => {
    const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const baseTime = 5;
    const timePerItem = 3;
    const estimated = baseTime + (totalItems * timePerItem);
    return Math.max(5, Math.min(45, estimated)); // 5-45 minutes range
  };
  
  const estimatedMinutes = calculateEstimatedTime();

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      alert("Cart is empty!");
      return;
    }

    // If GCash is selected, redirect to payment verification
    if (paymentMethod === 'gcash') {
      navigate('/gcash-payment');
      return;
    }

    // For Cash payment, place order directly
    setLoading(true);
    try {
      const orderData = {
        customerId: user._id,
        items: cartItems.map(item => ({
          menuItemId: item._id,
          name: item.name,
          quantity: item.quantity || 1,
          price: item.price
        })),
        totalAmount: cartTotal,
        paymentMethod: paymentMethod
      };

      const response = await api.post('/orders', orderData);
      const newOrder = response.data;
      
      // Show success modal with estimated time
      setOrderSuccess({
        queueNumber: newOrder.queueNumber,
        estimatedTime: newOrder.estimatedTime,
        totalAmount: newOrder.totalAmount
      });
      
      clearCart();
    } catch (err) {
      console.error(err);
      alert("Order Failed: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  // Success Modal
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        {/* Header Navigation */}
        <header className="bg-[#8B0000] text-white shadow-lg fixed top-0 left-0 right-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
              <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
              <span className="text-xl font-bold">ClickPick</span>
            </div>
            <p className="text-lg">Order Confirmation</p>
          </div>
        </header>

        {/* Success Modal */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center mt-20">
          {/* Success Icon */}
          <div className="text-6xl mb-6 animate-bounce">✅</div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h2>
          <p className="text-gray-600 mb-8 text-lg">Your order has been received</p>

          {/* Queue Number */}
          <div className="bg-gradient-to-br from-[#8B0000] to-red-700 rounded-xl p-6 mb-6 text-white">
            <p className="text-sm font-semibold text-red-100 mb-2">QUEUE NUMBER</p>
            <p className="text-5xl font-bold">#{orderSuccess.queueNumber}</p>
          </div>

          {/* Estimated Time */}
          <div className="bg-blue-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
            <p className="text-sm font-semibold text-gray-600 mb-1">ESTIMATED TIME</p>
            <p className="text-4xl font-bold text-blue-600">{orderSuccess.estimatedTime} min</p>
            <p className="text-xs text-gray-500 mt-2">*Actual time may vary based on queue</p>
          </div>

          {/* Total Amount */}
          <div className="bg-gray-50 rounded-lg p-4 mb-8">
            <p className="text-sm text-gray-600 mb-1">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900">₱{orderSuccess.totalAmount?.toFixed(2) || '0.00'}</p>
          </div>

          {/* Note */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8 rounded">
            <p className="text-sm text-gray-700">
              📍 You can track your order status on the <span className="font-bold">MY ORDERS</span> page
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => navigate('/my-orders')}
              className="w-full bg-[#8B0000] text-white font-bold py-3 rounded-lg hover:bg-red-800 transition-all text-lg"
            >
              Track Order
            </button>
            <button
              onClick={() => navigate('/menu')}
              className="w-full bg-gray-200 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-300 transition-all"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header Navigation */}
      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-8">
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
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-b-4 border-[#8B0000]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/basket')}
              className="text-2xl font-bold text-[#8B0000] hover:opacity-80 transition-opacity hover:scale-110"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-gray-900">Checkout</h1>
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
            {/* Checkout Items */}
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
                            <p className="text-sm text-gray-600">₱{item.price}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">x{item.quantity || 1}</p>
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
                  </div>
                );
              })}
            </div>

            {/* Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6 sticky top-24 space-y-4">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h3>

                {/* Total */}
                <div className="bg-[#8B0000] text-white rounded-lg p-4 text-center mb-4">
                  <p className="text-sm font-semibold mb-1">TOTAL</p>
                  <p className="text-3xl font-bold">₱{cartTotal.toFixed(2)}</p>
                </div>

                {/* Mode of Payment */}
                <div className="border-b-2 border-gray-200 pb-4">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    MODE OF PAYMENT
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                  >
                    <option value="cash">CASH</option>
                    <option value="gcash">GCASH</option>
                  </select>
                </div>

                {/* Estimated Time */}
                <div className="border-b-2 border-gray-200 pb-4">
                  <p className="text-sm font-semibold text-gray-900">ESTIMATED TIME</p>
                  <p className="text-lg font-bold text-gray-900">{estimatedMinutes} MINUTES</p>
                  <p className="text-xs text-gray-500 mt-1">*Actual time may vary based on queue</p>
                </div>

                {/* Queue Number Note */}
                <div className="border-b-2 border-gray-200 pb-4">
                  <p className="text-sm font-semibold text-gray-900">QUEUE NUMBER</p>
                  <p className="text-sm text-gray-600">Will be assigned after checkout</p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => navigate('/basket')}
                    className="flex-1 px-4 py-2 border-2 border-gray-400 text-gray-900 font-bold rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handlePlaceOrder}
                    disabled={loading || cartItems.length === 0}
                    className={`flex-1 px-4 py-2 font-bold rounded-lg transition-colors ${
                      loading || cartItems.length === 0
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-[#8B0000] text-white hover:bg-red-800'
                    }`}
                  >
                    {loading ? 'Processing...' : 'Checkout'}
                  </button>
                </div>

                {/* Back to Shopping */}
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

export default Checkout;
