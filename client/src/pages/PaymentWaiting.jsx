import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';
import api from '../services/api.js';

const PaymentWaiting = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [orderId] = useState(location.state?.orderId || '');
  const [orderNumber, setOrderNumber] = useState(null);
  const [queueNumber, setQueueNumber] = useState(null);
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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <CustomerHeader />

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
