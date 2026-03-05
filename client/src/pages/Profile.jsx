import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { toServerAssetUrl } from '../services/assetUrl.js';

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useContext(AuthContext);
  const isStaff = user?.role === 'stall_staff';

  const [formData, setFormData] = useState({
    name: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwData, setPwData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwWrongPassword, setPwWrongPassword] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    setFormData({
      name: user.name || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || ''
    });

    if (user.logoUrl) {
      setLogoPreview(toServerAssetUrl(user.logoUrl));
    } else {
      setLogoPreview(null);
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'firstName' || name === 'lastName') {
        const first = name === 'firstName' ? value : prev.firstName;
        const last = name === 'lastName' ? value : prev.lastName;
        updated.name = `${first} ${last}`.trim();
      }
      return updated;
    });
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
          payload.firstName = formData.firstName;
          payload.lastName = formData.lastName;
          payload.phone = formData.phone;
        }

        response = await api.put('/auth/profile', payload);
      }

      if (response.data.user) {
        updateUser(response.data.user);
        setMessage('Profile updated successfully!');
        setIsEditing(false);
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

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwWrongPassword(false);
    setPwSuccess('');

    if (pwData.newPassword !== pwData.confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }

    if (pwData.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }

    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        userId: user._id,
        currentPassword: pwData.currentPassword,
        newPassword: pwData.newPassword
      });

      setPwSuccess('Password changed successfully!');
      setPwData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowChangePassword(false);
        setPwSuccess('');
      }, 1500);
    } catch (err) {
      setPwError(err.response?.data?.message || 'Error changing password.');
      if (err.response?.status === 400 && err.response?.data?.message === 'Wrong current password.') {
        setPwWrongPassword(true);
      }
    } finally {
      setPwLoading(false);
    }
  };

  if (!user) return null;

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

      <header className="bg-[#8B0000] text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ClickPick" className="w-12 h-12 object-contain" />
            <span className="text-xl font-bold">{isStaff ? 'ClickPick Canteen Dashboard' : 'ClickPick'}</span>
          </div>

          <div className="sm:hidden relative">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm uppercase max-w-[120px] truncate">
                {user?.name || (isStaff ? 'Staff' : 'User')}
              </p>
              <button
                onClick={() => setShowMobileNavMenu(!showMobileNavMenu)}
                className="w-9 h-9 rounded-md border border-white/40 flex items-center justify-center hover:bg-white/10"
                aria-label="Open navigation menu"
              >
                ☰
              </button>
            </div>

            {showMobileNavMenu && (
              <div className="absolute top-full right-0 mt-2 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 z-50 min-w-48 overflow-hidden">
                <button
                  onClick={() => {
                    if (isStaff) {
                      const stallId = user?.stallId || user?._id;
                      navigate(`/stall/${stallId}`);
                    } else {
                      navigate('/menu');
                    }
                    setShowMobileNavMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                >
                  {isStaff ? 'Dashboard' : 'Stores'}
                </button>
                {!isStaff && (
                  <>
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
                      onClick={() => {
                        navigate('/order-history');
                        setShowMobileNavMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors font-semibold border-b border-gray-200"
                    >
                      Order History
                    </button>
                  </>
                )}
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

          <button
            onClick={() => {
              if (isStaff) {
                const stallId = user?.stallId || user?._id;
                navigate(`/stall/${stallId}`);
              } else {
                navigate('/menu');
              }
            }}
            className="hidden sm:inline text-white hover:opacity-80 font-semibold"
          >
            ← {isStaff ? 'Back to Dashboard' : 'Back to Stores'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">
            {isStaff ? (isEditing ? 'Edit Store Profile' : 'Store Profile') : 'My Profile'}
          </h1>
          <p className="text-gray-600 mb-8">
            {isStaff
              ? (isEditing ? 'Update your store details' : 'Your store information')
              : (isEditing ? 'Edit your account details' : 'Your account information')}
          </p>

          {message && (
            <div className={`p-4 rounded-lg mb-6 ${message.includes('successfully') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message}
            </div>
          )}

          {!isEditing ? (
            <div className="space-y-6">
              {isStaff ? (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Store Name</p>
                    <p className="text-lg font-medium text-gray-900">{user.name || <span className="text-gray-400">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</p>
                    <p className="text-lg font-medium text-gray-900">{user.email || <span className="text-gray-400">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Store Logo</p>
                    <div className="w-20 h-20 bg-gray-100 rounded border border-gray-300 overflow-hidden flex items-center justify-center">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Store logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-xs font-semibold uppercase">Logo</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">First Name</p>
                      <p className="text-lg font-medium text-gray-900">{user.firstName || user.name?.split(' ')[0] || <span className="text-gray-400">Not set</span>}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Name</p>
                      <p className="text-lg font-medium text-gray-900">{user.lastName || user.name?.split(' ').slice(1).join(' ') || <span className="text-gray-400">Not set</span>}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</p>
                    <p className="text-lg font-medium text-gray-900">{user.email || <span className="text-gray-400">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone Number</p>
                    <p className="text-lg font-medium text-gray-900">{user.phone || <span className="text-gray-400">Not set</span>}</p>
                  </div>
                </>
              )}

              <div className="pt-4">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setMessage('');
                  }}
                  className="w-full bg-[#8B0000] text-white font-bold py-3 rounded-lg hover:bg-red-800 transition-colors"
                >
                  {isStaff ? 'Edit Store Profile' : 'Edit Profile'}
                </button>
              </div>

              {isStaff && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(true);
                      setPwError('');
                      setPwSuccess('');
                    }}
                    className="w-full border-2 border-[#8B0000] text-[#8B0000] font-bold py-2 rounded-lg hover:bg-[#8B0000] hover:text-white transition-colors"
                  >
                    Change Password
                  </button>
                </div>
              )}

              {!isStaff && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(true);
                      setPwError('');
                      setPwSuccess('');
                    }}
                    className="w-full border-2 border-[#8B0000] text-[#8B0000] font-bold py-2 rounded-lg hover:bg-[#8B0000] hover:text-white transition-colors"
                  >
                    Change Password
                  </button>
                </div>
              )}

              <div className="pt-6 border-t-2 border-gray-200">
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {isStaff ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Store Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                    required
                  />
                </div>
              ) : (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  readOnly
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
              </div>

              {!isStaff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                  />
                </div>
              )}

              {!isStaff && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(true);
                      setPwError('');
                      setPwSuccess('');
                    }}
                    className="w-full border-2 border-[#8B0000] text-[#8B0000] font-bold py-2 rounded-lg hover:bg-[#8B0000] hover:text-white transition-colors"
                  >
                    Change Password
                  </button>
                </div>
              )}

              {isStaff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Store Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded border border-gray-300 overflow-hidden flex items-center justify-center">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Store logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-xs font-semibold uppercase">Logo</span>
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
                    setIsEditing(false);
                    setMessage('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Change Password</h2>
            <p className="text-sm text-gray-500 mb-6">Enter your current password then set a new one.</p>

            {pwError && !pwWrongPassword && (
              <div className="bg-red-100 text-red-800 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="bg-green-100 text-green-800 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                {pwSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-1 ${pwWrongPassword ? 'text-red-600' : 'text-gray-900'}`}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwData.currentPassword}
                  onChange={(e) => {
                    setPwData((prev) => ({ ...prev, currentPassword: e.target.value }));
                    setPwWrongPassword(false);
                    setPwError('');
                  }}
                  className={`w-full px-4 py-2 border-2 rounded-lg focus:outline-none ${pwWrongPassword ? 'border-red-500 focus:border-red-600' : 'border-gray-300 focus:border-[#8B0000]'}`}
                  placeholder="Enter current password"
                  required
                />
                {pwWrongPassword && <p className="text-red-600 text-xs font-semibold mt-1">Wrong password</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">New Password</label>
                <input
                  type="password"
                  value={pwData.newPassword}
                  onChange={(e) => setPwData((prev) => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                  placeholder="At least 6 characters"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pwData.confirmPassword}
                  onChange={(e) => setPwData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#8B0000]"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="flex-1 bg-[#8B0000] text-white font-bold py-2.5 rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {pwLoading ? 'Saving...' : 'Save Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setPwData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setPwError('');
                    setPwWrongPassword(false);
                  }}
                  className="flex-1 bg-gray-200 text-gray-900 font-bold py-2.5 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
