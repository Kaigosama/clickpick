import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';
import api from '../services/api.js';

const ACTIVE_GCASH_ORDER_KEY = 'activeGcashOrderId';
const ACTIVE_GCASH_EXPIRES_AT_KEY = 'activeGcashPaymentExpiresAt';

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const PaymentWaiting = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [orderId, setOrderId] = useState('');
  const [orderNumber, setOrderNumber] = useState(null);
  const [queueNumber, setQueueNumber] = useState(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(null);
  const [isResolvingSession, setIsResolvingSession] = useState(true);
  const [status, setStatus] = useState('waiting');

  useEffect(() => {
    let isMounted = true;

    const resolveOrderId = async () => {
      try {
        const fromState = String(location.state?.orderId || '').trim();
        if (fromState) {
          localStorage.setItem(ACTIVE_GCASH_ORDER_KEY, fromState);
          if (location.state?.expiresAt) {
            localStorage.setItem(ACTIVE_GCASH_EXPIRES_AT_KEY, String(location.state.expiresAt));
          }
          if (isMounted) {
            setOrderId(fromState);
            setIsResolvingSession(false);
          }
          return;
        }

        const fromStorage = String(localStorage.getItem(ACTIVE_GCASH_ORDER_KEY) || '').trim();
        if (fromStorage) {
          const statusRes = await api.get(`/payments/gcash-status/${fromStorage}`).catch(() => null);
          const statusValue = String(statusRes?.data?.status || '').toLowerCase();

          if (statusValue) {
            if (isMounted) {
              setOrderId(fromStorage);
              setOrderNumber(statusRes?.data?.orderNumber || null);
              setQueueNumber(statusRes?.data?.queueNumber || null);
              setTimeLeftSeconds(
                Number.isFinite(statusRes?.data?.timeRemainingSeconds)
                  ? statusRes.data.timeRemainingSeconds
                  : null
              );
              setIsResolvingSession(false);
            }
            return;
          }

          localStorage.removeItem(ACTIVE_GCASH_ORDER_KEY);
          localStorage.removeItem(ACTIVE_GCASH_EXPIRES_AT_KEY);
        }

        const response = await api.get('/payments/gcash-active-session');
        const activeOrderId = String(response?.data?.orderId || '').trim();

        if (response?.data?.hasActiveSession && activeOrderId) {
          localStorage.setItem(ACTIVE_GCASH_ORDER_KEY, activeOrderId);
          if (response?.data?.expiresAt) {
            localStorage.setItem(ACTIVE_GCASH_EXPIRES_AT_KEY, String(response.data.expiresAt));
          }

          if (isMounted) {
            setOrderId(activeOrderId);
            setOrderNumber(response?.data?.orderNumber || null);
            setQueueNumber(response?.data?.queueNumber || null);
            setTimeLeftSeconds(
              Number.isFinite(response?.data?.timeRemainingSeconds)
                ? response.data.timeRemainingSeconds
                : null
            );
          }
        } else if (isMounted) {
          setStatus('no_active_session');
        }
      } catch (err) {
        console.error('Failed to resolve active GCash session:', err);
        if (isMounted) {
          setStatus('no_active_session');
        }
      } finally {
        if (isMounted) {
          setIsResolvingSession(false);
        }
      }
    };

    resolveOrderId();

    return () => {
      isMounted = false;
    };
  }, [location.state]);

  useEffect(() => {
    if (timeLeftSeconds === null || timeLeftSeconds <= 0 || status !== 'waiting') {
      return undefined;
    }

    const countdownId = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev === null) return null;
        return Math.max(0, prev - 1);
      });
    }, 1000);

    return () => clearInterval(countdownId);
  }, [timeLeftSeconds, status]);

  useEffect(() => {
    if (!orderId) return undefined;

    let intervalId;

    const pollStatus = async () => {
      try {
        const response = await api.get(`/payments/gcash-status/${orderId}`);
        const remoteStatus = String(response?.data?.status || '').toLowerCase();
        const remoteOrderNumber = response?.data?.orderNumber;
        const remoteQueueNumber = response?.data?.queueNumber;
        const remoteTimeLeft = response?.data?.timeRemainingSeconds;
        const remoteRejectionReason = String(response?.data?.rejectionReason || '').toLowerCase();

        if (response?.data?.expiresAt) {
          localStorage.setItem(ACTIVE_GCASH_EXPIRES_AT_KEY, String(response.data.expiresAt));
        }

        if (remoteOrderNumber) {
          setOrderNumber(remoteOrderNumber);
        }

        if (remoteQueueNumber) {
          setQueueNumber(remoteQueueNumber);
        }

        if (Number.isFinite(remoteTimeLeft)) {
          setTimeLeftSeconds(remoteTimeLeft);
        }

        if (remoteStatus === 'approved') {
          localStorage.removeItem(ACTIVE_GCASH_ORDER_KEY);
          localStorage.removeItem(ACTIVE_GCASH_EXPIRES_AT_KEY);
          setStatus('approved');
          if (intervalId) clearInterval(intervalId);

          setTimeout(() => {
            alert('Payment approved! Your order has been placed.');
            navigate('/my-orders');
          }, 2000);
        } else if (remoteStatus === 'rejected') {
          localStorage.removeItem(ACTIVE_GCASH_ORDER_KEY);
          localStorage.removeItem(ACTIVE_GCASH_EXPIRES_AT_KEY);
          setStatus('rejected');
          if (intervalId) clearInterval(intervalId);

          if (remoteRejectionReason === 'payment_timeout') {
            alert('Payment window expired. Your order was automatically cancelled.');
          }
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

  if (isResolvingSession) {
    return (
      <div className="min-h-screen bg-gray-100">
        <CustomerHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 min-h-[calc(100vh-100px)] flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-blue-300 w-full">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Checking your payment session...</h1>
            <p className="text-gray-600">Please wait.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <CustomerHeader />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 min-h-[calc(100vh-100px)] flex items-center justify-center">
        {status === 'no_active_session' && (
          <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-12 text-center border-4 border-gray-300 w-full">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">No Active GCash Payment</h1>
            <p className="text-gray-600 mb-8">
              You currently have no pending GCash payment processing session.
            </p>
            <button
              onClick={() => navigate('/my-orders')}
              className="px-8 py-3 bg-[#8B0000] text-white font-bold rounded-lg hover:bg-red-800 transition-colors text-lg"
            >
              Go to My Orders
            </button>
          </div>
        )}

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
            {timeLeftSeconds !== null && (
              <div className={`mb-6 p-4 rounded-lg border-2 ${timeLeftSeconds <= 60 ? 'bg-red-50 border-red-400' : 'bg-blue-50 border-blue-300'}`}>
                <p className="text-sm font-semibold text-gray-900">Time remaining</p>
                <p className={`text-3xl font-bold ${timeLeftSeconds <= 60 ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatTime(timeLeftSeconds)}
                </p>
              </div>
            )}
            <div className="flex justify-center gap-2 mb-8">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
            <p className="text-sm text-gray-500">You can reopen this page while the timer is still active.</p>
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
                onClick={() => navigate('/cart')}
                className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Cart
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
