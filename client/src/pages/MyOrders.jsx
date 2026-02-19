import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

const MyOrders = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { cartItems } = useCart();
  const serverBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) navigate('/');
    
    const fetchOrders = () => {
      // Fetch user's orders
      api.get(`/orders/${user?._id}`)
        .then(res => {
          setOrders(res.data || []);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
      
      // Fetch all orders for FIFO queue display
      api.get('/orders')
        .then(res => {
          const allOrdersList = res.data || [];
          // Sort by createdAt (oldest first for FIFO)
          const sortedOrders = allOrdersList.sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
          );
          setAllOrders(sortedOrders);
        })
        .catch(err => {
          console.error('Error fetching all orders:', err);
        });
    };

    fetchOrders();

    // Poll for updates every 3 seconds (Real-time effect)
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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
      setAllOrders((prev) => prev.map((entry) => (entry._id === order._id ? { ...entry, ...updated } : entry)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancellingOrderId('');
    }
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'preparing': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQueuePosition = () => {
    if (!orders.length || !allOrders.length) return null;

    const userActiveOrder = orders
      .filter((order) => {
        const status = order.status?.toLowerCase();
        return status === 'pending' || status === 'preparing';
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

    if (!userActiveOrder) return null;
    
    // Filter pending and preparing orders only (in queue)
    const activeOrders = allOrders.filter(o => 
      (o.status?.toLowerCase() === 'pending' || o.status?.toLowerCase() === 'preparing') &&
      o._id !== userActiveOrder._id
    );
    
    // Count how many orders are ahead of the user's order
    const ordersAhead = activeOrders.filter(o => 
      new Date(o.createdAt) < new Date(userActiveOrder.createdAt)
    ).length;
    
    const totalQueueLength = activeOrders.filter(o =>
      o.status?.toLowerCase() === 'pending' || o.status?.toLowerCase() === 'preparing'
    ).length + 1; // +1 to include user's order
    
    return { position: ordersAhead + 1, total: totalQueueLength };
  };

  const getPendingOrders = () => {
    return allOrders.filter(o => 
      o.status?.toLowerCase() === 'pending' || o.status?.toLowerCase() === 'preparing'
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  const getStoreName = (order) => {
    if (order?.storeName) return order.storeName;
    if (typeof order?.stallId === 'object' && order?.stallId?.name) return order.stallId.name;
    return 'Store';
  };

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
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate('/menu')}
          >
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
            <button onClick={() => {}} className="hover:opacity-80 font-semibold text-lg">
              MY ORDERS
            </button>
          </nav>

          {/* User Profile & Cart */}
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
                    onClick={() => setShowMobileNavMenu(false)}
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">My Orders</h1>
          <p className="text-gray-600">Track your order status in real-time</p>
        </div>

        {/* FIFO Queue Section */}
        {getPendingOrders().length > 0 && (
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

            {/* User's Position */}
            {getQueuePosition() && (
              <div className="bg-white bg-opacity-20 rounded-lg p-6 mb-6 border-2 border-white">
                <div className="text-center">
                  <p className="text-red-100 text-sm mb-2">Your Position in Queue</p>
                  <div className="flex items-center justify-center gap-4">
                    <div>
                      <p className="text-5xl font-bold">{getQueuePosition().position}</p>
                      <p className="text-red-100 text-sm mt-1">of {getQueuePosition().total}</p>
                    </div>
                    <div className="text-left">
                      {getQueuePosition().position === 1 ? (
                        <p className="text-xl font-bold text-green-300">🎉 You're next!</p>
                      ) : (
                        <p className="text-lg">
                          <span className="font-bold text-yellow-300">
                            {getQueuePosition().position - 1} order{getQueuePosition().position - 1 !== 1 ? 's' : ''}
                          </span>
                          <span className="text-red-100"> ahead</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Queue Visualization */}
            {showQueue && getPendingOrders().length > 0 && (
              <div className="bg-white bg-opacity-10 rounded-lg p-4 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max pb-2">
                  {getPendingOrders().map((order, idx) => {
                    const isUserOrder = orders.some(o => o._id === order._id);
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
                        {idx < getPendingOrders().length - 1 && (
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
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading your orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600 mb-4">No orders yet</p>
            <button
              onClick={() => navigate('/menu')}
              className="bg-[#8B0000] text-white font-semibold py-3 px-6 rounded-lg hover:bg-red-800 transition-all"
            >
              Start Ordering
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map(order => (
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
                    <div className={`px-4 py-2 rounded-full font-semibold text-lg ${getStatusColor(order.status)}`}>
                      {order.status?.toUpperCase() || 'PENDING'}
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