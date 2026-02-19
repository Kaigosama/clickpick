import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import api from '../services/api.js';

const PaymentWaiting = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [orderId] = useState(location.state?.orderId || '');
  const [queueNumber, setQueueNumber] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [status, setStatus] = useState('waiting'); // waiting, approved, rejected

  useEffect(() => {
    let intervalId;

    // Poll for approval status
    const pollStatus = async () => {
      try {
        const response = await api.get(`/payments/gcash-status/${orderId}`);
        const remoteStatus = response?.data?.status;
        const remoteQueueNumber = response?.data?.queueNumber;

        // Store queue number if we got it
        if (remoteQueueNumber) {
          setQueueNumber(remoteQueueNumber);
        }

        // Ignore invalid/empty statuses and keep showing the waiting UI
        if (!remoteStatus || !['waiting', 'approved', 'rejected'].includes(remoteStatus)) {
          return;
        }

        if (remoteStatus === 'approved') {
          setStatus('approved');
          if (intervalId) clearInterval(intervalId);

          // Order approved, navigate to my orders
          setTimeout(() => {
            alert('Payment approved! Your order has been placed.');
            navigate('/my-orders');
          }, 2000);

        } else if (remoteStatus === 'rejected') {
          setStatus('rejected');
          if (intervalId) clearInterval(intervalId);
        } else {
          setStatus('waiting');
        }

      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Poll immediately, then every 3 seconds
    pollStatus();
    intervalId = setInterval(pollStatus, 3000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId, navigate]);

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
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 min-h-[calc(100vh-100px)] flex items-center justify-center">
        {status === 'waiting' && (
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-blue-300 w-full">
            <div className="text-6xl mb-6 animate-bounce">⏳</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Payment Under Review</h1>
            <p className="text-gray-600 text-lg mb-4">
              Queue #: <span className="font-bold text-blue-600">{queueNumber || 'Pending...'}</span>
            </p>
            <p className="text-gray-600 mb-8">
              Your proof of payment has been received. The store is reviewing your payment. This usually takes a few minutes.
            </p>
            <div className="flex justify-center gap-2 mb-8">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
            <p className="text-sm text-gray-500">Please do not close this page</p>
          </div>
        )}

        {status === 'approved' && (
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-green-500 w-full">
            <div className="text-6xl mb-6">✓</div>
            <h1 className="text-3xl font-bold text-green-600 mb-3">Payment Approved!</h1>
            <p className="text-gray-600 text-lg mb-4">
              Queue #: <span className="font-bold text-green-600">{queueNumber || 'Assigned'}</span>
            </p>
            <p className="text-gray-600 mb-8">
              Your payment has been verified. Your order is now being prepared.
            </p>
            <button
              onClick={() => navigate('/my-orders')}
              className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors text-lg"
            >
              View My Orders
            </button>
          </div>
        )}

        {status === 'rejected' && (
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-red-500 w-full">
            <div className="text-6xl mb-6">✕</div>
            <h1 className="text-3xl font-bold text-red-600 mb-3">Payment Rejected</h1>
            <p className="text-gray-600 text-lg mb-4">
              Queue #: <span className="font-bold text-red-600">{queueNumber || 'N/A'}</span>
            </p>
            <p className="text-gray-600 mb-8">
              Your payment could not be verified. Please contact the store or try again.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/checkout')}
                className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Checkout
              </button>
              <button
                onClick={() => navigate('/my-orders')}
                className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
              >
                My Orders
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PaymentWaiting;
