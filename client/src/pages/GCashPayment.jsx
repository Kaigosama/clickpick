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
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [uploaded, setUploaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [orderId, setOrderId] = useState('');

  // Generate Order ID on mount
  useEffect(() => {
    const id = Math.floor(1000000 + Math.random() * 9000000).toString();
    setOrderId(id);
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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);
      formData.append('customerId', user._id);
      formData.append('amount', cartTotal);
      formData.append('totalAmount', cartTotal);
      
      // Include cart items for order creation
      const orderItems = cartItems.map(item => ({
        menuItemId: item._id,
        name: item.name,
        quantity: item.quantity || 1,
        price: item.price
      }));
      formData.append('items', JSON.stringify(orderItems));

      // Upload proof of payment
      const response = await api.post('/payments/gcash-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploaded(true);
      clearCart(); // Clear cart since order is now created
      alert('Proof of payment uploaded successfully! Waiting for store approval...');
      
      // Wait for store approval (you can implement polling here)
      // For now, navigate to waiting page
      navigate('/payment-waiting', { state: { orderId: orderId } });
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
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-100px)]">
        {/* Header Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-b-4 border-[#8B0000]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/checkout')}
              className="text-2xl font-bold text-[#8B0000] hover:opacity-80 transition-opacity hover:scale-110"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-gray-900">GCash Payment Verification</h1>
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-[#8B0000] space-y-6">
          
          {/* Queue Number Info */}
          <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
            <p className="text-sm font-semibold text-gray-900 mb-1">QUEUE NUMBER</p>
            <p className="text-lg text-gray-600">Will be assigned after upload</p>
          </div>

          {/* GCash Number */}
          <div className="bg-gradient-to-r from-[#8B0000] to-red-700 text-white p-6 rounded-lg shadow-lg">
            <p className="text-sm font-semibold mb-2">Send payment to</p>
            <p className="text-3xl font-bold tracking-wider">09123456789</p>
            <p className="text-sm mt-3 opacity-90">Amount: ₱{cartTotal.toFixed(2)}</p>
          </div>

          {/* Instructions */}
          <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-300 space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Send ₱{cartTotal.toFixed(2)} to the GCash number above</li>
              <li>Screenshot or take a photo of the successful transaction</li>
              <li>Upload the proof of payment below</li>
              <li>Wait for store approval (you'll receive the status via notification)</li>
            </ol>
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
              {/* File Upload */}
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

              {/* Upload Button */}
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
