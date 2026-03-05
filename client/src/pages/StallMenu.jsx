import { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../services/api.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import ProductDetail from '../components/ProductDetail.jsx';
import CartPreview from '../components/CartPreview.jsx';
import EditItemModal from '../components/EditItemModal.jsx';
import AddItemModal from '../components/AddItemModal.jsx';
import CustomerHeader from '../components/CustomerHeader.jsx';
import { getSocket } from '../services/socket.js';
import { toServerAssetUrl } from '../services/assetUrl.js';
import { jsPDF } from 'jspdf';

const normalizeStoreOpen = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'closed', 'no'].includes(normalized)) return false;
  if (['true', '1', 'open', 'yes'].includes(normalized)) return true;
  return true;
};

const StallMenu = () => {
  const { stallId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useContext(AuthContext);
  const { cartItems, addToCart, removeFromCart, cartTotal, clearCart } = useCart();
  const [items, setItems] = useState([]);
  const [itemQuantities, setItemQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCartPreview, setShowCartPreview] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [orders, setOrders] = useState([]);
  const [showQueueFlow, setShowQueueFlow] = useState(false);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [selectedProof, setSelectedProof] = useState(null);
  const [showStaffMobileMenu, setShowStaffMobileMenu] = useState(false);
  const [salesOrders, setSalesOrders] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [refundProofFiles, setRefundProofFiles] = useState({});
  const [uploadingRefundForOrder, setUploadingRefundForOrder] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [gcashNumber, setGcashNumber] = useState('');
  const [storeOpen, setStoreOpen] = useState(true);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const defaultStalls = [
    { id: 'default-1', name: 'Store 1', logo: 'S1' },
    { id: 'default-2', name: 'Store 2', logo: 'S2' },
    { id: 'default-3', name: 'Store 3', logo: 'S3' },
    { id: 'default-4', name: 'Store 4', logo: 'S4' },
    { id: 'default-5', name: 'Store 5', logo: 'S5' },
    { id: 'default-6', name: 'Store 6', logo: 'S6' },
    { id: 'default-7', name: 'Store 7', logo: 'S7' },
    { id: 'default-8', name: 'Store 8', logo: 'S8' },
  ];
  const [stalls, setStalls] = useState(defaultStalls);

  const stall = stalls.find((entry) => entry.id === stallId) || {
    name: 'Store',
    logo: 'ST',
    storeOpen: true
  };
  const isStaff = user?.role === 'stall_staff';
  const isStoreProfilePage = location.pathname === '/profile';
  const isStoreClosedForCustomer = !isStaff && normalizeStoreOpen(stall?.storeOpen) === false;

  useEffect(() => {
    setGcashNumber(user?.gcashNumber || '');
    setStoreOpen(user?.storeOpen !== false);
  }, [user?.gcashNumber, user?.storeOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const resolveItemImage = (image) => {
    if (!image) return null;
    return toServerAssetUrl(image);
  };

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    let isMounted = true;

    const fetchMenuItems = async () => {
      try {
        const res = await api.get(`/menu?stall=${stallId}`);
        if (isMounted) {
          setItems(res.data || []);
        }
      } catch (err) {
        console.error(err);
        if (isMounted && !items.length) {
          setItems([
            { _id: '1', name: 'Burger', price: 75, isAvailable: true, stall: stallId },
            { _id: '2', name: 'Fries', price: 45, isAvailable: true, stall: stallId },
            { _id: '3', name: 'Drink', price: 35, isAvailable: true, stall: stallId },
          ]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMenuItems();

    return () => {
      isMounted = false;
    };
  }, [user, navigate, stallId, isStaff]);

  useEffect(() => {
    if (!user || !stallId) return;

    const socket = getSocket();

    const handleMenuUpdated = async (payload) => {
      if (!payload?.stallId || String(payload.stallId) !== String(stallId)) return;

      try {
        const res = await api.get(`/menu?stall=${stallId}`);
        setItems(res.data || []);
      } catch (err) {
        console.error('Socket refresh failed:', err);
      }
    };

    const handleStoreStatusUpdated = (payload) => {
      const updatedStallId = String(payload?.stallId || '');
      if (!updatedStallId) return;

      setStalls((prev) => prev.map((entry) => (
        String(entry.id) === updatedStallId
          ? { ...entry, storeOpen: normalizeStoreOpen(payload?.storeOpen) }
          : entry
      )));
    };

    socket.emit('join_stall', stallId);
    socket.on('menu:updated', handleMenuUpdated);
    socket.on('store:status_updated', handleStoreStatusUpdated);

    return () => {
      socket.emit('leave_stall', stallId);
      socket.off('menu:updated', handleMenuUpdated);
      socket.off('store:status_updated', handleStoreStatusUpdated);
    };
  }, [user, stallId]);

  useEffect(() => {
    if (!selectedProduct) return;

    const latestItem = items.find((item) => item._id === selectedProduct._id);
    if (!latestItem) {
      setSelectedProduct(null);
      return;
    }

    const changed =
      selectedProduct.price !== latestItem.price ||
      selectedProduct.quantity !== latestItem.quantity ||
      selectedProduct.isAvailable !== latestItem.isAvailable ||
      selectedProduct.variation !== latestItem.variation ||
      selectedProduct.noRiceAvailable !== latestItem.noRiceAvailable ||
      selectedProduct.withRiceAvailable !== latestItem.withRiceAvailable ||
      selectedProduct.withRiceAdditionalPrice !== latestItem.withRiceAdditionalPrice;

    if (changed) {
      setSelectedProduct(latestItem);
    }
  }, [items, selectedProduct]);

  useEffect(() => {
    const fetchStalls = async () => {
      try {
        const res = await api.get('/auth/stalls');
        const list = Array.isArray(res.data) ? res.data : res.data?.stalls;
        if (!list || list.length === 0) {
          return;
        }

        const mappedStalls = list.map((entry, index) => ({
          id: entry._id,
          name: entry.name,
          logo: defaultStalls[index % defaultStalls.length].logo,
          logoUrl: entry.logoUrl || null,
          storeOpen: normalizeStoreOpen(entry.storeOpen)
        }));
        setStalls(mappedStalls);
      } catch (err) {
        console.error('Error fetching stalls:', err);
      }
    };

    fetchStalls();
  }, [defaultStalls.length]);

  const refreshStaffOrders = async () => {
    if (!isStaff || !user?._id) return;

    try {
      const res = await api.get(`/orders?stallId=${user._id}`);
      const allOrders = Array.isArray(res.data) ? res.data : [];

      const liveOrders = allOrders.filter((order) => {
        const status = String(order.status || '').toLowerCase();
        if (status === 'pending' && String(order.paymentMethod || '').toLowerCase() === 'gcash' && String(order.paymentStatus || '').toLowerCase() === 'pending') {
          return false;
        }
        return status === 'pending' || status === 'preparing' || status === 'ready';
      });

      const completed = allOrders
        .filter((order) => String(order.status || '').toLowerCase() === 'completed')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

      const cancelled = allOrders
        .filter((order) => String(order.status || '').toLowerCase() === 'cancelled')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

      setOrders(liveOrders);
      setSalesOrders(completed);
      setCancelledOrders(cancelled);
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  // Fetch orders for staff
  useEffect(() => {
    if (isStaff) {
      const fetchPendingPayments = async () => {
        try {
          const res = await api.get(`/payments/pending-payments?stallId=${user._id}`);
          setPendingPayments(res.data.payments || []);
        } catch (err) {
          console.error('Error fetching pending payments:', err);
        }
      };
      
      refreshStaffOrders();
      fetchPendingPayments();

      const interval = setInterval(() => {
        refreshStaffOrders();
        fetchPendingPayments();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isStaff, user?._id]);

  const buildSalesExportRows = () => {
    return salesOrders.map((order) => {
      const placedAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A';
      const completedAt = order.updatedAt ? new Date(order.updatedAt).toLocaleString() : 'N/A';
      const items = order.items?.map((item) => `${item.quantity || 1}x ${item.name}`).join(', ') || 'N/A';
      const orderId = order.orderNumber || order.queueNumber || order._id;
      const payment = order.paymentMethod?.toUpperCase() || 'CASH';

      return {
        placedAt,
        items,
        orderId,
        payment,
        completedAt
      };
    });
  };

  const getSalesExportFilename = (extension) => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `sales-report-${stamp}.${extension}`;
  };

  const handleExportSalesCSV = () => {
    if (!salesOrders.length) {
      alert('No sales data to export.');
      return;
    }

    const rows = buildSalesExportRows().map((row) => [
      row.placedAt,
      row.items,
      row.orderId,
      row.payment,
      row.completedAt
    ]);

    const header = ['ORDER PLACED DATE/TIME', 'ITEM', 'ORDER ID', 'PAYMENT', 'ORDER COMPLETED DATE/TIME'];
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getSalesExportFilename('csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSalesPDF = () => {
    if (!salesOrders.length) {
      alert('No sales data to export.');
      return;
    }

    const rows = buildSalesExportRows();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const leftMargin = 10;
    const rightMargin = 10;
    const topMargin = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const tableWidth = pageWidth - leftMargin - rightMargin;

    const columns = [
      { key: 'placedAt', label: 'ORDER PLACED DATE/TIME', width: 50 },
      { key: 'items', label: 'ITEM', width: 95 },
      { key: 'orderId', label: 'ORDER ID', width: 35 },
      { key: 'payment', label: 'PAYMENT', width: 25 },
      { key: 'completedAt', label: 'ORDER COMPLETED DATE/TIME', width: 55 }
    ];

    const widthScale = tableWidth / columns.reduce((sum, column) => sum + column.width, 0);
    const scaledColumns = columns.map((column) => ({ ...column, width: column.width * widthScale }));

    const renderHeader = (y) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      let x = leftMargin;

      scaledColumns.forEach((column) => {
        doc.rect(x, y, column.width, 8);
        doc.text(column.label, x + 1.5, y + 5.2, { maxWidth: column.width - 3 });
        x += column.width;
      });

      return y + 8;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Sales Report', leftMargin, topMargin);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, leftMargin, topMargin + 5);

    let currentY = topMargin + 10;
    currentY = renderHeader(currentY);

    rows.forEach((row) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const rowLines = scaledColumns.map((column) => {
        const value = String(row[column.key] ?? '');
        return doc.splitTextToSize(value, Math.max(5, column.width - 3));
      });

      const lineCount = Math.max(...rowLines.map((lines) => lines.length), 1);
      const rowHeight = Math.max(7, lineCount * 3.8 + 2);

      if (currentY + rowHeight > pageHeight - 10) {
        doc.addPage();
        currentY = 12;
        currentY = renderHeader(currentY);
      }

      let x = leftMargin;
      scaledColumns.forEach((column, index) => {
        doc.rect(x, currentY, column.width, rowHeight);
        doc.text(rowLines[index], x + 1.5, currentY + 4.5, {
          maxWidth: column.width - 3,
          baseline: 'top'
        });
        x += column.width;
      });

      currentY += rowHeight;
    });

    doc.save(getSalesExportFilename('pdf'));
  };

  const handleCheckout = async () => {
    if (isStoreClosedForCustomer) {
      alert('This store is currently closed and cannot accept orders.');
      return;
    }

    if (cartItems.length === 0) {
      alert("Cart is empty!");
      return;
    }

    const storeIdsInCart = Array.from(
      new Set(
        cartItems
          .map((item) => {
            const rawStoreId = item?.stallId ?? item?.stall;
            if (rawStoreId && typeof rawStoreId === 'object') {
              return String(rawStoreId._id || rawStoreId.id || rawStoreId.stallId || '');
            }
            return String(rawStoreId || '');
          })
          .filter(Boolean)
      )
    );

    if (storeIdsInCart.length > 1) {
      alert('Please place separate orders per store. Your cart currently has items from multiple stores.');
      return;
    }

    try {
      const orderData = {
        customerId: user._id,
        items: cartItems.map(item => ({
          menuItemId: item._id,
          name: item.name,
          variation: item.selectedVariation || '',
          riceOption: item.selectedRiceOption || '',
          quantity: item.quantity || 1,
          price: item.price
        })),
        totalAmount: cartTotal,
        paymentMethod: 'cash'
      };

      await api.post('/orders', orderData);
      alert("Order Placed Successfully! Your order number will be displayed.");
      clearCart();
      navigate('/my-orders');
    } catch (err) {
      console.error(err);
      alert("Checkout Failed: " + (err.response?.data?.message || err.message));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!user?._id) return;

    const confirmed = window.confirm('Are you sure you want to save these store settings?');
    if (!confirmed) {
      return;
    }

    setSavingSettings(true);
    setSettingsMessage('');

    try {
      const response = await api.put('/auth/profile', {
        userId: user._id,
        gcashNumber: gcashNumber.trim(),
        storeOpen
      });

      if (response.data?.user) {
        updateUser(response.data.user);
      }

      setSettingsMessage('Store settings saved successfully.');
      setIsEditingSettings(false);
    } catch (err) {
      setSettingsMessage(`Failed to save settings: ${err.response?.data?.message || err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCancelSettingsEdit = () => {
    setStoreOpen(user?.storeOpen !== false);
    setGcashNumber(user?.gcashNumber || '');
    setSettingsMessage('');
    setIsEditingSettings(false);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}`, { status: newStatus });
      await refreshStaffOrders();
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Failed to update order status');
    }
  };

  const approvePayment = async (paymentId) => {
    try {
      await api.post(`/payments/gcash-approve/${paymentId}`, {
        stallId: user._id
      });
      alert("Payment approved successfully!");
      // Refresh both payments and orders
      const paymentsRes = await api.get(`/payments/pending-payments?stallId=${user._id}`);
      setPendingPayments(paymentsRes.data.payments || []);
      await refreshStaffOrders();
    } catch (err) {
      alert("Failed to approve payment: " + (err.response?.data?.message || err.message));
    }
  };

  const rejectPayment = async (paymentId) => {
    const reason = prompt("Enter reason for rejection:");
    if (!reason) return;

    try {
      await api.post(`/payments/gcash-reject/${paymentId}`, {
        reason: reason,
        stallId: user._id
      });
      alert("Payment rejected");
      const res = await api.get(`/payments/pending-payments?stallId=${user._id}`);
      setPendingPayments(res.data.payments || []);
    } catch (err) {
      alert("Failed to reject payment");
    }
  };

  const handleRefundProofChange = (orderId, file) => {
    setRefundProofFiles((prev) => ({
      ...prev,
      [orderId]: file || null
    }));
  };

  const submitRefundProof = async (orderId) => {
    const selectedFile = refundProofFiles[orderId];
    if (!selectedFile) {
      alert('Please select a refund proof image first.');
      return;
    }

    const formData = new FormData();
    formData.append('refundProof', selectedFile);

    setUploadingRefundForOrder(orderId);
    try {
      await api.post(`/orders/${orderId}/refund-proof`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      await refreshStaffOrders();

      setRefundProofFiles((prev) => ({
        ...prev,
        [orderId]: null
      }));

      alert('Refund proof uploaded and customer notified.');
    } catch (err) {
      alert(`Failed to submit refund proof: ${err.response?.data?.message || err.message}`);
    } finally {
      setUploadingRefundForOrder('');
    }
  };

  // Helper functions for queue management
  const getPendingOrders = () => {
    return orders
      .filter((o) => {
        if (o.status?.toLowerCase() !== 'pending') return false;
        return !(String(o.paymentMethod || '').toLowerCase() === 'gcash' && String(o.paymentStatus || '').toLowerCase() === 'pending');
      })
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

  const getCancelledOrders = () => {
    return cancelledOrders;
  };

  const getRefundRequiredOrders = () => {
    return cancelledOrders
      .filter((order) => {
        const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
        const refundStatus = String(order?.refundStatus || '').toLowerCase();
        return paymentMethod === 'gcash' && !['proof_sent', 'confirmed'].includes(refundStatus);
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  };

  const getAwaitingRefundConfirmationOrders = () => {
    return cancelledOrders
      .filter((order) => {
        const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
        const refundStatus = String(order?.refundStatus || '').toLowerCase();
        return paymentMethod === 'gcash' && refundStatus === 'proof_sent';
      })
      .sort((a, b) => new Date(b.refundProofSentAt || b.updatedAt || b.createdAt) - new Date(a.refundProofSentAt || a.updatedAt || a.createdAt));
  };

  const getQueueStats = () => {
    const pending = getPendingOrders().length;
    const preparing = getPreparingOrders().length;
    const ready = getReadyOrders().length;
    return { pending, preparing, ready, total: pending + preparing + ready };
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

  const categoryDisplayOrder = ['Main', 'Snacks', 'Drinks', 'Desserts'];
  const getNormalizedCategory = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Others';
    const matched = categoryDisplayOrder.find(
      (entry) => entry.toLowerCase() === raw.toLowerCase()
    );
    return matched || raw;
  };

  const categoryGroups = (() => {
    const grouped = items.reduce((acc, item) => {
      const category = getNormalizedCategory(item.category);
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});

    const preferred = categoryDisplayOrder
      .filter((category) => grouped[category]?.length)
      .map((category) => ({ category, items: grouped[category] }));

    const others = Object.keys(grouped)
      .filter((category) => !categoryDisplayOrder.includes(category))
      .sort((a, b) => a.localeCompare(b))
      .map((category) => ({ category, items: grouped[category] }));

    return [...preferred, ...others];
  })();

  const queueStats = getQueueStats();
  const hasActiveOrders = queueStats.total > 0;

  if (!stall) {
    return <div className="text-center py-12">Stall not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {showStaffMobileMenu && isStaff && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => {
            setShowStaffMobileMenu(false);
          }}
          className="sm:hidden fixed inset-0 z-[45] bg-transparent"
        />
      )}

      {/* Header Navigation - staff or customer */}
      {!isStaff ? (
        <CustomerHeader activePage="stores" />
      ) : (
        <header className="bg-[#8B0000] text-white font-sans shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="min-w-0 flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('products')}>
              <img src="/logo.png" alt="ClickPick" className="w-9 h-9 sm:w-12 sm:h-12 object-contain" />
              <span className="text-sm sm:text-xl font-semibold sm:font-bold tracking-tight text-white/95 truncate">ClickPick Canteen Dashboard</span>
            </div>

            <nav className="hidden sm:flex items-end gap-3 sm:gap-8 text-sm sm:text-base">
              <button
                onClick={() => setActiveTab('products')}
                className={`relative font-semibold text-lg pb-2 transition-colors ${activeTab === 'products' ? 'text-white' : 'text-white/85 hover:text-white'}`}
              >
                PRODUCTS
                {activeTab === 'products' && <span className="absolute left-0 right-0 -bottom-[2px] h-1 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`relative font-semibold text-lg pb-2 transition-colors ${activeTab === 'orders' ? 'text-white' : 'text-white/85 hover:text-white'}`}
              >
                ORDERS
                {activeTab === 'orders' && <span className="absolute left-0 right-0 -bottom-[2px] h-1 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`relative font-semibold text-lg pb-2 transition-colors ${activeTab === 'sales' ? 'text-white' : 'text-white/85 hover:text-white'}`}
              >
                SALES
                {activeTab === 'sales' && <span className="absolute left-0 right-0 -bottom-[2px] h-1 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`relative font-semibold text-lg pb-2 transition-colors ${activeTab === 'settings' ? 'text-white' : 'text-white/85 hover:text-white'}`}
              >
                SETTINGS
                {activeTab === 'settings' && <span className="absolute left-0 right-0 -bottom-[2px] h-1 rounded-sm bg-[#f4c542]" />}
              </button>
            </nav>

            <div className="flex items-center gap-3 sm:gap-6">

              <div className="sm:hidden relative">
                <button
                  onClick={() => {
                    setShowStaffMobileMenu(!showStaffMobileMenu);
                    setShowProfileMenu(false);
                  }}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  aria-label="Open staff profile menu"
                >
                  <p className="font-medium text-xs uppercase max-w-[130px] truncate text-white/95">
                    {user?.name || 'Staff'}
                  </p>
                  <p className="text-xs">{showStaffMobileMenu ? '▲' : '▼'}</p>
                </button>

                {showStaffMobileMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-52 overflow-hidden">
                    {!isStoreProfilePage && (
                      <button
                        onClick={() => {
                          navigate('/profile');
                          setShowStaffMobileMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                      >
                        Store Profile
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowStaffMobileMenu(false);
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
                  aria-label="Toggle profile menu"
                >
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-sm uppercase">{user?.name || 'Staff'}</p>
                    <p className="text-xs">{showProfileMenu ? '▲' : '▼'}</p>
                  </div>
                </button>

                {showProfileMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-40">
                    <button
                      onClick={() => {
                        navigate('/profile');
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                    >
                      Store Profile
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

          <div className="sm:hidden border-t border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="px-3 py-3 grid grid-cols-4 gap-2 text-[11px] font-bold tracking-wide">
              <button
                onClick={() => setActiveTab('products')}
                className={`relative w-full text-center pb-1.5 truncate ${activeTab === 'products' ? 'text-white' : 'text-white/80'}`}
              >
                PRODUCTS
                {activeTab === 'products' && <span className="absolute left-0 right-0 -bottom-[2px] h-1.5 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`relative w-full text-center pb-1.5 truncate ${activeTab === 'orders' ? 'text-white' : 'text-white/80'}`}
              >
                ORDERS
                {activeTab === 'orders' && <span className="absolute left-0 right-0 -bottom-[2px] h-1.5 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`relative w-full text-center pb-1.5 truncate ${activeTab === 'sales' ? 'text-white' : 'text-white/80'}`}
              >
                SALES
                {activeTab === 'sales' && <span className="absolute left-0 right-0 -bottom-[2px] h-1.5 rounded-sm bg-[#f4c542]" />}
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`relative w-full text-center pb-1.5 truncate ${activeTab === 'settings' ? 'text-white' : 'text-white/80'}`}
              >
                SETTINGS
                {activeTab === 'settings' && <span className="absolute left-0 right-0 -bottom-[2px] h-1.5 rounded-sm bg-[#f4c542]" />}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {isStaff && activeTab === 'orders' ? (
          // ORDERS TAB - FIFO Queue
          <>
            {/* PENDING GCASH PAYMENTS SECTION */}
            {pendingPayments.length > 0 && (
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 mb-6 text-white">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                  💳 Pending GCash Payments 
                  <span className="bg-white bg-opacity-30 px-3 py-1 rounded-full text-sm">
                    {pendingPayments.length}
                  </span>
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingPayments.map(payment => (
                    <div key={payment._id} className="bg-white bg-opacity-95 rounded-lg p-4 text-gray-900 border-2 border-orange-400">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Order Number</p>
                          <p className="text-lg font-bold text-orange-600">#{payment.orderDbId?.orderNumber || payment.orderDbId?._id || 'N/A'}</p>
                          <p className="text-xs text-gray-600 mt-1">Queue #{payment.orderDbId?.queueNumber || 'N/A'} (Store Queue)</p>
                        </div>
                        <span className="bg-yellow-400 text-gray-900 px-2 py-1 rounded text-xs font-bold">
                          PENDING
                        </span>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg mb-3">
                        <p className="text-xs mb-1 text-gray-500">
                          <strong>Order Ref:</strong> {payment.orderDbId?._id || 'N/A'}
                        </p>
                        <p className="text-xs mb-1 text-gray-500">
                          <strong>Payment Ref:</strong> {payment._id}
                        </p>
                        <p className="text-sm mb-1">
                          <strong>Customer:</strong> {payment.customerId?.name || 'N/A'}
                        </p>
                        <p className="text-sm mb-1">
                          <strong>Amount:</strong> ₱{payment.amount?.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(payment.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {/* Proof of Payment */}
                      <div className="mb-3">
                        <p className="text-xs font-bold mb-2">Proof of Payment:</p>
                        {payment.proofOfPaymentUrl ? (
                          <div className="relative">
                            {(() => {
                              const resolvedProofUrl = toServerAssetUrl(payment.proofOfPaymentUrl);
                              const proofImageUrl = resolvedProofUrl.startsWith('data:')
                                ? resolvedProofUrl
                                : `${resolvedProofUrl}?payment=${payment._id}&t=${new Date(payment.createdAt || Date.now()).getTime()}`;
                              return (
                                <>
                            <img 
                              src={proofImageUrl} 
                              alt="Proof of Payment" 
                              className="w-full h-32 object-cover rounded-lg border-2 border-gray-300 cursor-pointer hover:opacity-90"
                              onClick={() => setSelectedProof(proofImageUrl)}
                              onError={(e) => {
                                console.error('Image load error:', e.target.src);
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <div style={{ display: 'none' }} className="text-red-600 text-xs">Image failed to load</div>
                            <button
                              onClick={() => setSelectedProof(proofImageUrl)}
                              className="absolute top-1 right-1 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs hover:bg-opacity-90"
                            >
                              🔍 View
                            </button>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-xs">No image uploaded</p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => approvePayment(payment._id)}
                          className="bg-green-500 text-white py-2 px-3 rounded font-semibold text-sm hover:bg-green-600 transition-all"
                        >
                          ✅ Approve
                        </button>
                        <button
                          onClick={() => rejectPayment(payment._id)}
                          className="bg-red-500 text-white py-2 px-3 rounded font-semibold text-sm hover:bg-red-600 transition-all"
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
                className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 cursor-pointer"
              >
                <div className="relative max-w-4xl max-h-screen p-4">
                  <button
                    onClick={() => setSelectedProof(null)}
                    className="absolute -top-12 right-0 bg-white text-gray-900 px-4 py-2 rounded-lg font-bold hover:bg-gray-200"
                  >
                    ✕ Close
                  </button>
                  <img 
                    src={selectedProof} 
                    alt="Proof of Payment Full View" 
                    className="max-w-full max-h-screen rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-[#c41e3a] to-[#8B0000] rounded-lg shadow-lg p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">📋 Live Orders Queue</h2>
              {hasActiveOrders && (
                <button
                  onClick={() => setShowQueueFlow(!showQueueFlow)}
                  className="bg-white text-[#8B0000] px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all text-sm"
                >
                  {showQueueFlow ? '📊 List View' : '🔄 Queue Flow'}
                </button>
              )}
            </div>

            {/* Queue Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-yellow-400 bg-opacity-20 p-4 rounded-lg border-2 border-yellow-400">
                <p className="text-yellow-200 text-sm font-semibold mb-1">⏳ Pending</p>
                <p className="text-3xl font-bold">{queueStats.pending}</p>
              </div>
              <div className="bg-orange-400 bg-opacity-20 p-4 rounded-lg border-2 border-orange-400">
                <p className="text-orange-200 text-sm font-semibold mb-1">👨‍🍳 Preparing</p>
                <p className="text-3xl font-bold">{queueStats.preparing}</p>
              </div>
              <div className="bg-green-400 bg-opacity-20 p-4 rounded-lg border-2 border-green-400">
                <p className="text-green-200 text-sm font-semibold mb-1">✅ Ready</p>
                <p className="text-3xl font-bold">{queueStats.ready}</p>
              </div>
              <div className="bg-white bg-opacity-10 p-4 rounded-lg border-2 border-white border-opacity-30">
                <p className="text-gray-200 text-sm font-semibold mb-1">📈 Total</p>
                <p className="text-3xl font-bold">{queueStats.total}</p>
              </div>
            </div>

            {/* Queue Flow Visualization */}
            {showQueueFlow && hasActiveOrders && (
              <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max pb-2">
                  {getPendingOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-yellow-400 text-gray-900 flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getPendingOrders().length - 1 && <div className="text-yellow-400 text-2xl mx-2">→</div>}
                    </div>
                  ))}
                  {getPendingOrders().length > 0 && getPreparingOrders().length > 0 && <div className="text-orange-400 text-2xl mx-3">⬇️</div>}
                  {getPreparingOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getPreparingOrders().length - 1 && <div className="text-orange-400 text-2xl mx-2">→</div>}
                    </div>
                  ))}
                  {getPreparingOrders().length > 0 && getReadyOrders().length > 0 && <div className="text-green-400 text-2xl mx-3">⬇️</div>}
                  {getReadyOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-green-400 text-white flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getReadyOrders().length - 1 && <div className="text-green-400 text-2xl mx-2">→</div>}
                    </div>
                  ))}
                </div>
                <p className="text-gray-300 text-xs mt-3">🟡 Pending → 🟠 Preparing → 🟢 Ready</p>
              </div>
            )}

            {/* Orders by Status - List View */}
            {(!showQueueFlow || !hasActiveOrders) && (
              <div className="space-y-8">
                {/* Pending Orders */}
                {getPendingOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-yellow-400 mb-4">⏳ Pending Orders</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getPendingOrders().map(order => (
                        <div key={order._id} className="bg-yellow-400 bg-opacity-15 border-2 border-yellow-400 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-lg font-bold">Queue #{order.queueNumber}</span>
                              <p className="text-xs opacity-75 mt-1">Order #{order.orderNumber || order._id}</p>
                              <p className="text-xs opacity-75 mt-1">ID: {order._id}</p>
                            </div>
                            <span className="bg-yellow-400 text-gray-900 px-2 py-1 rounded text-xs font-bold">PENDING</span>
                          </div>
                          <p className="text-sm mb-2"><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <p className="text-xs opacity-75"><strong>Amount:</strong></p>
                              <p className="text-sm">₱{order.totalAmount}</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-75"><strong>Payment:</strong></p>
                              <p className="text-sm font-semibold">{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                            </div>
                          </div>
                          <button onClick={() => updateOrderStatus(order._id, 'preparing')} className="w-full bg-orange-400 text-white py-2 rounded font-semibold hover:bg-orange-500 transition-all">Start Preparing</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preparing Orders */}
                {getPreparingOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-orange-400 mb-4">👨‍🍳 Preparing Orders</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getPreparingOrders().map(order => (
                        <div key={order._id} className="bg-orange-400 bg-opacity-15 border-2 border-orange-400 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-lg font-bold">Queue #{order.queueNumber}</span>
                              <p className="text-xs opacity-75 mt-1">Order #{order.orderNumber || order._id}</p>
                              <p className="text-xs opacity-75 mt-1">ID: {order._id}</p>
                            </div>
                            <span className="bg-orange-400 text-white px-2 py-1 rounded text-xs font-bold">PREPARING</span>
                          </div>
                          <p className="text-sm mb-2"><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <p className="text-xs opacity-75"><strong>Amount:</strong></p>
                              <p className="text-sm">₱{order.totalAmount}</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-75"><strong>Payment:</strong></p>
                              <p className="text-sm font-semibold">{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => updateOrderStatus(order._id, 'ready')} className="flex-1 bg-green-500 text-white py-2 rounded font-semibold hover:bg-green-600 transition-all">Order Ready</button>
                            <button onClick={() => updateOrderStatus(order._id, 'pending')} className="flex-1 bg-yellow-400 text-gray-900 py-2 rounded font-semibold hover:bg-yellow-500 transition-all">Back</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ready Orders */}
                {getReadyOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-green-400 mb-4">✅ Ready (Awaiting Pickup)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getReadyOrders().map(order => (
                        <div key={order._id} className="bg-green-400 bg-opacity-15 border-2 border-green-400 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-lg font-bold">Queue #{order.queueNumber}</span>
                              <p className="text-xs opacity-75 mt-1">Order #{order.orderNumber || order._id}</p>
                              <p className="text-xs opacity-75 mt-1">ID: {order._id}</p>
                            </div>
                            <span className="bg-green-400 text-white px-2 py-1 rounded text-xs font-bold">READY</span>
                          </div>
                          <p className="text-sm mb-2"><strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <p className="text-xs opacity-75"><strong>Amount:</strong></p>
                              <p className="text-sm">₱{order.totalAmount}</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-75"><strong>Payment:</strong></p>
                              <p className="text-sm font-semibold">{order.paymentMethod?.toUpperCase() || 'CASH'}</p>
                            </div>
                          </div>
                          {getGraceTimeLeft(order) !== null && (
                            <div className={`mb-3 rounded px-3 py-2 text-sm font-semibold ${getGraceTimeLeft(order) <= 60 * 1000 ? 'bg-red-600 text-white' : 'bg-white bg-opacity-20 text-white'}`}>
                              ⏳ Grace Period Left: {formatGraceTime(getGraceTimeLeft(order))}
                            </div>
                          )}
                          <button onClick={() => updateOrderStatus(order._id, 'completed')} className="w-full bg-gray-400 text-white py-2 rounded font-semibold hover:bg-gray-500 transition-all">Mark as Picked Up</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Refund Orders */}
                {getRefundRequiredOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-red-300 mb-4">💸 Refund Needed (Cancelled GCash)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getRefundRequiredOrders().map((order) => {
                        const isUploading = uploadingRefundForOrder === order._id;
                        const selectedFile = refundProofFiles[order._id];

                        return (
                          <div key={order._id} className="bg-red-500 bg-opacity-20 border-2 border-red-300 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <span className="text-lg font-bold">Queue #{order.queueNumber}</span>
                                <p className="text-xs opacity-75 mt-1">Order #{order.orderNumber || order._id}</p>
                                <p className="text-xs opacity-75 mt-1">ID: {order._id}</p>
                              </div>
                              <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-bold">REFUND NEEDED</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                              <div>
                                <p className="text-xs opacity-80"><strong>Customer:</strong></p>
                                <p>{order.customerId?.name || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs opacity-80"><strong>Amount:</strong></p>
                                <p>₱{Number(order.totalAmount || 0).toFixed(2)}</p>
                              </div>
                            </div>

                            <label className="block text-xs font-semibold mb-1">Refund proof image *</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleRefundProofChange(order._id, e.target.files?.[0])}
                              className="w-full text-xs mb-3"
                            />

                            <button
                              onClick={() => submitRefundProof(order._id)}
                              disabled={!selectedFile || isUploading}
                              className={`w-full py-2 rounded font-semibold text-sm ${!selectedFile || isUploading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                            >
                              {isUploading ? 'Uploading...' : 'Submit Refund Proof'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Awaiting Customer Confirmation */}
                {getAwaitingRefundConfirmationOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-blue-200 mb-4">⏳ Awaiting Customer Confirmation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getAwaitingRefundConfirmationOrders().map((order) => (
                        <div key={`awaiting-${order._id}`} className="bg-blue-500 bg-opacity-20 border-2 border-blue-300 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-lg font-bold">Queue #{order.queueNumber}</span>
                              <p className="text-xs opacity-75 mt-1">Order #{order.orderNumber || order._id}</p>
                            </div>
                            <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs font-bold">PROOF SENT</span>
                          </div>
                          <p className="text-sm"><strong>Customer:</strong> {order.customerId?.name || 'N/A'}</p>
                          <p className="text-sm"><strong>Amount:</strong> ₱{Number(order.totalAmount || 0).toFixed(2)}</p>
                          <p className="text-xs opacity-80 mt-2">
                            <strong>Proof sent:</strong> {order.refundProofSentAt ? new Date(order.refundProofSentAt).toLocaleString() : 'N/A'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasActiveOrders && (
                  <div className="text-center py-12">
                    <p className="text-xl opacity-70">✨ No orders in queue - You're all caught up!</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">🕘 Order History</h3>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-6 gap-2 bg-gray-100 text-xs font-bold text-gray-700 uppercase px-4 py-3">
                <div>Status</div>
                <div>Queue #</div>
                <div className="col-span-2">Items</div>
                <div>Reason</div>
                <div>Updated At</div>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {(() => {
                  const historyRows = [
                    ...salesOrders.map((order) => ({
                      ...order,
                      historyType: 'completed',
                    })),
                    ...getCancelledOrders().map((order) => ({
                      ...order,
                      historyType: 'cancelled',
                    })),
                  ].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

                  if (historyRows.length === 0) {
                    return <div className="px-4 py-8 text-center text-gray-500">No completed or cancelled orders yet.</div>;
                  }

                  return historyRows.map((order) => (
                    <div key={`${order.historyType}-${order._id}`} className="grid grid-cols-6 gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-700">
                      <div>
                        <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-bold ${order.historyType === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {order.historyType === 'completed' ? 'COMPLETED' : 'CANCELLED'}
                        </span>
                      </div>
                      <div className="font-semibold">#{order.orderNumber || order.queueNumber || order._id}</div>
                      <div className="col-span-2">{order.items?.map((item) => `${item.quantity}x ${item.name}`).join(', ') || 'N/A'}</div>
                      <div>
                        {order.historyType === 'cancelled'
                          ? (
                            order.cancellationReason === 'payment_rejected'
                              ? 'Payment rejected'
                              : order.cancellationReason === 'grace_period_expired'
                                ? 'Grace period expired'
                                : 'Manual cancel'
                          )
                          : '-'}
                      </div>
                      <div>{order.updatedAt ? new Date(order.updatedAt).toLocaleString() : 'N/A'}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
          </>
        ) : isStaff && activeTab === 'sales' ? (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 md:p-8">
            <div className="flex items-center justify-center mb-6">
              <h2 className="text-3xl md:text-4xl font-black tracking-wide text-gray-900">SALES</h2>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-5 gap-2 bg-gray-100 text-xs font-bold text-gray-700 uppercase px-4 py-3">
                <div>Order Placed Date/Time</div>
                <div>Item</div>
                <div>Order ID</div>
                <div>Payment</div>
                <div>Order Completed Date/Time</div>
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {salesOrders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">No completed orders yet.</div>
                ) : (
                  salesOrders.map((order) => (
                    <div key={order._id} className="grid grid-cols-5 gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-700">
                      <div>{order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}</div>
                      <div>{order.items?.map(i => i.name).join(', ') || 'N/A'}</div>
                      <div>{order.orderNumber || order.queueNumber || order._id}</div>
                      <div>{order.paymentMethod?.toUpperCase() || 'CASH'}</div>
                      <div>{order.updatedAt ? new Date(order.updatedAt).toLocaleString() : 'N/A'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end mt-6 gap-3">
              <button
                onClick={handleExportSalesCSV}
                className="px-4 py-2 border border-gray-400 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Export CSV
              </button>
              <button
                onClick={handleExportSalesPDF}
                className="px-4 py-2 border border-gray-400 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Export PDF
              </button>
            </div>
          </div>
        ) : isStaff && activeTab === 'settings' ? (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 md:p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Store Settings</h2>
            <p className="text-gray-600 mb-6">Update your store status and GCash number shown to customers during payment.</p>

            {settingsMessage && (
              <div className={`mb-4 rounded-lg p-3 text-sm font-semibold ${settingsMessage.toLowerCase().includes('failed') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {settingsMessage}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="flex justify-end">
                {!isEditingSettings ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingSettings(true);
                      setSettingsMessage('');
                    }}
                    className="px-4 py-2 rounded-lg font-semibold border border-gray-400 text-gray-800 hover:bg-gray-100"
                  >
                    Edit Settings
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCancelSettingsEdit}
                    className="px-4 py-2 rounded-lg font-semibold border border-gray-400 text-gray-800 hover:bg-gray-100"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="rounded-lg border-2 border-gray-300 p-4 space-y-3">
                <h3 className="text-lg font-bold text-gray-900">Store Status</h3>
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1">CURRENT STORE STATUS</p>
                  <p className={`text-xl font-bold tracking-wide ${storeOpen ? 'text-green-700' : 'text-red-700'}`}>
                    {storeOpen ? 'OPEN (Available)' : 'CLOSED'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Store Availability</label>
                  <select
                    value={storeOpen ? 'open' : 'closed'}
                    onChange={(e) => setStoreOpen(e.target.value === 'open')}
                    disabled={!isEditingSettings}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000] bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="open">Open (Available to customers)</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border-2 border-gray-300 p-4 space-y-3">
                <h3 className="text-lg font-bold text-gray-900">GCash Number</h3>
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1">CURRENT GCASH NUMBER SHOWN TO CUSTOMERS</p>
                  <p className="text-xl font-bold text-gray-900 tracking-wide">{user?.gcashNumber?.trim() || 'Not set'}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">GCash Number</label>
                  <input
                    type="text"
                    value={gcashNumber}
                    onChange={(e) => setGcashNumber(e.target.value)}
                    disabled={!isEditingSettings}
                    placeholder="09XXXXXXXXX"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000] disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              {isEditingSettings && (
                <button
                  type="submit"
                  disabled={savingSettings}
                  className={`px-5 py-2 rounded-lg font-semibold text-white ${savingSettings ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#8B0000] hover:bg-red-800'}`}
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              )}
            </form>
          </div>
        ) : (
          // PRODUCTS TAB
          <div>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8 border-b-4 border-[#8B0000]">
              {!isStaff && (
                <button
                  onClick={() => navigate('/menu')}
                  className="mb-4 px-4 py-2 text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                >
                  ← Back to Stores
                </button>
              )}
              <div className="flex items-center gap-6 mb-4">
                <div className="w-20 h-20 bg-[#8B0000] rounded-lg flex items-center justify-center text-5xl overflow-hidden">
                  {stall.logoUrl ? (
                    <img
                      src={toServerAssetUrl(stall.logoUrl)}
                      alt={`${stall.name} logo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    stall.logo
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{stall.name}</h1>
                  {!isStaff && (
                    <p className={`text-sm font-semibold mt-1 ${isStoreClosedForCustomer ? 'text-red-600' : 'text-green-600'}`}>
                      {isStoreClosedForCustomer ? 'Store is currently closed' : 'Store is open'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {isStoreClosedForCustomer && (
              <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Ordering is currently unavailable because this store is closed.
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">Loading menu items...</div>
            ) : (
              isStaff ? (
                <div className="space-y-8">
                  {items.length === 0 ? (
                    <>
                      <div className="text-center py-12 bg-white rounded-lg">
                        No menu items available for this stall
                      </div>
                      <div className="max-w-sm bg-white rounded-lg border-4 border-dashed border-gray-300 shadow flex items-center justify-center cursor-pointer hover:scale-105 transform duration-200">
                        <button
                          onClick={() => setShowAddItemModal(true)}
                          className="flex flex-col items-center justify-center p-8 text-gray-500 w-full h-full"
                        >
                          <div className="w-20 h-20 rounded border border-gray-300 flex items-center justify-center text-4xl">+</div>
                          <p className="mt-3 font-semibold">Add Item</p>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="max-w-sm bg-white rounded-lg border-4 border-dashed border-gray-300 shadow flex items-center justify-center cursor-pointer hover:scale-105 transform duration-200">
                        <button
                          onClick={() => setShowAddItemModal(true)}
                          className="flex flex-col items-center justify-center p-8 text-gray-500 w-full h-full"
                        >
                          <div className="w-20 h-20 rounded border border-gray-300 flex items-center justify-center text-4xl">+</div>
                          <p className="mt-3 font-semibold">Add Item</p>
                        </button>
                      </div>

                      {categoryGroups.map((group) => (
                        <div key={group.category} className="space-y-4">
                          <h2 className="text-2xl font-bold text-gray-900">{group.category}</h2>
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-6">
                            {group.items.map(item => (
                              <div
                                key={item._id}
                                onClick={() => setEditingItem(item)}
                                className="bg-white rounded-lg border-2 sm:border-4 border-gray-300 shadow hover:shadow-lg transition-shadow overflow-hidden flex flex-col cursor-pointer hover:border-[#8B0000]"
                              >
                                <div className="p-2 sm:p-6 flex flex-col items-center gap-2 sm:gap-3 w-full">
                                  <div className="w-full aspect-square max-w-[90px] sm:max-w-none bg-[#8B0000] rounded-md flex items-center justify-center text-lg sm:text-3xl text-white overflow-hidden">
                                    {item.image ? (
                                      <img
                                        src={resolveItemImage(item.image)}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold uppercase">Img</span>
                                    )}
                                  </div>
                                    <div className="w-full min-w-0">
                                      <h3 className="text-sm sm:text-lg font-semibold text-gray-900 text-center w-full min-h-[2.75rem] sm:min-h-[3.5rem] max-h-[2.75rem] sm:max-h-[3.5rem] overflow-hidden flex items-center justify-center leading-tight break-words">
                                      {item.name}
                                    </h3>
                                      <p className="text-xs sm:text-sm text-gray-600 text-center mt-0.5">Qty: <span className="font-bold">{item.quantity ?? 0}</span></p>
                                      <p className={`text-xs sm:text-xs font-semibold mt-0.5 text-center ${item.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {item.quantity > 0 ? 'Available' : 'Not Available'}
                                    </p>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setEditingItem(item);
                                      }}
                                        className="mt-2 sm:mt-3 px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-400 rounded text-xs sm:text-sm font-semibold hover:bg-gray-100 w-full"
                                    >
                                      Edit Item
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {items.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg">
                      No menu items available for this stall
                    </div>
                  ) : (
                    categoryGroups.map((group) => (
                      <div key={group.category} className="space-y-4">
                        <h2 className="text-2xl font-bold text-gray-900">{group.category}</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
                          {group.items.map(item => {
                            const availableQty = item.quantity ?? 0;
                            const quantity = itemQuantities[item._id] || 0;
                            const isAvailable = availableQty > 0;
                            const requiresRiceChoice =
                              String(item.category || '').toLowerCase() === 'main' &&
                              (item.noRiceAvailable || item.withRiceAvailable);
                            const hasVariationOptions = Array.isArray(item.variationOptions)
                              && item.variationOptions.some((option) => String(option?.name || '').trim());
                            const hasLegacyVariation = String(item.variation || '').trim().length > 0;
                            const requiresVariationChoice = hasVariationOptions || hasLegacyVariation;
                            const variationNames = Array.isArray(item.variationOptions) && item.variationOptions.length > 0
                              ? item.variationOptions.map((option) => option.name).filter(Boolean).join(', ')
                              : String(item.variation || '').trim();
                            return (
                              <div 
                                key={item._id}
                                onClick={() => {
                                  setSelectedProduct(item);
                                }}
                                className={`bg-white rounded-lg border-2 sm:border-4 border-gray-300 shadow transition-all overflow-hidden flex flex-col self-start ${isStoreClosedForCustomer ? 'cursor-pointer opacity-90 hover:shadow-md' : 'cursor-pointer hover:shadow-lg hover:border-[#8B0000]'}`}
                              >
                                <div className="p-2 sm:p-6 flex flex-col items-center gap-2 sm:gap-3 w-full">
                                  <div className="w-full aspect-square max-w-[110px] sm:max-w-none bg-gray-100 rounded-md flex items-center justify-center overflow-hidden">
                                    {item.image ? (
                                      <img
                                        src={resolveItemImage(item.image)}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold uppercase text-gray-500">Img</span>
                                    )}
                                  </div>

                                  <div className="w-full min-w-0 flex flex-col flex-1">
                                    <h3 className="text-sm sm:text-lg font-semibold text-gray-900 text-center w-full min-h-[2.75rem] sm:min-h-[3.5rem] max-h-[2.75rem] sm:max-h-[3.5rem] overflow-hidden flex items-center justify-center leading-tight break-words">
                                    {item.name}
                                    </h3>

                                    <p className={`text-xs sm:text-xs font-semibold mt-0.5 mb-2 sm:mb-3 text-center ${isAvailable ? 'text-green-600' : 'text-red-600'}`}>
                                      {isAvailable ? `Available: ${availableQty}` : 'Not Available'}
                                    </p>

                                    <p className="text-lg sm:text-xl font-bold text-gray-900 text-center mb-2 sm:mb-3">₱{item.price}</p>

                                    {variationNames ? (
                                      <p className="text-xs sm:text-sm text-gray-600 text-center mb-2 sm:mb-3 line-clamp-2">
                                        {variationNames}
                                      </p>
                                    ) : null}

                                    {!requiresRiceChoice && !requiresVariationChoice && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="border border-gray-400 sm:border-2 rounded px-2 sm:px-3 py-1 sm:py-2 mb-2 sm:mb-3"
                                      >
                                        <p className="text-center text-sm sm:text-sm font-semibold text-gray-700">{quantity}</p>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (isStoreClosedForCustomer) return;
                                              setItemQuantities(prev => ({
                                                ...prev,
                                                [item._id]: Math.max(0, quantity - 1)
                                              }));
                                            }}
                                            className="text-sm sm:text-lg font-bold text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
                                          >
                                            −
                                          </button>
                                          <span className="text-sm sm:text-xs font-semibold text-gray-600">Qty</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (isStoreClosedForCustomer) return;
                                              setItemQuantities(prev => ({
                                                ...prev,
                                                [item._id]: Math.min(availableQty, quantity + 1)
                                              }));
                                            }}
                                            className="text-sm sm:text-lg font-bold text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {requiresRiceChoice && (
                                      <p className="text-sm sm:text-sm text-gray-700 mb-2 sm:mb-3 text-center">Select rice option before adding.</p>
                                    )}

                                    <button
                                      disabled={isStoreClosedForCustomer || !isAvailable || (!requiresRiceChoice && !requiresVariationChoice && quantity === 0)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isStoreClosedForCustomer) {
                                          alert('This store is currently closed and cannot accept orders.');
                                          return;
                                        }
                                        if (requiresVariationChoice || requiresRiceChoice) {
                                          setSelectedProduct(item);
                                          return;
                                        }
                                        for (let i = 0; i < quantity; i++) {
                                          const itemToAdd = {
                                            ...item,
                                            stallId: stallId
                                          };
                                          addToCart(itemToAdd);
                                        }
                                        setItemQuantities(prev => ({
                                          ...prev,
                                          [item._id]: 0
                                        }));
                                      }}
                                      className={`mt-auto w-full py-1.5 sm:py-2 rounded-lg font-bold transition-all text-sm sm:text-lg ${
                                        isStoreClosedForCustomer || !item.isAvailable || (!requiresRiceChoice && !requiresVariationChoice && quantity === 0)
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                          : 'bg-[#8B0000] text-white hover:bg-red-800'
                                      }`}
                                    >
                                      {requiresVariationChoice ? 'Choose Variation' : requiresRiceChoice ? 'Choose Rice Option' : 'Add to Basket'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Floating Basket Button - Bottom Right */}
      {!isStaff && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => {
              if (isStoreClosedForCustomer) {
                alert('This store is currently closed and cannot accept orders.');
                return;
              }
              navigate('/cart');
            }}
            onMouseEnter={() => setShowCartPreview(true)}
            onMouseLeave={() => setShowCartPreview(false)}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold transition-all shadow-lg ${isStoreClosedForCustomer ? 'bg-gray-400 text-gray-100 cursor-not-allowed' : 'bg-[#8B0000] text-white hover:bg-red-800 hover:shadow-xl'}`}
            title="View Cart"
          >
            🛒
            {cartItems.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-yellow-300 text-[#8B0000] rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                {cartItems.length}
              </span>
            )}
          </button>

          {showCartPreview && (
            <CartPreview 
              cartItems={cartItems}
              cartTotal={cartTotal}
              onCheckoutClick={() => navigate('/cart')}
            />
          )}
        </div>
      )}

      {/* Add Item Modal - Staff Only */}
      {showAddItemModal && isStaff && (
        <AddItemModal
          stallId={stallId}
          onClose={() => setShowAddItemModal(false)}
          onSave={(newItem) => {
            setItems(prevItems => [...prevItems, newItem]);
            setShowAddItemModal(false);
          }}
        />
      )}

      {/* Edit Item Modal - Staff Only */}
      {editingItem && isStaff && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(updatedItem) => {
            setItems(prevItems =>
              prevItems.map(i => i._id === updatedItem._id ? updatedItem : i)
            );
            setEditingItem(null);
          }}
          onDelete={(deletedItem) => {
            setItems(prevItems =>
              prevItems.filter(i => i._id !== deletedItem._id)
            );
            setEditingItem(null);
          }}
        />
      )}

      {/* Product Detail Modal - Customers Only */}
      {selectedProduct && !isStaff && (
        <ProductDetail
          item={selectedProduct}
          stall={stall}
          stallId={stallId}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(item) => {
            if (isStoreClosedForCustomer) {
              alert('This store is currently closed and cannot accept orders.');
              return;
            }
            addToCart(item);
          }}
        />
      )}
    </div>
  );
};

export default StallMenu;
