import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';

const ACTIVE_GCASH_ORDER_KEY = 'activeGcashOrderId';
const ACTIVE_GCASH_EXPIRES_AT_KEY = 'activeGcashPaymentExpiresAt';
const ACTIVE_GCASH_DRAFT_KEY = 'activeGcashDraftSession';

const MyOrders = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { cartItems } = useCart();
  const serverBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  const [orders, setOrders] = useState([]);
  const [queueOrdersByStore, setQueueOrdersByStore] = useState({});
  const [loading, setLoading] = useState(true);
  const [showQueue, setShowQueue] = useState(true);
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [activeGcashSession, setActiveGcashSession] = useState(null);
  const [draftGcashSession, setDraftGcashSession] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_GCASH_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.expiresAt) return;

      const remainingMs = new Date(parsed.expiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        localStorage.removeItem(ACTIVE_GCASH_DRAFT_KEY);
        return;
      }

      setDraftGcashSession(parsed);
    } catch (err) {
      localStorage.removeItem(ACTIVE_GCASH_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const storedOrderId = String(localStorage.getItem(ACTIVE_GCASH_ORDER_KEY) || '').trim();
    const storedExpiresAt = String(localStorage.getItem(ACTIVE_GCASH_EXPIRES_AT_KEY) || '').trim();

    if (!storedOrderId) {
      return;
    }

    setActiveGcashSession((prev) => {
      if (prev?.orderId && String(prev.orderId) === storedOrderId) {
        return prev;
      }

      return {
        hasActiveSession: true,
        orderId: storedOrderId,
        orderNumber: null,
        queueNumber: null,
        expiresAt: storedExpiresAt || null
      };
    });
  }, []);

  useEffect(() => {
    if (!user) navigate('/');
    
    const fetchOrders = async () => {
      // Fetch user's orders
      try {
        const [ordersRes, activeSessionRes] = await Promise.all([
          api.get(`/orders/${user?._id}`),
          api.get('/payments/gcash-active-session').catch(() => ({ data: { hasActiveSession: false } }))
        ]);

        const userOrders = ordersRes.data || [];
        setOrders(userOrders);

        if (activeSessionRes?.data?.hasActiveSession) {
          setActiveGcashSession(activeSessionRes.data);
          setDraftGcashSession(null);
          localStorage.removeItem(ACTIVE_GCASH_DRAFT_KEY);
          localStorage.setItem(ACTIVE_GCASH_ORDER_KEY, String(activeSessionRes.data.orderId || ''));
          if (activeSessionRes.data.expiresAt) {
            localStorage.setItem(ACTIVE_GCASH_EXPIRES_AT_KEY, String(activeSessionRes.data.expiresAt));
          }
        } else {
          const storedOrderId = String(localStorage.getItem(ACTIVE_GCASH_ORDER_KEY) || '').trim();

          if (storedOrderId) {
            const fallbackStatusRes = await api
              .get(`/payments/gcash-status/${storedOrderId}`)
              .catch(() => null);

            const fallbackStatus = String(fallbackStatusRes?.data?.status || '').toLowerCase();
            if (fallbackStatus === 'pending') {
              setActiveGcashSession({
                hasActiveSession: true,
                orderId: storedOrderId,
                orderNumber: fallbackStatusRes?.data?.orderNumber,
                queueNumber: fallbackStatusRes?.data?.queueNumber,
                expiresAt: fallbackStatusRes?.data?.expiresAt,
                timeRemainingSeconds: fallbackStatusRes?.data?.timeRemainingSeconds
              });

              if (fallbackStatusRes?.data?.expiresAt) {
                localStorage.setItem(ACTIVE_GCASH_EXPIRES_AT_KEY, String(fallbackStatusRes.data.expiresAt));
              }
            } else {
              localStorage.removeItem(ACTIVE_GCASH_ORDER_KEY);
              localStorage.removeItem(ACTIVE_GCASH_EXPIRES_AT_KEY);
              setActiveGcashSession(null);
            }
          } else {
            setActiveGcashSession(null);
          }
        }

        const activeUserOrders = userOrders.filter((order) => {
          const status = String(order?.status || '').toLowerCase();
          return !isPendingGcashPayment(order) && (status === 'pending' || status === 'preparing');
        });

        const resolveOrderStallId = (order) => {
          if (typeof order?.stallId === 'string') return order.stallId;
          if (order?.stallId?._id) return String(order.stallId._id);
          const fallbackStallId = order?.items?.find((item) => item?.menuItemId?.stallId?._id)?.menuItemId?.stallId?._id;
          return fallbackStallId ? String(fallbackStallId) : '';
        };

        const activeStoreIds = Array.from(new Set(activeUserOrders
          .map((order) => resolveOrderStallId(order))
          .filter(Boolean)));

        if (!activeStoreIds.length) {
          setQueueOrdersByStore({});
          setLoading(false);
          return;
        }

        const queueResponses = await Promise.all(
          activeStoreIds.map(async (storeId) => {
            const queueRes = await api.get(`/orders?stallId=${storeId}`);
            const queueOrders = (queueRes.data || [])
              .filter((queueOrder) => {
                const status = String(queueOrder?.status || '').toLowerCase();
                return !isPendingGcashPayment(queueOrder) && (status === 'pending' || status === 'preparing');
              })
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            return [storeId, queueOrders];
          })
        );

        setQueueOrdersByStore(Object.fromEntries(queueResponses));
      } catch (err) {
        console.error(err);
        const storedOrderId = String(localStorage.getItem(ACTIVE_GCASH_ORDER_KEY) || '').trim();
        if (!storedOrderId) {
          setActiveGcashSession(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();

    // Poll for updates every 3 seconds (Real-time effect)
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const handleCancelOrder = async (order) => {
    const currentStatus = String(order?.status || '').toLowerCase();

    if (currentStatus === 'preparing') {
      alert('This order is already preparing and can no longer be cancelled.');
      return;
    }

    if (currentStatus !== 'pending') {
      return;
    }

    const confirmed = window.confirm('Cancel this order?');
    if (!confirmed) {
      return;
    }

    setCancellingOrderId(order._id);
    try {
      const response = await api.put(`/orders/${order._id}`, { status: 'cancelled', cancellationReason: 'manual_cancel' });
      const updated = response.data;

      setOrders((prev) => prev.map((entry) => (entry._id === order._id ? { ...entry, ...updated } : entry)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancellingOrderId('');
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'preparing': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'refund_processing': return 'bg-yellow-100 text-yellow-700';
      case 'refund_complete': return 'bg-green-100 text-green-800';
      case 'payment_rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isPendingGcashPayment = (order) => (
    String(order?.paymentMethod || '').toLowerCase() === 'gcash'
    && String(order?.paymentStatus || '').toLowerCase() === 'pending'
    && String(order?.status || '').toLowerCase() === 'pending'
  );

  const getDisplayStatus = (order) => {
    const status = String(order?.status || '').toLowerCase();
    const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    const refundStatus = String(order?.refundStatus || '').toLowerCase();

    if (paymentMethod === 'gcash') {
      if (paymentStatus === 'rejected') return 'PAYMENT REJECTED';
      if (paymentStatus === 'pending' && status === 'pending') return 'PAYMENT PENDING';

      const hasRefundFlow =
        status === 'cancelled' && ['pending', 'proof_sent', 'confirmed'].includes(refundStatus);
      if (hasRefundFlow) {
        return refundStatus === 'confirmed' ? 'REFUND COMPLETE' : 'REFUND PROCESSING';
      }
    }

    return status ? status.toUpperCase() : 'PENDING';
  };

  const getStatusBadgeTone = (order) => {
    const status = String(order?.status || '').toLowerCase();
    const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    const refundStatus = String(order?.refundStatus || '').toLowerCase();

    if (paymentStatus === 'rejected') return 'payment_rejected';

    const hasRefundFlow =
      paymentMethod === 'gcash' &&
      status === 'cancelled' &&
      ['pending', 'proof_sent', 'confirmed'].includes(refundStatus);

    if (hasRefundFlow) {
      return refundStatus === 'confirmed' ? 'refund_complete' : 'refund_processing';
    }

    return status;
  };

  const isHistoryOrder = (order) => {
    const status = String(order?.status || '').toLowerCase();
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    return status === 'completed' || status === 'cancelled' || paymentStatus === 'rejected';
  };

  const activeOrders = orders.filter((order) => !isHistoryOrder(order));

  const getStoreName = (order) => {
    if (order?.storeName) return order.storeName;
    if (typeof order?.stallId === 'object' && order?.stallId?.name) return order.stallId.name;
    return 'Store';
  };

  const resolveOrderStallId = (order) => {
    if (typeof order?.stallId === 'string') return order.stallId;
    if (order?.stallId?._id) return String(order.stallId._id);
    const fallbackStallId = order?.items?.find((item) => item?.menuItemId?.stallId?._id)?.menuItemId?.stallId?._id;
    return fallbackStallId ? String(fallbackStallId) : '';
  };

  const getQueueGroups = () => {
    const activeUserOrders = orders
      .filter((order) => {
        const status = String(order?.status || '').toLowerCase();
        return !isPendingGcashPayment(order) && (status === 'pending' || status === 'preparing');
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const groupedUserOrders = activeUserOrders.reduce((acc, order) => {
      const storeId = resolveOrderStallId(order);
      if (!storeId) return acc;
      if (!acc[storeId]) acc[storeId] = [];
      acc[storeId].push(order);
      return acc;
    }, {});

    return Object.entries(groupedUserOrders)
      .map(([storeId, userStoreOrders]) => {
        const queueOrders = queueOrdersByStore[storeId] || [];
        if (!queueOrders.length) return null;

        const queuedUserOrders = userStoreOrders
          .filter((order) => Number(order?.queueNumber || 0) > 0)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        if (!queuedUserOrders.length) {
          return null;
        }

        const firstUserOrder = queuedUserOrders[0];
        const positionIndex = queueOrders.findIndex((order) => String(order._id) === String(firstUserOrder._id));
        const position = positionIndex >= 0 ? positionIndex + 1 : null;
        if (!position) {
          return null;
        }

        const userOrderIds = new Set(queuedUserOrders.map((order) => String(order._id)));

        return {
          storeId,
          storeName: getStoreName(firstUserOrder),
          queueOrders,
          userOrderIds,
          position,
          total: queueOrders.length
        };
      })
      .filter(Boolean);
  };

  const queueGroups = getQueueGroups();

  const getGraceTimeLeft = (order) => {
    if (order?.status?.toLowerCase() !== 'ready' || !order?.gracePeriodExpiresAt) {
      return null;
    }

    const remaining = new Date(order.gracePeriodExpiresAt).getTime() - currentTime;
    return Math.max(0, remaining);
  };

  const formatGraceTime = (remainingMs) => {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const getActiveGcashTimeLeftMs = () => {
    if (!activeGcashSession?.expiresAt) {
      return null;
    }

    const remaining = new Date(activeGcashSession.expiresAt).getTime() - currentTime;
    return Math.max(0, remaining);
  };

  const getDraftGcashTimeLeftMs = () => {
    if (!draftGcashSession?.expiresAt) return null;
    const remaining = new Date(draftGcashSession.expiresAt).getTime() - currentTime;
    return Math.max(0, remaining);
  };

  useEffect(() => {
    const remaining = getDraftGcashTimeLeftMs();
    if (remaining === null) return;
    if (remaining <= 0) {
      setDraftGcashSession(null);
      localStorage.removeItem(ACTIVE_GCASH_DRAFT_KEY);
    }
  }, [currentTime, draftGcashSession]);

  return (
    <div className="min-h-screen bg-gray-100">
      <CustomerHeader activePage="my-orders" />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">My Orders</h1>
          <p className="text-gray-600">Track your active order status in real-time</p>
        </div>

        {activeGcashSession && (
          <div className="mb-8 bg-white border-2 border-blue-300 rounded-lg shadow p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-700">Active GCash Payment</p>
                <h2 className="text-xl font-bold text-gray-900">Payment Processing In Progress</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Order #{activeGcashSession.orderNumber || 'Pending'} • Queue #{activeGcashSession.queueNumber || 'Pending'}
                </p>
                {getActiveGcashTimeLeftMs() !== null && (
                  <p className="text-sm font-semibold text-blue-700 mt-2">
                    Time left: {formatGraceTime(getActiveGcashTimeLeftMs())}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate('/payment-waiting', { state: { orderId: activeGcashSession.orderId, expiresAt: activeGcashSession.expiresAt } })}
                className="bg-[#8B0000] text-white font-semibold py-2 px-5 rounded-lg hover:bg-red-800 transition-all"
              >
                Open Payment Page
              </button>
            </div>
          </div>
        )}

        {!activeGcashSession && draftGcashSession && (
          <div className="mb-8 bg-white border-2 border-amber-300 rounded-lg shadow p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-700">GCash Payment In Progress</p>
                <h2 className="text-xl font-bold text-gray-900">Complete your payment upload</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Your payment window is still active.
                </p>
                {getDraftGcashTimeLeftMs() !== null && (
                  <p className="text-sm font-semibold text-amber-700 mt-2">
                    Time left: {formatGraceTime(getDraftGcashTimeLeftMs())}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate('/gcash-payment')}
                className="bg-[#8B0000] text-white font-semibold py-2 px-5 rounded-lg hover:bg-red-800 transition-all"
              >
                Resume GCash Payment
              </button>
            </div>
          </div>
        )}

        {/* FIFO Queue Section */}
        {queueGroups.length > 0 && (
          <div className="mb-12 bg-gradient-to-br from-[#8B0000] to-red-800 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                📋 Queue Status
              </h2>
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="bg-white text-[#8B0000] px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all text-sm"
              >
                {showQueue ? 'Hide Queue' : 'Show Queue'}
              </button>
            </div>

            <div className="space-y-6">
              {queueGroups.map((group) => (
                <div key={group.storeId} className="bg-white bg-opacity-10 rounded-lg p-4 border border-white border-opacity-30">
                  <p className="text-sm text-red-100 mb-3">Store: {group.storeName}</p>

                  {group.position && (
                    <div className="bg-white bg-opacity-20 rounded-lg p-4 mb-4 border border-white border-opacity-50">
                      <div className="flex items-center justify-center gap-4">
                        <div>
                          <p className="text-4xl font-bold">{group.position}</p>
                          <p className="text-red-100 text-sm mt-1">of {group.total}</p>
                        </div>
                        <div className="text-left">
                          {group.position === 1 ? (
                            <p className="text-lg font-bold text-green-300">🎉 You're next in this store!</p>
                          ) : (
                            <p className="text-base">
                              <span className="font-bold text-yellow-300">
                                {group.position - 1} order{group.position - 1 !== 1 ? 's' : ''}
                              </span>
                              <span className="text-red-100"> ahead in this store</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {showQueue && (
                    <div className="bg-white bg-opacity-10 rounded-lg p-4 overflow-x-auto">
                      <div className="flex items-center gap-2 min-w-max pb-2">
                        {group.queueOrders.map((order, idx) => {
                          const isUserOrder = group.userOrderIds.has(String(order._id));
                          return (
                            <div key={order._id} className="flex items-center">
                              <div
                                className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                                  isUserOrder
                                    ? 'bg-green-400 text-white scale-125 ring-4 ring-yellow-300'
                                    : order.status?.toLowerCase() === 'preparing'
                                    ? 'bg-orange-400 text-white'
                                    : 'bg-yellow-300 text-gray-900'
                                }`}
                              >
                                <div className="text-center">
                                  <p className="text-xs">#{order.queueNumber}</p>
                                  {isUserOrder && <p className="text-xs font-bold">YOU</p>}
                                </div>
                              </div>
                              {idx < group.queueOrders.length - 1 && (
                                <div className="text-white text-2xl mx-2">→</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-red-100 text-xs mt-3">
                        🟡 Pending  |  🟠 Preparing  |  🟢 Your Order
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading your orders...</p>
          </div>
        ) : activeOrders.length === 0 && !activeGcashSession && !draftGcashSession ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600 mb-6">No active orders right now</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/menu')}
                className="bg-[#8B0000] text-white font-semibold py-3 px-6 rounded-lg hover:bg-red-800 transition-all"
              >
                Start Ordering
              </button>
              <button
                onClick={() => navigate('/order-history')}
                className="bg-white text-[#8B0000] border-2 border-[#8B0000] font-semibold py-3 px-6 rounded-lg hover:bg-gray-50 transition-all"
              >
                View Order History
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {activeOrders.map(order => (
              <div 
                key={order._id} 
                className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow overflow-hidden"
              >
                {/* Order Header */}
                <div className="bg-gradient-to-r from-[#8B0000] to-red-700 text-white p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-2xl font-bold">Queue #{order.queueNumber || 'N/A'}</h2>
                      <p className="text-red-100 text-sm mt-1">
                        {getStoreName(order)} • {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div className={`px-4 py-2 rounded-full font-semibold text-lg ${getStatusColor(getStatusBadgeTone(order))}`}>
                      {getDisplayStatus(order)}
                    </div>
                  </div>
                  {order.status?.toLowerCase() === 'pending' && (
                    <div className="bg-white bg-opacity-20 rounded px-3 py-2 inline-block mt-2">
                      <p className="text-sm font-semibold">⏱️ Estimated Time: {order.estimatedTime || 15} minutes</p>
                    </div>
                  )}
                  {order.status?.toLowerCase() === 'preparing' && order.estimatedTime && (
                    <div className="bg-white bg-opacity-20 rounded px-3 py-2 inline-block mt-2">
                      <p className="text-sm font-semibold">⏱️ Estimated Time: {order.estimatedTime} minutes</p>
                    </div>
                  )}
                  {order.status?.toLowerCase() === 'ready' && getGraceTimeLeft(order) !== null && (
                    <div className={`rounded px-3 py-2 inline-block mt-2 ${getGraceTimeLeft(order) <= 60 * 1000 ? 'bg-red-600' : 'bg-white bg-opacity-20'}`}>
                      <p className="text-sm font-semibold">
                        ⏳ Grace Period: {formatGraceTime(getGraceTimeLeft(order))}
                      </p>
                    </div>
                  )}
                </div>

                {/* Order Details */}
                <div className="p-6">
                  {/* Items */}
                  <div className="mb-6">
                    <h3 className="font-bold text-gray-900 mb-3">Order Items:</h3>
                    <div className="space-y-2">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-700">
                            <span>{item.name}</span>
                            {item.variation && (
                              <p className="text-xs italic text-gray-500">{item.variation}</p>
                            )}
                            <span>
                              {item.riceOption === 'with_rice' ? ' (With Rice)' : item.riceOption === 'no_rice' ? ' (No Rice)' : ''}
                            </span>
                          </span>
                          <div className="text-right">
                            <span className="text-gray-600">x {item.quantity || 1}</span>
                            <span className="text-gray-900 font-semibold ml-4">₱{(item.price * (item.quantity || 1)).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Total and Status */}
                  <div className="flex justify-between items-center pt-4 border-t-2 border-gray-200">
                    <div>
                      <p className="text-gray-600 text-sm">Total Amount</p>
                      <p className="text-3xl font-bold text-[#8B0000]">₱{order.totalAmount?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-600 mb-2">Payment Method</p>
                      <p className="font-semibold text-gray-900">{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    {order.status?.toLowerCase() === 'pending' && (
                      <button
                        onClick={() => handleCancelOrder(order)}
                        disabled={cancellingOrderId === order._id}
                        className={`w-full py-2 rounded-lg font-semibold transition-colors ${cancellingOrderId === order._id ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                      >
                        {cancellingOrderId === order._id ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    )}

                    {order.status?.toLowerCase() === 'preparing' && (
                      <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-lg p-3">
                        This order can no longer be cancelled because it is already being prepared.
                      </p>
                    )}
                  </div>

                  {order.status?.toLowerCase() === 'cancelled' && order.cancellationReason === 'manual_cancel' && (
                    <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-800">Order cancelled by customer</p>

                      {order.paymentMethod === 'gcash' && order.refundRequired ? (
                        <>
                          {order.refundStatus === 'proof_sent' ? (
                            <div className="mt-2 text-sm text-green-700">
                              <p className="font-semibold">Refund sent via GCash</p>
                              {order.refundProofSentAt && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Sent: {new Date(order.refundProofSentAt).toLocaleString()}
                                </p>
                              )}
                              {order.refundProofUrl && (
                                <a
                                  href={`${serverBaseUrl}${order.refundProofUrl}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block mt-2 text-blue-700 underline"
                                >
                                  View refund proof image
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-amber-700 font-semibold">
                              Refund is being processed by canteen staff through GCash.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-700">No refund is required for this order.</p>
                      )}
                    </div>
                  )}

                  {String(order?.paymentMethod || '').toLowerCase() === 'gcash' && String(order?.paymentStatus || '').toLowerCase() === 'rejected' && (
                    <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-800">Payment rejected by canteen staff</p>
                    </div>
                  )}

                  {order.status?.toLowerCase() === 'cancelled' && order.cancellationReason === 'grace_period_expired' && (
                    <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-800">Order cancelled after 15-minute grace period</p>

                      {order.paymentMethod === 'gcash' && order.refundRequired ? (
                        <>
                          {order.refundStatus === 'proof_sent' ? (
                            <div className="mt-2 text-sm text-green-700">
                              <p className="font-semibold">Refund sent via GCash</p>
                              {order.refundProofSentAt && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Sent: {new Date(order.refundProofSentAt).toLocaleString()}
                                </p>
                              )}
                              {order.refundProofUrl && (
                                <a
                                  href={`${serverBaseUrl}${order.refundProofUrl}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block mt-2 text-blue-700 underline"
                                >
                                  View refund proof image
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-amber-700 font-semibold">
                              Refund is being processed by canteen staff through GCash.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-700">No refund is required for this order.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back to Menu */}
        <div className="mt-12">
          <button
            onClick={() => navigate('/menu')}
            className="w-full bg-[#8B0000] text-white font-semibold py-4 rounded-lg hover:bg-red-800 transition-all text-lg"
          >
            Continue Shopping
          </button>
        </div>
      </main>
    </div>
  );
};

export default MyOrders;