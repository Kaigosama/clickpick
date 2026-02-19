import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import api from '../services/api.js';

const GCashPayment = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, clearCart } = useCart();
  const [uploading, setUploading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [uploaded, setUploaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const [stalls, setStalls] = useState([]);
  const [filesByStore, setFilesByStore] = useState({});
  const groupedByStore = cartItems.reduce((acc, item) => {
    const storeId = item.stall || item.stallId || 'unknown';
    if (!acc[storeId]) {
      acc[storeId] = [];
    }
    acc[storeId].push(item);
    return acc;
  }, {});
  const storesInCart = Object.entries(groupedByStore).map(([storeId, items]) => {
    const stall = stalls.find((entry) => String(entry._id) === String(storeId));
    return {
      storeId,
      storeName: stall?.name || 'Store',
      gcashNumber: String(stall?.gcashNumber || '').trim(),
      items,
      totalAmount: items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0)
    };
  });
  const hasMissingGcashNumber = storesInCart.some((store) => !store.gcashNumber);
  const allProofsUploaded = storesInCart.length > 0 && storesInCart.every((store) => Boolean(filesByStore[store.storeId]));
  const overallTotal = storesInCart.reduce((sum, store) => sum + store.totalAmount, 0);

  useEffect(() => {
    const fetchStalls = async () => {
      try {
        const res = await api.get('/auth/stalls');
        const list = Array.isArray(res.data) ? res.data : res.data?.stalls || [];
        setStalls(list);
      } catch (err) {
        console.error('Error fetching stalls for GCash numbers:', err);
        setStalls([]);
      }
    };

    fetchStalls();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0 || uploaded) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, uploaded]);

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFileChange = (storeId, e) => {
    const selectedFile = e.target.files?.[0] || null;
    setFilesByStore((prev) => ({
      ...prev,
      [storeId]: selectedFile
    }));
  };

  const handleUpload = async () => {
    if (!storesInCart.length) {
      alert('Your cart is empty.');
      return;
    }

    if (timeLeft <= 0) {
      alert('Time limit exceeded! Please go back and try again.');
      return;
    }

    if (hasMissingGcashNumber) {
      alert('GCash is unavailable for one or more stores in your cart.');
      navigate('/checkout');
      return;
    }

    if (!allProofsUploaded) {
      alert('Please upload proof of payment for each store.');
      return;
    }

    setUploading(true);
    try {
      const uploadResponses = [];

      for (const store of storesInCart) {
        const formData = new FormData();
        formData.append('file', filesByStore[store.storeId]);
        formData.append('customerId', user._id);
        formData.append('amount', store.totalAmount);
        formData.append('totalAmount', store.totalAmount);

        const orderItems = store.items.map((item) => ({
          menuItemId: item._id,
          name: item.name,
          variation: item.selectedVariation || '',
          riceOption: item.selectedRiceOption || '',
          quantity: item.quantity || 1,
          price: item.price
        }));

        formData.append('items', JSON.stringify(orderItems));

        const response = await api.post('/payments/gcash-upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        uploadResponses.push(response?.data || {});
      }

      const orderContexts = uploadResponses
        .map((entry, index) => ({
          orderId: entry?.orderId,
          storeId: storesInCart[index]?.storeId,
          storeName: storesInCart[index]?.storeName || 'Store'
        }))
        .filter((entry) => Boolean(entry.orderId));

      const orderIds = orderContexts.map((entry) => entry.orderId);

      setUploaded(true);
      clearCart();
      alert('Proof of payment uploaded successfully! Waiting for store approval...');

      navigate('/payment-waiting', {
        state: {
          orderId: orderIds[0] || '',
          orderIds,
          orderContexts
        }
      });
    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {showMobileNavMenu && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setShowMobileNavMenu(false)}
          className="sm:hidden fixed inset-0 z-[45] bg-transparent"
        />
      )}

      {/* Header Navigation */}
      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-3 sm:gap-8 text-sm sm:text-base">
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
                      navigate('/menu');
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-100px)]">
        {/* Header Section */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-8 border-b-4 border-[#8B0000]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/checkout')}
              className="text-2xl font-bold text-[#8B0000] hover:opacity-80 transition-opacity hover:scale-110"
            >
              ← Back
            </button>
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">GCash Payment Verification</h1>
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-[#8B0000] space-y-6">
          
          {/* Queue Number Info */}
          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
            <p className="text-sm font-semibold text-gray-900 mb-1">QUEUE NUMBER</p>
            <p className="text-lg text-gray-600">Assigned per store after each upload</p>
          </div>

          {/* Instructions */}
          <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-300 space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Send payment to each store&apos;s GCash number below.</li>
              <li>Upload one proof of payment per store.</li>
              <li>Total checkout amount: ₱{overallTotal.toFixed(2)}</li>
              <li>Wait for each store&apos;s approval after upload.</li>
            </ol>
          </div>

          <div className="space-y-4">
            {storesInCart.map((store) => (
              <div key={store.storeId} className="rounded-lg border-2 border-gray-200 p-5 bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <p className="text-lg font-bold text-gray-900">{store.storeName}</p>
                  <p className="text-sm font-semibold text-gray-700">Amount: ₱{store.totalAmount.toFixed(2)}</p>
                </div>

                <div className="bg-gradient-to-r from-[#8B0000] to-red-700 text-white p-4 rounded-lg mb-4">
                  <p className="text-xs font-semibold mb-1">Send payment to</p>
                  <p className="text-2xl font-bold tracking-wide">{store.gcashNumber || 'Not available'}</p>
                </div>

                <label className="block text-sm font-semibold text-gray-900 mb-2">Upload proof for {store.storeName}</label>
                <div className="border-2 border-dashed border-[#8B0000] rounded-lg p-4 text-center hover:bg-white transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(store.storeId, e)}
                    disabled={uploading || uploaded || !store.gcashNumber}
                    className="block mx-auto"
                  />
                  {filesByStore[store.storeId] && (
                    <p className="text-sm text-green-600 font-semibold mt-2">
                      ✓ {filesByStore[store.storeId].name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Timer */}
          <div className={`p-4 rounded-lg text-center ${
            timeLeft <= 60 ? 'bg-red-100 border-2 border-red-500' : 'bg-green-100 border-2 border-green-500'
          }`}>
            <p className="text-sm font-semibold text-gray-900">Time remaining to upload</p>
            <p className={`text-4xl font-bold ${timeLeft <= 60 ? 'text-red-600' : 'text-green-600'}`}>
              {formatTime(timeLeft)}
            </p>
          </div>

          {timeLeft <= 0 && !uploaded ? (
            <div className="bg-red-100 p-6 rounded-lg border-2 border-red-500 text-center">
              <p className="text-lg font-bold text-red-600">Time limit exceeded!</p>
              <p className="text-gray-700 mt-2">Please go back and try again.</p>
              <button
                onClick={() => navigate('/checkout')}
                className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
              >
                Back to Checkout
              </button>
            </div>
          ) : (
            <>
              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={uploading || uploaded || hasMissingGcashNumber || !allProofsUploaded || storesInCart.length === 0}
                className={`w-full py-3 font-bold rounded-lg transition-colors text-lg ${
                  uploading || uploaded || hasMissingGcashNumber || !allProofsUploaded || storesInCart.length === 0
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-[#8B0000] text-white hover:bg-red-800'
                }`}
              >
                {uploading ? 'Uploading...' : uploaded ? 'Uploaded' : `Upload Proof${storesInCart.length > 1 ? 's' : ''} of Payment`}
              </button>
            </>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-6">
          <button
            onClick={() => navigate('/checkout')}
            className="w-full py-2 bg-gray-200 text-gray-900 font-bold rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </main>
    </div>
  );
};

export default GCashPayment;
