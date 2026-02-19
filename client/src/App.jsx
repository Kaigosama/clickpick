import React, { useContext, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import Auth from './pages/Auth';
import Menu from './pages/Menu';
import StallMenu from './pages/StallMenu';
import MyOrders from './pages/MyOrders';
import OrderHistory from './pages/OrderHistory';
import Kitchen from './pages/Kitchen';
import Profile from './pages/Profile';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import GCashPayment from './pages/GCashPayment';
import PaymentWaiting from './pages/PaymentWaiting';

// Root route should always show auth page first
const AuthOrDashboard = () => {
  return <Auth />;
};

const ProfileRedirect = () => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return null;

  if (user?.role === 'stall_staff') {
    return <Navigate to="/store-profile" replace />;
  }

  return <Profile />;
};

const TitleManager = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;

    if (path === '/' || path === '/auth') {
      document.title = 'ClickPick';
      return;
    }

    if (user?.role === 'stall_staff') {
      document.title = 'Canteen Staff';
      return;
    }

    document.title = 'Customer';
  }, [location.pathname, user?.role]);

  return null;
};

// Simple protection to ensure only logged-in users access internal pages
const PrivateRoute = ({ children, role }) => {
  const { user, loading } = useContext(AuthContext);
  const token = localStorage.getItem('token');

  if (loading) return null;

  if (!token || !user) return <Navigate to="/" replace />;

  if (role) {
    // allow role to be string or array of strings
    if (Array.isArray(role)) {
      if (!role.includes(user.role)) {
        // Redirect to appropriate dashboard based on user's actual role
        if (user.role === 'stall_staff') {
          const stallId = user.stallId || user._id || '1';
          return <Navigate to={`/stall/${stallId}`} replace />;
        } else if (user.role === 'customer') {
          return <Navigate to="/menu" replace />;
        }
        return <Navigate to="/" replace />;
      }
    } else {
      if (user.role !== role) {
        // Redirect to appropriate dashboard based on user's actual role
        if (user.role === 'stall_staff') {
          const stallId = user.stallId || user._id || '1';
          return <Navigate to={`/stall/${stallId}`} replace />;
        } else if (user.role === 'customer') {
          return <Navigate to="/menu" replace />;
        }
        return <Navigate to="/" replace />;
      }
    }
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <TitleManager />
        <div className="app-container">
          <Routes>
            {/* Public Route: Login/Register - Auto-redirects if already logged in */}
            <Route path="/" element={<AuthOrDashboard />} />
            <Route path="/auth" element={<AuthOrDashboard />} />

            {/* Customer Routes - Only accessible by customers */}
            <Route 
              path="/menu" 
              element={
                <PrivateRoute role="customer">
                  <Menu />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/stall/:stallId" 
              element={
                // Allow both customers and stall staff to view stall menu
                <PrivateRoute role={["customer", "stall_staff"]}>
                  <StallMenu />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/my-orders" 
              element={
                <PrivateRoute role="customer">
                  <MyOrders />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/order-history" 
              element={
                <PrivateRoute role="customer">
                  <OrderHistory />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <PrivateRoute role={["customer", "stall_staff"]}>
                  <ProfileRedirect />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/store-profile" 
              element={
                <PrivateRoute role="stall_staff">
                  <Profile />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/cart" 
              element={
                <PrivateRoute role="customer">
                  <Cart />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/basket" 
              element={
                <PrivateRoute role="customer">
                  <Cart />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/checkout" 
              element={
                <PrivateRoute role="customer">
                  <Checkout />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/gcash-payment" 
              element={
                <PrivateRoute role="customer">
                  <GCashPayment />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/payment-waiting" 
              element={
                <PrivateRoute role="customer">
                  <PaymentWaiting />
                </PrivateRoute>
              } 
            />

            {/* Staff Routes - Only accessible by canteen staff */}
            <Route 
              path="/kitchen" 
              element={
                <PrivateRoute role="stall_staff">
                  <Kitchen />
                </PrivateRoute>
              } 
            />

            {/* Catch-all route - redirect to appropriate page */}
            <Route path="*" element={<AuthOrDashboard />} />
          </Routes>
        </div>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;