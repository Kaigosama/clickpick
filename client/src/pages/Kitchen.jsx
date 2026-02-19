import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Kitchen = () => {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]); 
  const [pendingPayments, setPendingPayments] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Main', stallId: '' });
  const [report, setReport] = useState(null);
  const [showQueueFlow, setShowQueueFlow] = useState(true);
  const [selectedProof, setSelectedProof] = useState(null);
  const [refundProofFiles, setRefundProofFiles] = useState({});
  const [refundNotes, setRefundNotes] = useState({});
  const [nowTs, setNowTs] = useState(Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'stall_staff') {
      alert("Access Denied: Staff Only");
      navigate('/auth');
    } else {
      setNewItem(prev => ({ ...prev, stallId: user._id }));
      fetchItems();
      fetchOrders();
      fetchPendingPayments();
    }
  }, [navigate]);

  // Poll for new orders and pending payments every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
      fetchPendingPayments();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  const fetchItems = async () => {
    const res = await axios.get('http://localhost:5000/api/menu');
    setItems(res.data);
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/orders');
      setOrders(res.data);
    } catch (err) {
      console.error("Error fetching orders", err);
    }
  };

  const fetchPendingPayments = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/payments/pending-payments');
      console.log('Pending payments response:', res.data);
      console.log('Payments array:', res.data.payments);
      setPendingPayments(res.data.payments || []);
    } catch (err) {
      console.error("Error fetching pending payments", err);
    }
  };

  const approvePayment = async (paymentId) => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      await axios.post(`http://localhost:5000/api/payments/gcash-approve/${paymentId}`, {
        stallId: user._id
      });
      alert("Payment approved successfully!");
      fetchPendingPayments();
      fetchOrders(); // Refresh orders to show updated payment status
    } catch (err) {
      alert("Failed to approve payment: " + (err.response?.data?.message || err.message));
    }
  };

  const rejectPayment = async (paymentId) => {
    const reason = prompt("Enter reason for rejection:");
    if (!reason) return;

    try {
      await axios.post(`http://localhost:5000/api/payments/gcash-reject/${paymentId}`, {
        reason: reason
      });
      alert("Payment rejected");
      fetchPendingPayments();
    } catch (err) {
      alert("Failed to reject payment");
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.put(`http://localhost:5000/api/orders/${orderId}`, { status: newStatus });
      fetchOrders(); 
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const submitRefundProof = async (orderId) => {
    const selectedFile = refundProofFiles[orderId];
    if (!selectedFile) {
      alert('Please upload refund proof first.');
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const formData = new FormData();
      formData.append('refundProof', selectedFile);
      formData.append('note', refundNotes[orderId] || '');
      formData.append('staffId', user?._id || '');

      await axios.post(`http://localhost:5000/api/orders/${orderId}/refund-proof`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      alert('Refund proof submitted and customer notified by SMS.');
      setRefundProofFiles(prev => ({ ...prev, [orderId]: null }));
      setRefundNotes(prev => ({ ...prev, [orderId]: '' }));
      fetchOrders();
    } catch (err) {
      alert("Failed to submit refund proof: " + (err.response?.data?.message || err.message));
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    await axios.post('http://localhost:5000/api/menu', newItem);
    setNewItem({ ...newItem, name: '', price: '' });
    fetchItems();
  };

  const generateReport = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/orders/report/daily');
      setReport(res.data);
    } catch (err) {
      alert("Failed to generate report. Make sure you have completed orders today!");
    }
  };

  // Helper functions for queue management
  const getPendingOrders = () => {
    return orders
      .filter(o => o.status?.toLowerCase() === 'pending')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  const getPreparingOrders = () => {
    return orders
      .filter(o => o.status?.toLowerCase() === 'preparing')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  const getReadyOrders = () => {
    return orders
      .filter(o => o.status?.toLowerCase() === 'ready')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  const getQueueStats = () => {
    const pending = getPendingOrders().length;
    const preparing = getPreparingOrders().length;
    const ready = getReadyOrders().length;
    return { pending, preparing, ready, total: pending + preparing + ready };
  };

  const getRemainingGraceMs = (order) => {
    if (!order) return 0;
    const expiry = order.gracePeriodExpiresAt
      ? new Date(order.gracePeriodExpiresAt).getTime()
      : order.readyAt
      ? new Date(order.readyAt).getTime() + (15 * 60 * 1000)
      : null;

    if (!expiry) return 0;
    return expiry - nowTs;
  };

  const formatCountdown = (remainingMs) => {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const getRefundRequiredOrders = () => {
    return orders
      .filter(o => o.status?.toLowerCase() === 'cancelled' && o.paymentMethod === 'gcash' && o.refundRequired && o.refundStatus === 'pending')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>👨‍🍳 Kitchen Dashboard</h1>
        <button onClick={() => { localStorage.clear(); navigate('/auth'); }} style={{background: 'red', color: 'white', padding: '10px'}}>Logout</button>
      </div>

      {/* DEBUG SECTION - ALWAYS VISIBLE */}
      <div style={{ background: '#333', padding: '20px', borderRadius: '15px', color: 'white', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 15px 0' }}>🔍 Debug Info</h3>
        <p><strong>Pending Payments Count:</strong> {pendingPayments.length}</p>
        <p><strong>Pending Payments Array:</strong></p>
        <pre style={{ background: '#000', padding: '10px', borderRadius: '8px', overflow: 'auto', maxHeight: '200px' }}>
          {JSON.stringify(pendingPayments, null, 2)}
        </pre>
      </div>

      {/* PENDING GCASH PAYMENTS SECTION */}
      {pendingPayments.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', padding: '25px', borderRadius: '15px', border: '3px solid #e65100', color: 'white' }}>
          <h2 style={{ fontSize: '1.8em', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            💳 Pending GCash Payments 
            <span style={{ background: 'rgba(255, 255, 255, 0.3)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.7em' }}>
              {pendingPayments.length}
            </span>
          </h2>

          {/* Debug Info */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', marginBottom: '20px', borderRadius: '8px', fontSize: '0.85em' }}>
            <p><strong>Debug Info:</strong></p>
            <p>Total pending payments: {pendingPayments.length}</p>
            {pendingPayments[0] && (
              <>
                <p>Sample payment ID: {pendingPayments[0]._id}</p>
                <p>Sample proofOfPaymentUrl: {pendingPayments[0].proofOfPaymentUrl || 'MISSING'}</p>
                <p>Sample proofOfPaymentPath: {pendingPayments[0].proofOfPaymentPath || 'MISSING'}</p>
              </>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
            {pendingPayments.map(payment => (
              <div key={payment._id} style={{ background: 'rgba(255, 255, 255, 0.95)', padding: '20px', borderRadius: '12px', color: '#333', border: '2px solid #ff9800' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                  <div>
                    <p style={{ margin: '0 0 5px 0', fontSize: '0.85em', color: '#666' }}>Queue Number</p>
                    <p style={{ margin: 0, fontSize: '1.2em', fontWeight: 'bold', color: '#ff9800' }}>#{payment.orderDbId?.queueNumber || 'N/A'}</p>
                  </div>
                  <span style={{ background: '#ffc107', color: '#333', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.85em' }}>
                    PENDING
                  </span>
                </div>

                <div style={{ marginBottom: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 5px 0', fontSize: '0.9em' }}>
                    <strong>Customer:</strong> {payment.customerId?.name || 'N/A'}
                  </p>
                  <p style={{ margin: '0 0 5px 0', fontSize: '0.9em' }}>
                    <strong>Amount:</strong> ₱{payment.amount?.toFixed(2)}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>
                    {new Date(payment.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Proof of Payment */}
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '0.9em' }}>Proof of Payment:</p>
                  {payment.proofOfPaymentUrl ? (
                    <div style={{ position: 'relative' }}>
                      <p style={{ fontSize: '0.75em', color: '#666', marginBottom: '5px' }}>
                        Path: {payment.proofOfPaymentUrl}
                      </p>
                      <img 
                        src={`http://localhost:5000${payment.proofOfPaymentUrl}`} 
                        alt="Proof of Payment" 
                        style={{ 
                          width: '100%', 
                          maxHeight: '200px', 
                          objectFit: 'cover', 
                          borderRadius: '8px', 
                          cursor: 'pointer',
                          border: '2px solid #ddd'
                        }}
                        onClick={() => setSelectedProof(`http://localhost:5000${payment.proofOfPaymentUrl}`)}
                        onError={(e) => {
                          console.error('Image load error:', e.target.src);
                          e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="100" fill="red">Failed to load image</text></svg>';
                        }}
                      />
                      <button
                        onClick={() => setSelectedProof(`http://localhost:5000${payment.proofOfPaymentUrl}`)}
                        style={{
                          position: 'absolute',
                          top: '25px',
                          right: '5px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '0.8em'
                        }}
                      >
                        🔍 View Full
                      </button>
                    </div>
                  ) : (
                    <p style={{ color: '#999', fontSize: '0.9em' }}>No image uploaded</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    onClick={() => approvePayment(payment._id)}
                    style={{
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.95em',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.background = '#45a049'}
                    onMouseOut={(e) => e.target.style.background = '#4caf50'}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => rejectPayment(payment._id)}
                    style={{
                      background: '#f44336',
                      color: 'white',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.95em',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.background = '#da190b'}
                    onMouseOut={(e) => e.target.style.background = '#f44336'}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedProof && (
        <div 
          onClick={() => setSelectedProof(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button
              onClick={() => setSelectedProof(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'white',
                color: '#333',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1em'
              }}
            >
              ✕ Close
            </button>
            <img 
              src={selectedProof} 
              alt="Proof of Payment Full View" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '90vh', 
                borderRadius: '8px',
                boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* SECTION 1: LIVE ORDERS QUEUE */}
      <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #8B0000 100%)', padding: '30px', borderRadius: '15px', border: '3px solid #333', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '2em', margin: 0 }}>📋 Live Orders Queue (FIFO)</h2>
          <button 
            onClick={() => setShowQueueFlow(!showQueueFlow)}
            style={{ padding: '10px 15px', background: 'white', color: '#8B0000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {showQueueFlow ? '📊 List View' : '🔄 Queue Flow'}
          </button>
        </div>

        {/* Queue Statistics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          <div style={{ background: 'rgba(255, 193, 7, 0.2)', padding: '15px', borderRadius: '10px', border: '2px solid #ffc107' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', opacity: 0.8 }}>⏳ Pending</p>
            <p style={{ margin: 0, fontSize: '2em', fontWeight: 'bold' }}>{getQueueStats().pending}</p>
          </div>
          <div style={{ background: 'rgba(255, 152, 0, 0.2)', padding: '15px', borderRadius: '10px', border: '2px solid #ff9800' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', opacity: 0.8 }}>👨‍🍳 Preparing</p>
            <p style={{ margin: 0, fontSize: '2em', fontWeight: 'bold' }}>{getQueueStats().preparing}</p>
          </div>
          <div style={{ background: 'rgba(76, 175, 80, 0.2)', padding: '15px', borderRadius: '10px', border: '2px solid #4caf50' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', opacity: 0.8 }}>✅ Ready</p>
            <p style={{ margin: 0, fontSize: '2em', fontWeight: 'bold' }}>{getQueueStats().ready}</p>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '15px', borderRadius: '10px', border: '2px solid rgba(255, 255, 255, 0.5)' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', opacity: 0.8 }}>📈 Total</p>
            <p style={{ margin: 0, fontSize: '2em', fontWeight: 'bold' }}>{getQueueStats().total}</p>
          </div>
        </div>

        {/* Queue Flow Visualization */}
        {showQueueFlow && getQueueStats().total > 0 && (
          <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '20px', borderRadius: '12px', marginBottom: '20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'max-content', paddingBottom: '10px' }}>
              {getPendingOrders().map((order, idx) => (
                <div key={order._id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    borderRadius: '50%', 
                    background: '#ffc107',
                    color: '#333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.9em',
                    textAlign: 'center'
                  }}>#{order.queueNumber}</div>
                  {idx < getPendingOrders().length - 1 && <div style={{ color: '#ffc107', fontSize: '1.5em', margin: '0 5px' }}>→</div>}
                </div>
              ))}
              {getPendingOrders().length > 0 && getPreparingOrders().length > 0 && <div style={{ color: '#ff9800', fontSize: '2em', margin: '0 10px' }}>⬇️</div>}
              {getPreparingOrders().map((order, idx) => (
                <div key={order._id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    borderRadius: '50%', 
                    background: '#ff9800',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.9em',
                    textAlign: 'center'
                  }}>#{order.queueNumber}</div>
                  {idx < getPreparingOrders().length - 1 && <div style={{ color: '#ff9800', fontSize: '1.5em', margin: '0 5px' }}>→</div>}
                </div>
              ))}
              {getPreparingOrders().length > 0 && getReadyOrders().length > 0 && <div style={{ color: '#4caf50', fontSize: '2em', margin: '0 10px' }}>⬇️</div>}
              {getReadyOrders().map((order, idx) => (
                <div key={order._id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    borderRadius: '50%', 
                    background: '#4caf50',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.9em',
                    textAlign: 'center'
                  }}>#{order.queueNumber}</div>
                  {idx < getReadyOrders().length - 1 && <div style={{ color: '#4caf50', fontSize: '1.5em', margin: '0 5px' }}>→</div>}
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0 0', fontSize: '0.85em', opacity: 0.8 }}>🟡 Pending → 🟠 Preparing → 🟢 Ready</p>
          </div>
        )}

        {/* Orders by Status - List View */}
        {!showQueueFlow && (
          <div>
            {/* Pending Orders */}
            {getPendingOrders().length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.3em', color: '#ffc107', margin: '15px 0 10px 0' }}>⏳ Pending Orders</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                  {getPendingOrders().map(order => (
                    <div key={order._id} style={{ padding: '15px', background: 'rgba(255, 193, 7, 0.15)', border: '2px solid #ffc107', borderRadius: '8px', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.3em', fontWeight: 'bold' }}>Order #{order.queueNumber}</span>
                        <div style={{ display: 'flex', gap: '5px', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ background: '#ffc107', color: '#333', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85em' }}>PENDING</span>
                          {order.paymentMethod === 'gcash' && (
                            <span style={{ 
                              background: order.paymentStatus === 'paid' ? '#4caf50' : '#ff5722', 
                              color: 'white', 
                              padding: '3px 8px', 
                              borderRadius: '4px', 
                              fontWeight: 'bold', 
                              fontSize: '0.75em' 
                            }}>
                              {order.paymentStatus === 'paid' ? '✓ PAID' : '⏳ PAYMENT PENDING'}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: '8px 0', fontSize: '0.95em' }}><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' }}>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Amount:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em' }}>₱{order.totalAmount}</p>
                        </div>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Payment:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em', fontWeight: 'bold' }}>{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button onClick={() => updateOrderStatus(order._id, 'preparing')} style={{flex: 1, background: '#ff9800', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Start Preparing</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preparing Orders */}
            {getPreparingOrders().length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.3em', color: '#ff9800', margin: '15px 0 10px 0' }}>👨‍🍳 Preparing Orders</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                  {getPreparingOrders().map(order => (
                    <div key={order._id} style={{ padding: '15px', background: 'rgba(255, 152, 0, 0.15)', border: '2px solid #ff9800', borderRadius: '8px', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.3em', fontWeight: 'bold' }}>Order #{order.queueNumber}</span>
                        <div style={{ display: 'flex', gap: '5px', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ background: '#ff9800', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85em' }}>PREPARING</span>
                          {order.paymentMethod === 'gcash' && (
                            <span style={{ 
                              background: order.paymentStatus === 'paid' ? '#4caf50' : '#ff5722', 
                              color: 'white', 
                              padding: '3px 8px', 
                              borderRadius: '4px', 
                              fontWeight: 'bold', 
                              fontSize: '0.75em' 
                            }}>
                              {order.paymentStatus === 'paid' ? '✓ PAID' : '⏳ PAYMENT PENDING'}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: '8px 0', fontSize: '0.95em' }}><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' }}>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Amount:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em' }}>₱{order.totalAmount}</p>
                        </div>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Payment:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em', fontWeight: 'bold' }}>{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button onClick={() => updateOrderStatus(order._id, 'ready')} style={{flex: 1, background: '#4caf50', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Order Ready</button>
                        <button onClick={() => updateOrderStatus(order._id, 'pending')} style={{flex: 1, background: '#ffc107', color: '#333', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Back to Pending</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ready Orders */}
            {getReadyOrders().length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.3em', color: '#4caf50', margin: '15px 0 10px 0' }}>✅ Ready Orders (Awaiting Pickup)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                  {getReadyOrders().map(order => (
                    <div key={order._id} style={{ padding: '15px', background: 'rgba(76, 175, 80, 0.15)', border: '2px solid #4caf50', borderRadius: '8px', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.3em', fontWeight: 'bold' }}>Order #{order.queueNumber}</span>
                        <div style={{ display: 'flex', gap: '5px', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ background: '#4caf50', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85em' }}>READY</span>
                          {order.paymentMethod === 'gcash' && (
                            <span style={{ 
                              background: order.paymentStatus === 'paid' ? '#4caf50' : '#ff5722', 
                              color: 'white', 
                              padding: '3px 8px', 
                              borderRadius: '4px', 
                              fontWeight: 'bold', 
                              fontSize: '0.75em' 
                            }}>
                              {order.paymentStatus === 'paid' ? '✓ PAID' : '⏳ PAYMENT PENDING'}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: '8px 0', fontSize: '0.95em' }}><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' }}>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Amount:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em' }}>₱{order.totalAmount}</p>
                        </div>
                        <div>
                          <p style={{ margin: '2px 0', fontSize: '0.85em', opacity: 0.8 }}><strong>Payment:</strong></p>
                          <p style={{ margin: 0, fontSize: '0.95em', fontWeight: 'bold' }}>{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0', fontSize: '0.9em' }}>
                        <strong>Customer No.:</strong> {order.customerId?.phone || 'Not provided'}
                      </p>
                      <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)' }}>
                        <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.9 }}><strong>Grace Timer (15 min):</strong></p>
                        <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '1.1em', color: getRemainingGraceMs(order) <= 0 ? '#ffeb3b' : 'white' }}>
                          {getRemainingGraceMs(order) <= 0 ? 'EXPIRED - auto-cancelling...' : formatCountdown(getRemainingGraceMs(order))}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button onClick={() => updateOrderStatus(order._id, 'completed')} style={{flex: 1, background: '#6c757d', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Mark as Picked Up</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {getRefundRequiredOrders().length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.3em', color: '#ff5252', margin: '15px 0 10px 0' }}>💸 Manual GCash Refund Required</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '15px' }}>
                  {getRefundRequiredOrders().map(order => (
                    <div key={order._id} style={{ padding: '15px', background: 'rgba(244, 67, 54, 0.2)', border: '2px solid #ff5252', borderRadius: '8px', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>Order #{order.queueNumber}</span>
                        <span style={{ background: '#ff5252', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8em' }}>
                          REFUND NEEDED
                        </span>
                      </div>

                      <p style={{ margin: '6px 0', fontSize: '0.92em' }}><strong>Amount:</strong> ₱{order.totalAmount}</p>
                      <p style={{ margin: '6px 0', fontSize: '0.92em' }}><strong>Customer:</strong> {order.customerId?.name || 'N/A'}</p>
                      <p style={{ margin: '6px 0', fontSize: '0.92em' }}><strong>GCash Number:</strong> {order.customerId?.phone || 'Not provided'}</p>
                      <p style={{ margin: '10px 0', fontSize: '0.85em', color: '#ffe0e0' }}>
                        Auto-cancelled after 15 minutes unclaimed. Process refund in GCash, then upload proof below.
                      </p>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setRefundProofFiles(prev => ({ ...prev, [order._id]: e.target.files?.[0] || null }))}
                        style={{ width: '100%', marginBottom: '8px' }}
                      />

                      <input
                        type="text"
                        placeholder="Optional note"
                        value={refundNotes[order._id] || ''}
                        onChange={(e) => setRefundNotes(prev => ({ ...prev, [order._id]: e.target.value }))}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', marginBottom: '10px' }}
                      />

                      <button
                        onClick={() => submitRefundProof(order._id)}
                        disabled={!refundProofFiles[order._id]}
                        style={{
                          width: '100%',
                          background: refundProofFiles[order._id] ? '#4caf50' : '#999',
                          color: 'white',
                          border: 'none',
                          padding: '10px',
                          borderRadius: '6px',
                          cursor: refundProofFiles[order._id] ? 'pointer' : 'not-allowed',
                          fontWeight: 'bold'
                        }}
                      >
                        Send Refund Proof + SMS
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {getQueueStats().total === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', fontSize: '1.2em', opacity: 0.7 }}>
                ✨ No orders in queue - You're all caught up!
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: MENU MANAGEMENT */}
      <div style={{ borderTop: '2px solid #eee', paddingTop: '20px' }}>
        <h3>Add New Menu Item</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input placeholder="Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
          <input placeholder="Price" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} required />
          <button type="submit">Add</button>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {items.map(item => (
            <div key={item._id} style={{ border: '1px solid #ddd', padding: '10px', fontSize: '0.9em' }}>
              <strong>{item.name}</strong>
              <p>₱{item.price}</p>
              <button onClick={() => axios.put(`http://localhost:5000/api/menu/${item._id}`, { isAvailable: !item.isAvailable }).then(fetchItems)}>
                {item.isAvailable ? "Available" : "Sold Out"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: SALES REPORT (Correctly inside return) */}
      <div style={{ marginTop: '40px', padding: '20px', border: '2px solid blue', borderRadius: '10px', background: '#eef6ff' }}>
        <h2>📊 Daily Sales Report</h2>
        <button onClick={generateReport} style={{ padding: '10px', cursor: 'pointer' }}>Generate Today's Report</button>
        
        {report && (
          <div style={{ marginTop: '10px' }}>
            <p><strong>Total Revenue:</strong> ₱{report.totalRevenue}</p>
            <p><strong>Orders Completed:</strong> {report.totalOrders}</p>
            <h4>Items Sold:</h4>
            <ul>
              {Object.entries(report.itemsSold).map(([name, qty]) => (
                <li key={name}>{name}: {qty} units</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Kitchen;