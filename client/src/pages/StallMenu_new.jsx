import { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import ProductDetail from '../components/ProductDetail.jsx';
import CartPreview from '../components/CartPreview.jsx';
import EditItemModal from '../components/EditItemModal.jsx';
import AddItemModal from '../components/AddItemModal.jsx';
import { getSocket } from '../services/socket.js';

const StallMenu = () => {
  const { stallId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
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
  const [showQueueFlow, setShowQueueFlow] = useState(true);

  const stalls = {
    1: { name: 'Store 1', logo: '🍔' },
    2: { name: 'Store 2', logo: '🍜' },
    3: { name: 'Store 3', logo: '🍕' },
    4: { name: 'Store 4', logo: '🍱' },
    5: { name: 'Store 5', logo: '🍲' },
    6: { name: 'Store 6', logo: '🥘' },
    7: { name: 'Store 7', logo: '🍛' },
    8: { name: 'Store 8', logo: '🥙' },
  };

  const stall = stalls[stallId];
  const isStaff = user?.role === 'stall_staff';

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
  }, [user, navigate, stallId]);

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

    socket.emit('join_stall', stallId);
    socket.on('menu:updated', handleMenuUpdated);

    return () => {
      socket.emit('leave_stall', stallId);
      socket.off('menu:updated', handleMenuUpdated);
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

  // Fetch orders for staff
  useEffect(() => {
    if (isStaff) {
      const fetchOrders = async () => {
        try {
          const res = await api.get(`/orders`);
          const activeOrders = res.data.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
          setOrders(activeOrders);
        } catch (err) {
          console.error('Error fetching orders:', err);
        }
      };
      fetchOrders();
      const interval = setInterval(fetchOrders, 5000);
      return () => clearInterval(interval);
    }
  }, [isStaff]);

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      alert("Cart is empty!");
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

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await api.put(`/orders/${orderId}`, { status: newStatus });
      setOrders(orders.map(o => 
        o._id === orderId ? { ...o, status: newStatus } : o
      ));
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Failed to update order status');
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

  if (!stall) {
    return <div className="text-center py-12">Stall not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header Navigation - staff or customer */}
      {!isStaff ? (
        <header className="bg-[#8B0000] text-white shadow-lg sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/menu')}>
              <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
              <span className="text-xl font-bold">ClickPick</span>
            </div>

            <nav className="flex items-center gap-8">
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
      ) : (
        <header className="bg-[#8B0000] text-white shadow sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white text-[#8B0000] rounded-sm flex items-center justify-center font-bold">Logo</div>
              <div className="hidden sm:block">
                <span className="text-lg font-semibold">CANTEEN DASHBOARD</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => setActiveTab('products')}
                className={`font-semibold transition-all ${activeTab === 'products' ? 'underline text-white' : 'opacity-70 hover:opacity-100'}`}
              >
                PRODUCTS
              </button>
              <button 
                onClick={() => setActiveTab('orders')}
                className={`font-semibold transition-all ${activeTab === 'orders' ? 'underline text-white' : 'opacity-70 hover:opacity-100'}`}
              >
                ORDERS
              </button>
              <button 
                onClick={() => setActiveTab('sales')}
                className={`font-semibold transition-all ${activeTab === 'sales' ? 'underline text-white' : 'opacity-70 hover:opacity-100'}`}
              >
                SALES
              </button>
              <button 
                onClick={() => setActiveTab('settings')}
                className={`font-semibold transition-all ${activeTab === 'settings' ? 'underline text-white' : 'opacity-70 hover:opacity-100'}`}
              >
                SETTINGS
              </button>
            </nav>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right mr-2">
                <span className="font-semibold text-sm uppercase">{(user?.name || 'DELA CRUZ, JUAN A.').toUpperCase()}</span>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#8B0000] font-bold"
                >
                  {user?.name?.charAt(0) || 'D'}
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
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {isStaff && activeTab === 'orders' ? (
          // ORDERS TAB - FIFO Queue
          <div className="bg-gradient-to-br from-[#c41e3a] to-[#8B0000] rounded-lg shadow-lg p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold📋 Live Orders Queue (FIFO)</h2>
              <button
                onClick={() => setShowQueueFlow(!showQueueFlow)}
                className="bg-white text-[#8B0000] px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all text-sm"
              >
                {showQueueFlow ? '📊 List View' : '🔄 Queue Flow'}
              </button>
            </div>

            {/* Queue Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-yellow-400 bg-opacity-20 p-4 rounded-lg border-2 border-yellow-400">
                <p className="text-yellow-200 text-sm font-semibold mb-1"⏳ Pending</p>
                <p className="text-3xl font-bold">{getQueueStats().pending}</p>
              </div>
              <div className="bg-orange-400 bg-opacity-20 p-4 rounded-lg border-2 border-orange-400">
                <p className="text-orange-200 text-sm font-semibold mb-1"👨‍🍳 Preparing</p>
                <p className="text-3xl font-bold">{getQueueStats().preparing}</p>
              </div>
              <div className="bg-green-400 bg-opacity-20 p-4 rounded-lg border-2 border-green-400">
                <p className="text-green-200 text-sm font-semibold mb-1"✅ Ready</p>
                <p className="text-3xl font-bold">{getQueueStats().ready}</p>
              </div>
              <div className="bg-white bg-opacity-10 p-4 rounded-lg border-2 border-white border-opacity-30">
                <p className="text-gray-200 text-sm font-semibold mb-1"📈 Total</p>
                <p className="text-3xl font-bold">{getQueueStats().total}</p>
              </div>
            </div>

            {/* Queue Flow Visualization */}
            {showQueueFlow && getQueueStats().total > 0 && (
              <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max pb-2">
                  {getPendingOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-yellow-400 text-gray-900 flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getPendingOrders().length - 1 && <div className="text-yellow-400 text-2xl mx-2"→</div>}
                    </div>
                  ))}
                  {getPendingOrders().length > 0 && getPreparingOrders().length > 0 && <div className="text-orange-400 text-2xl mx-3"⬇️</div>}
                  {getPreparingOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getPreparingOrders().length - 1 && <div className="text-orange-400 text-2xl mx-2"→</div>}
                    </div>
                  ))}
                  {getPreparingOrders().length > 0 && getReadyOrders().length > 0 && <div className="text-green-400 text-2xl mx-3"⬇️</div>}
                  {getReadyOrders().map((order, idx) => (
                    <div key={order._id} className="flex items-center">
                      <div className="w-14 h-14 rounded-full bg-green-400 text-white flex items-center justify-center font-bold text-sm text-center">
                        <div>
                          <p className="text-xs">#{order.queueNumber}</p>
                        </div>
                      </div>
                      {idx < getReadyOrders().length - 1 && <div className="text-green-400 text-2xl mx-2"→</div>}
                    </div>
                  ))}
                </div>
                <p className="text-gray-300 text-xs mt-3"🟡 Pending → 🟠 Preparing → 🟢 Ready</p>
              </div>
            )}

            {/* Orders by Status - List View */}
            {!showQueueFlow && (
              <div className="space-y-8">
                {/* Pending Orders */}
                {getPendingOrders().length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-yellow-400 mb-4">⏳ Pending Orders</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getPendingOrders().map(order => (
                        <div key={order._id} className="bg-yellow-400 bg-opacity-15 border-2 border-yellow-400 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-lg font-bold">Order #{order.queueNumber}</span>
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
                            <span className="text-lg font-bold">Order #{order.queueNumber}</span>
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
                            <span className="text-lg font-bold">Order #{order.queueNumber}</span>
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
                          <button onClick={() => updateOrderStatus(order._id, 'completed')} className="w-full bg-gray-400 text-white py-2 rounded font-semibold hover:bg-gray-500 transition-all">Mark as Picked Up</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {getQueueStats().total === 0 && (
                  <div className="text-center py-12">
                    <p className="text-xl opacity-70"✨ No orders in queue - You're all caught up!</p>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {getQueueStats().total === 0 && showQueueFlow && (
              <div className="text-center py-12">
                <p className="text-xl opacity-70"✨ No orders in queue - You're all caught up!</p>
              </div>
            )}
          </div>
        ) : isStaff && activeTab === 'sales' ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 text-lg">Sales Analytics (Coming Soon)</p>
          </div>
        ) : isStaff && activeTab === 'settings' ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 text-lg">Settings (Coming Soon)</p>
          </div>
        ) : (
          // PRODUCTS TAB
          <div>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8 border-b-4 border-[#8B0000]">
              <div className="flex items-center gap-6 mb-4">
                <div className="w-20 h-20 bg-[#8B0000] rounded-lg flex items-center justify-center text-5xl">
                  {stall.logo}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{stall.name}</h1>
                  <p className="text-gray-600 mt-1">Menu Items</p>
                </div>
              </div>
            </div>

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
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {group.items.map(item => (
                              <div
                                key={item._id}
                                onClick={() => setEditingItem(item)}
                                className="bg-white rounded-lg border-4 border-gray-300 shadow hover:shadow-lg transition-shadow overflow-hidden flex flex-col cursor-pointer hover:border-[#8B0000] hover:scale-105 transform duration-200"
                              >
                                <div className="p-6 flex flex-col items-center gap-3">
                                  <div className="w-28 h-28 bg-[#8B0000] rounded-md flex items-center justify-center text-3xl text-white">Img</div>
                                  <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                                  <p className="text-sm text-gray-600">Quantity: <span className="font-bold">{item.quantity ?? 24}</span></p>
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setEditingItem(item);
                                    }}
                                    className="mt-3 px-4 py-2 border border-gray-400 rounded text-sm font-semibold hover:bg-gray-100 w-full"
                                  >
                                    Edit Item
                                  </button>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                          {group.items.map(item => {
                            const quantity = itemQuantities[item._id] || 0;
                            const requiresRiceChoice =
                              String(item.category || '').toLowerCase() === 'main' &&
                              (item.noRiceAvailable || item.withRiceAvailable);
                            return (
                              <div 
                                key={item._id}
                                onClick={() => setSelectedProduct(item)}
                                className="bg-white rounded-lg border-2 border-gray-300 shadow-lg hover:shadow-xl transition-shadow overflow-hidden flex flex-col cursor-pointer hover:border-[#8B0000] hover:scale-105 transform duration-200"
                              >
                                <div className="bg-[#8B0000] h-32 flex items-center justify-center text-5xl border-b-2 border-gray-300">
                                  🍽️
                                </div>
                                
                                <div className="p-4 flex-grow flex flex-col">
                                  <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
                                  <p className="text-2xl font-bold text-gray-900 my-2">₱{item.price}</p>
                                  
                                  <p className="text-xs text-gray-500 mb-3">
                                    {item.isAvailable ? '✓ Available' : '✗ Low Stock'}
                                  </p>

                                  {!requiresRiceChoice && (
                                    <div 
                                      onClick={(e) => e.stopPropagation()}
                                      className="border-2 border-gray-400 rounded px-3 py-2 mb-3"
                                    >
                                      <p className="text-center text-sm font-semibold text-gray-700">{quantity}</p>
                                      <div className="flex items-center justify-between gap-2 mt-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setItemQuantities(prev => ({
                                              ...prev,
                                              [item._id]: Math.max(0, quantity - 1)
                                            }));
                                          }}
                                          className="text-lg font-bold text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
                                        >
                                          −
                                        </button>
                                        <span className="text-xs font-semibold text-gray-600">Qty</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setItemQuantities(prev => ({
                                              ...prev,
                                              [item._id]: quantity + 1
                                            }));
                                          }}
                                          className="text-lg font-bold text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {requiresRiceChoice && (
                                    <p className="text-xs text-gray-600 mb-3">Select rice option before adding.</p>
                                  )}

                                  <button 
                                    disabled={!item.isAvailable || (!requiresRiceChoice && quantity === 0)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (requiresRiceChoice) {
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
                                    className={`w-full py-2 rounded-lg font-bold transition-all text-sm ${
                                      !item.isAvailable || (!requiresRiceChoice && quantity === 0)
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-[#8B0000] text-white hover:bg-red-800'
                                    }`}
                                  >
                                    {requiresRiceChoice ? 'Choose Rice Option' : 'Add to Basket'}
                                  </button>
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
            onClick={() => navigate('/cart')}
            onMouseEnter={() => setShowCartPreview(true)}
            onMouseLeave={() => setShowCartPreview(false)}
            className="bg-[#8B0000] text-white w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold hover:bg-red-800 transition-all shadow-lg hover:shadow-xl"
            title="View Basket"
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
            addToCart(item);
          }}
        />
      )}
    </div>
  );
};

export default StallMenu;
