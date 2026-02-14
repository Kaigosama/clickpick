import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import api from '../services/api.js';

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useContext(AuthContext);
  const isStaff = user?.role === 'stall_staff';
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || ''
    });
    if (user.logoUrl) {
      const url = user.logoUrl.startsWith('http') ? user.logoUrl : `http://localhost:5000${user.logoUrl}`;
      setLogoPreview(url);
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      let response = null;
      if (isStaff && logoFile) {
        const formDataPayload = new FormData();
        formDataPayload.append('userId', user._id);
        formDataPayload.append('name', formData.name);
        formDataPayload.append('logo', logoFile);
        response = await api.put('/auth/profile', formDataPayload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const payload = {
          userId: user._id,
          name: formData.name
        };
        if (!isStaff) {
          payload.email = formData.email;
          payload.phone = formData.phone;
        }

        response = await api.put('/auth/profile', payload);
      }

      if (response.data.user) {
        updateUser(response.data.user);
        setMessage('Profile updated successfully!');
        setTimeout(() => {
          if (isStaff) {
            const stallId = user.stallId || user._id;
            navigate(`/stall/${stallId}`);
          } else {
            navigate('/menu');
          }
        }, 1500);
      }
    } catch (err) {
      setMessage('Error updating profile: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#8B0000] text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">{isStaff ? 'ClickPick Canteen Dashboard' : 'ClickPick'}</span>
          </div>
          <button
            onClick={() => {
              if (isStaff) {
                const stallId = user?.stallId || user?._id;
                navigate(`/stall/${stallId}`);
              } else {
                navigate('/menu');
              }
            }}
            className="text-white hover:opacity-80 font-semibold"
          >
            ← {isStaff ? 'Back to Dashboard' : 'Back to Stores'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {isStaff ? 'Edit Store Profile' : 'My Profile'}
          </h1>
          <p className="text-gray-600 mb-8">
            {isStaff ? 'Update your store details' : 'Edit your account details'}
          </p>

          {message && (
            <div className={`p-4 rounded-lg mb-6 ${message.includes('successfully') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Store/Full Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {isStaff ? 'Store Name' : 'Full Name'}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                required
              />
            </div>

            {!isStaff && (
              <>
                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                  />
                </div>
              </>
            )}

            {isStaff && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Store Logo
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded border border-gray-300 overflow-hidden flex items-center justify-center">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Store logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-400 text-xl">🏪</span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setLogoFile(file);
                      if (file) {
                        setLogoPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-6">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#8B0000] text-white font-bold py-3 rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isStaff) {
                    const stallId = user?.stallId || user?._id;
                    navigate(`/stall/${stallId}`);
                  } else {
                    navigate('/menu');
                  }
                }}
                className="flex-1 bg-gray-300 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Logout Button */}
          <div className="mt-12 pt-8 border-t-2 border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
