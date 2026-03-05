import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { toServerAssetUrl } from '../services/assetUrl.js';
import { AuthContext } from '../context/AuthContext.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';

const OrderHistory = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRefundOrder, setSelectedRefundOrder] = useState(null);
  const [processingRefundAction, setProcessingRefundAction] = useState('');

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

  const refreshOrders = async () => {
    const res = await api.get(`/orders/${user?._id}`);
    setOrders(res.data || []);
  };

  const handleConfirmRefund = async (orderId) => {
    setProcessingRefundAction('confirm');
    try {
      await api.post(`/orders/${orderId}/confirm-refund`);
      await refreshOrders();
      setSelectedRefundOrder(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to confirm refund');
    } finally {
      setProcessingRefundAction('');
    }
  };

  const handleNotReceivedRefund = async (orderId) => {
    setProcessingRefundAction('not_received');
    try {
      await api.post(`/orders/${orderId}/refund-not-received`);
      await refreshOrders();
      setSelectedRefundOrder(null);
      alert('Marked as not received. Store has been asked to re-submit proof.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark refund as not received');
    } finally {
      setProcessingRefundAction('');
    }
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
    const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
    const refundStatus = String(order?.refundStatus || '').toLowerCase();
    const hasRefundFlow =
      status === 'cancelled' &&
      paymentMethod === 'gcash' &&
      ['pending', 'proof_sent', 'confirmed'].includes(refundStatus);

    if (hasRefundFlow) {
      if (refundStatus === 'confirmed') return 'Refund Complete';
      if (refundStatus === 'proof_sent') return 'Check Proof';
      return 'Refund Processing';
    }

    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return status ? status.toUpperCase() : 'N/A';
  };

  const getHistoryStatusClass = (order) => {
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'rejected') return 'bg-red-100 text-red-700';

    const status = String(order?.status || '').toLowerCase();
    const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
    const refundStatus = String(order?.refundStatus || '').toLowerCase();
    const hasRefundFlow =
      status === 'cancelled' &&
      paymentMethod === 'gcash' &&
      ['pending', 'proof_sent', 'confirmed'].includes(refundStatus);

    if (hasRefundFlow) {
      if (refundStatus === 'proof_sent') return 'bg-blue-100 text-blue-700';
      return refundStatus === 'confirmed'
        ? 'bg-green-100 text-green-800'
        : 'bg-yellow-100 text-yellow-700';
    }

    if (status === 'completed') return 'bg-gray-100 text-gray-700';
    if (status === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <CustomerHeader activePage="order-history" />

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
                      <td className="px-4 py-3 text-sm">
                        {String(order?.status || '').toLowerCase() === 'cancelled' &&
                         String(order?.paymentMethod || '').toLowerCase() === 'gcash' &&
                         String(order?.refundStatus || '').toLowerCase() === 'proof_sent' &&
                         order?.refundProofUrl ? (
                          <button
                            type="button"
                            onClick={() => setSelectedRefundOrder(order)}
                            className={`inline-flex px-3 py-1 rounded-full font-semibold underline hover:opacity-85 ${getHistoryStatusClass(order)}`}
                          >
                            {getHistoryStatusLabel(order)}
                          </button>
                        ) : (
                          <span className={`inline-flex px-3 py-1 rounded-full font-semibold ${getHistoryStatusClass(order)}`}>
                            {getHistoryStatusLabel(order)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selectedRefundOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Refund Proof</h3>
              <button
                type="button"
                onClick={() => setSelectedRefundOrder(null)}
                className="text-gray-500 hover:text-gray-800 font-semibold"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3">
                Queue #{selectedRefundOrder.queueNumber || 'N/A'} • Please verify if you received this refund.
              </p>
              <img
                src={toServerAssetUrl(selectedRefundOrder.refundProofUrl)}
                alt="Refund proof"
                className="w-full max-h-[420px] object-contain rounded border border-gray-200 bg-gray-50"
              />

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleConfirmRefund(selectedRefundOrder._id)}
                  disabled={!!processingRefundAction}
                  className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  {processingRefundAction === 'confirm' ? 'Confirming...' : 'Confirm Received'}
                </button>
                <button
                  type="button"
                  onClick={() => handleNotReceivedRefund(selectedRefundOrder._id)}
                  disabled={!!processingRefundAction}
                  className="w-full bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  {processingRefundAction === 'not_received' ? 'Submitting...' : 'Not Received'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistory;
