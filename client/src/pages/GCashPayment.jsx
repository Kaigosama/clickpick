import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import api from '../services/api.js';

const GCashPayment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const { cartItems, cartTotal, clearCart } = useCart();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [uploaded, setUploaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const [gcashNumber, setGcashNumber] = useState('Not available');

  const resolveStoreId = (item) => {
    const rawStoreId = item?.stallId ?? item?.stall;
    if (rawStoreId && typeof rawStoreId === 'object') {
      return String(rawStoreId._id || rawStoreId.id || rawStoreId.stallId || '');
    }
    return String(rawStoreId || '');
  };

  useEffect(() => {
    const fetchGcashNumber = async () => {
      try {
        const res = await api.get('/auth/stalls');
        const list = Array.isArray(res.data) ? res.data : res.data?.stalls || [];

        const firstCartItem = cartItems[0];
        const targetStallId = String(location.state?.stallId || resolveStoreId(firstCartItem));
        const stall = list.find((entry) => String(entry._id) === targetStallId);

        if (stall?.gcashNumber && String(stall.gcashNumber).trim()) {
          setGcashNumber(String(stall.gcashNumber).trim());
          return;
        }

        setGcashNumber('Not available');
      } catch (err) {
        console.error('Error fetching stalls for GCash number:', err);
        setGcashNumber('Not available');
      }
    };

    fetchGcashNumber();
  }, [cartItems, location.state]);

  useEffect(() => {
    if (timeLeft <= 0 || uploaded) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, uploaded]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a photo');
      return;
    }

    if (timeLeft <= 0) {
      alert('Time limit exceeded! Please go back and try again.');
      return;
    }

    const storeIdsInCart = Array.from(new Set(cartItems.map((item) => resolveStoreId(item)).filter(Boolean)));
    if (storeIdsInCart.length > 1) {
      alert('Please place separate orders per store. Your cart currently has items from multiple stores.');
      navigate('/checkout');
      return;
    }

    const selectedStallId = String(location.state?.stallId || storeIdsInCart[0] || '');

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('customerId', user._id);
      formData.append('stallId', selectedStallId);
      formData.append('amount', cartTotal);
      formData.append('totalAmount', cartTotal);

      const orderItems = cartItems.map((item) => ({
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

      setUploaded(true);
      clearCart();
      alert('Proof of payment uploaded successfully! Waiting for store approval...');

      navigate('/payment-waiting', {
        state: {
          orderId: response.data?.orderId,
          orderDbId: response.data?.orderDbId
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

      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

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
                    onClick={() => {
                      navigate('/menu');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Stores
                  </button>
                  <button
                    onClick={() => {
                      navigate('/my-orders');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    My Orders
                  </button>
                  <button
                    onClick={() => {
                      navigate('/order-history');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Order History
                  </button>
                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowMobileNavMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileNavMenu(false);
                      handleLogout();
                    }}
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
                <div className="w-8 h-8 bg-white rounded-full" />
                <div className="flex items-center gap-1">
                  <p className="font-semibold text-sm uppercase">{user?.name || 'User'}</p>
                  <p className="text-xs">▼</p>
                </div>
              </button>

              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-48">
                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowProfileMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleLogout();
                    }}
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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-100px)]">
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

        <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-[#8B0000] space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
            <p className="text-sm font-semibold text-gray-900 mb-1">QUEUE NUMBER</p>
            <p className="text-lg text-gray-600">Will be assigned after upload</p>
          </div>

          <div className="bg-gradient-to-r from-[#8B0000] to-red-700 text-white p-6 rounded-lg shadow-lg">
            <p className="text-sm font-semibold mb-2">Send payment to</p>
            <p className="text-3xl font-bold tracking-wider">{gcashNumber}</p>
            <p className="text-sm mt-3 opacity-90">Amount: ₱{cartTotal.toFixed(2)}</p>
          </div>

          <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-300 space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Send ₱{cartTotal.toFixed(2)} to the GCash number above</li>
              <li>Screenshot or take a photo of the successful transaction</li>
              <li>Upload the proof of payment below</li>
              <li>Wait for store approval (you&apos;ll receive the status via notification)</li>
            </ol>
          </div>

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
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-900">
                  Upload Proof of Payment
                </label>
                <div className="border-2 border-dashed border-[#8B0000] rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={uploading || uploaded}
                    className="block mx-auto"
                  />
                  {file && (
                    <p className="text-sm text-green-600 font-semibold mt-2">
                      ✓ {file.name}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading || !file || uploaded}
                className={`w-full py-3 font-bold rounded-lg transition-colors text-lg ${
                  uploading || !file || uploaded
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-[#8B0000] text-white hover:bg-red-800'
                }`}
              >
                {uploading ? 'Uploading...' : uploaded ? 'Uploaded' : 'Upload Proof of Payment'}
              </button>
            </>
          )}
        </div>

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
