import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx'; // Import the Context
import api from '../services/api'; // Import our centralized API service

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null); // User selects role first
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(''); 
  const [logoFile, setLogoFile] = useState(null);
  const [phone, setPhone] = useState('');
  
  const navigate = useNavigate();
  const { login } = useContext(AuthContext); // Get the login function from global state

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Validation Logic - Only check Mapúa email for customers
    if (!isLogin && selectedRole === 'customer' && !email.endsWith('@mymail.mapua.edu.ph')) {
      alert("Please use your Mapúa institutional email (@mymail.mapua.edu.ph).");
      return;
    }
    if (!isLogin && selectedRole === 'customer' && !phone) {
      alert("Phone number is required for customers.");
      return;
    }

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      
      // Prepare payload
      const isStaffRegistration = !isLogin && selectedRole === 'stall_staff';

      let payload = null;
      let config = undefined;

      if (isLogin) {
        payload = { email, password };
      } else if (isStaffRegistration) {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('password', password);
        formData.append('role', selectedRole);
        if (logoFile) {
          formData.append('logo', logoFile);
        }
        payload = formData;
        config = { headers: { 'Content-Type': 'multipart/form-data' } };
      } else {
        payload = { name, email, password, role: selectedRole, phone };
      }

      // 2. API Call using our service (automatically handles Base URL)
      const res = await api.post(endpoint, payload, config);

      if (isLogin) {
        if (selectedRole && res.data.user.role !== selectedRole) {
          alert(`This account is not a ${selectedRole === 'stall_staff' ? 'canteen staff' : 'customer'} account.`);
          return;
        }

        // 3. Update Global State
        // The API returns { token, user: { name, role, ... } }
        login(res.data.user, res.data.token);

        // 4. Redirect based on Role
        if (res.data.user.role === 'stall_staff') {
          // If the user has a `stallId` property use it, otherwise default to stall 1
            const stallId = res.data.user.stallId || res.data.user._id || '1';
          navigate(`/stall/${stallId}`);
        } else {
          navigate('/menu');
        }
      } else {
        // Registration Successful
        setIsLogin(true);
        setSelectedRole(null); // Reset role selection
        alert("Registration Successful! Please Login.");
        // Optional: Clear password field
        setPassword('');
      }

    } catch (err) {
      console.error("Auth Error:", err);
      const message = err.response?.data?.message || "An error occurred. Please try again.";
      alert(message);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-gray-900 overflow-hidden font-sans">
      {/* Canteen Background Image - Ensure 'canteen-bg.jpg' is in your 'public' folder */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 hover:scale-105"
        style={{ backgroundImage: "url('/canteen-bg.jpg')" }} 
      />

      {/* The Dark Glass Scrim - fills entire screen behind content */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />

      {/* Content Container with Dark Background */}
      <div className="relative z-20 w-full max-w-md mx-auto px-5 sm:px-8 lg:px-16 py-8 sm:py-12 flex flex-col items-center justify-center text-center bg-black/40 backdrop-blur-md rounded-lg shadow-2xl border border-white/10">
        
        {/* Branding Area */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-20 h-20 sm:w-24 sm:h-24 mb-4 flex items-center justify-center shadow-2xl">
            <img src="/logo.png" alt="ClickPick Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tighter leading-none">ClickPick</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.25em] mt-2 font-medium">
              Centralized Canteen Pre-Order System
            </p>
          </div>
        </div>

        {/* Role Selection Screen */}
        {selectedRole === null ? (
          <div className="w-full space-y-6">
            <h2 className="text-2xl font-bold text-white mb-8">Welcome to ClickPick</h2>
            <p className="text-white/70 text-sm mb-6">Are you a customer or canteen staff?</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setSelectedRole('customer');
                  setIsLogin(true);
                }}
                className="w-full bg-white text-black font-bold py-4 hover:bg-gray-200 transition-all uppercase tracking-[0.2em] text-sm active:scale-95"
              >
                Customer
              </button>
              <button
                onClick={() => {
                  setSelectedRole('stall_staff');
                  setIsLogin(true);
                }}
                className="w-full bg-transparent border border-white/30 text-white font-semibold py-4 hover:bg-white/10 transition-all uppercase tracking-[0.1em] text-xs active:scale-95"
              >
                Canteen Staff
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Input Form */}
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              {!isLogin && (
                  <input 
                    type="text" 
                    placeholder={selectedRole === 'stall_staff' ? 'Store Name' : 'Full Name'} 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required
                    className="w-full bg-transparent border-2 border-white/40 p-3 text-white placeholder-white/60 focus:outline-none focus:border-white transition-all"
                  />
              )}

              {!isLogin && selectedRole === 'stall_staff' && (
                <div className="w-full text-left">
                  <label className="block text-xs text-white/60 mb-2 uppercase tracking-[0.2em]">
                    Store Logo (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    className="w-full text-white text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-white/10 file:text-white file:rounded file:cursor-pointer"
                  />
                </div>
              )}

              <input 
                type="email" 
                placeholder={selectedRole === 'customer' ? "Email (@mymail.mapua.edu.ph)" : "Email"} 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required
                className="w-full bg-transparent border-2 border-white/40 p-3 text-white placeholder-white/60 focus:outline-none focus:border-white transition-all"
              />

              {!isLogin && selectedRole === 'customer' && (
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  className="w-full bg-transparent border-2 border-white/40 p-3 text-white placeholder-white/60 focus:outline-none focus:border-white transition-all"
                />
              )}
              
              <div className="relative w-full">
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required
                  className="w-full bg-transparent border-2 border-white/40 p-3 text-white placeholder-white/60 focus:outline-none focus:border-white transition-all"
                />
                <button type="button" className="absolute right-0 bottom-[-24px] text-[10px] text-white/50 hover:text-white transition-colors uppercase tracking-tighter underline">
                  Forgot Password?
                </button>
              </div>

              <div className="pt-8 space-y-4">
                <button type="submit" className="w-full bg-white py-4 text-black font-black hover:bg-gray-200 transition-all uppercase tracking-[0.2em] text-sm active:scale-95">
                  {isLogin ? 'Sign In' : 'Create Account'}
                </button>
                <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full bg-transparent border border-white/30 py-4 text-white font-semibold hover:bg-white/10 transition-all uppercase tracking-[0.1em] text-xs active:scale-95">
                  {isLogin ? 'Register' : 'Back to Login'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setSelectedRole(null);
                    setIsLogin(true);
                    setEmail('');
                    setPassword('');
                    setName('');
                  }} 
                  className="w-full bg-transparent border border-white/30 py-3 text-white/60 font-semibold hover:bg-white/5 transition-all uppercase tracking-[0.1em] text-xs active:scale-95"
                >
                  Change Account Type
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default Auth;