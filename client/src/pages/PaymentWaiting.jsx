import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import api from '../services/api.js';

const PaymentWaiting = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [orderId] = useState(location.state?.orderId || '');
  const [orderNumber, setOrderNumber] = useState(null);
  const [queueNumber, setQueueNumber] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const [status, setStatus] = useState('waiting');

  useEffect(() => {
    let intervalId;

    const pollStatus = async () => {
      try {
        if (!orderId) return;

        const response = await api.get(`/payments/gcash-status/${orderId}`);
        const remoteStatus = String(response?.data?.status || '').toLowerCase();
        const remoteOrderNumber = response?.data?.orderNumber;
        const remoteQueueNumber = response?.data?.queueNumber;

        if (remoteOrderNumber) {
          setOrderNumber(remoteOrderNumber);
        }

        if (remoteQueueNumber) {
          setQueueNumber(remoteQueueNumber);
        }

        if (remoteStatus === 'approved') {
          setStatus('approved');
          if (intervalId) clearInterval(intervalId);

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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 min-h-[calc(100vh-100px)] flex items-center justify-center">
        {status === 'waiting' && (
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-blue-300 w-full">
            <div className="text-6xl mb-6 animate-bounce">⏳</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Payment Under Review</h1>
            <p className="text-gray-600 text-lg mb-4">
              Order #: <span className="font-bold text-blue-600">{orderNumber || 'Pending...'}</span>
            </p>
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
              Order #: <span className="font-bold text-green-600">{orderNumber || 'Assigned'}</span>
            </p>
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
              Order #: <span className="font-bold text-red-600">{orderNumber || 'N/A'}</span>
            </p>
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
