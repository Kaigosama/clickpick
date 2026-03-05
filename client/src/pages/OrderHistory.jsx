import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { AuthContext } from '../context/AuthContext.jsx';

const OrderHistory = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const fetchOrders = () => {
      api
        .get(`/orders/${user?._id}`)
        .then((res) => {
          setOrders(res.data || []);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setLoading(false);
        });
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isHistoryOrder = (order) => {
    const status = String(order?.status || '').toLowerCase();
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    return status === 'completed' || status === 'cancelled' || paymentStatus === 'rejected';
  };

  const getStoreName = (order) => {
    if (order?.storeName) return order.storeName;
    if (typeof order?.stallId === 'object' && order?.stallId?.name) return order.stallId.name;
    return 'Store';
  };

  const historyOrders = orders
    .filter((order) => isHistoryOrder(order))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const getHistoryStatusLabel = (order) => {
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'rejected') return 'Payment Rejected';

    const status = String(order?.status || '').toLowerCase();
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return status ? status.toUpperCase() : 'N/A';
  };

  const getHistoryStatusClass = (order) => {
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'rejected') return 'bg-red-100 text-red-700';

    const status = String(order?.status || '').toLowerCase();
    if (status === 'completed') return 'bg-gray-100 text-gray-700';
    if (status === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
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

      <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">ClickPick</span>
          </div>

          <nav className="hidden sm:flex items-center gap-3 sm:gap-8 text-sm sm:text-base">
            <button onClick={() => navigate('/menu')} className="hover:opacity-80 font-semibold text-lg">
              STORES
            </button>
            <button onClick={() => navigate('/my-orders')} className="hover:opacity-80 font-semibold text-lg">
              MY ORDERS
            </button>
            <button onClick={() => {}} className="hover:opacity-80 font-semibold text-lg">
              ORDER HISTORY
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
                    onClick={() => setShowMobileNavMenu(false)}
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">Order History</h1>
          <p className="text-gray-600">Completed, cancelled, and payment rejected orders</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600">Loading order history...</p>
          </div>
        ) : historyOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600 mb-4">No order history yet</p>
            <button
              onClick={() => navigate('/my-orders')}
              className="bg-[#8B0000] text-white font-semibold py-3 px-6 rounded-lg hover:bg-red-800 transition-all"
            >
              Back to My Orders
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Queue #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Store</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Items</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {historyOrders.map((order) => (
                    <tr key={order._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">#{order.queueNumber || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{getStoreName(order)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {order.items?.length ? (
                          <div className="space-y-1">
                            {order.items.map((item, idx) => (
                              <p key={idx} className="truncate max-w-[220px]" title={`${item.name} x${item.quantity || 1}`}>
                                {item.name} x{item.quantity || 1}
                              </p>
                            ))}
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{order.paymentMethod?.toUpperCase() || 'CASH'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">₱{order.totalAmount?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex px-3 py-1 rounded-full font-semibold ${getHistoryStatusClass(order)}`}>
                          {getHistoryStatusLabel(order)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OrderHistory;
