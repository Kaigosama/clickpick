import React, { useState } from 'react';
import api from '../services/api.js';

const AddItemModal = ({ stallId, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    category: 'Main',
    description: '',
    image: null,
    imagePreview: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'price' || name === 'quantity' ? parseFloat(value) || 0 : value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        image: file,
        imagePreview: URL.createObjectURL(file)
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.price || !formData.category) {
      setError('Please fill in name, price, and category');
      return;
    }

    setLoading(true);

    try {
      const quantityValue = formData.quantity === '' ? 0 : formData.quantity;

      let response = null;
      if (formData.image) {
        const submitData = new FormData();
        submitData.append('name', formData.name);
        submitData.append('price', String(formData.price));
        submitData.append('category', formData.category);
        submitData.append('description', formData.description);
        submitData.append('isAvailable', 'true');
        submitData.append('stallId', stallId);
        submitData.append('quantity', String(quantityValue));
        submitData.append('image', formData.image);

        response = await api.post('/menu', submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const payload = {
          name: formData.name,
          price: formData.price,
          category: formData.category,
          description: formData.description,
          isAvailable: true,
          stallId: stallId,
          quantity: quantityValue
        };

        response = await api.post('/menu', payload);
      }

      alert('Item added successfully!');
      onSave(response.data);
      onClose();
    } catch (err) {
      console.error('Error adding item:', err);
      setError(err.response?.data?.message || 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#8B0000] text-white py-4 px-6 flex items-center justify-between sticky top-0">
          <h1 className="text-2xl font-bold">Add New Item</h1>
          <button
            onClick={onClose}
            className="text-2xl hover:opacity-80"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded border border-red-400">
              {error}
            </div>
          )}

          {/* Food Name */}
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Food Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000]"
              placeholder="Enter food name"
              required
            />
          </div>

          {/* Image */}
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Food Image</label>
            <div className="flex gap-6">
              <div className="w-32 h-32 bg-[#8B0000] rounded-lg flex items-center justify-center overflow-hidden">
                {formData.imagePreview ? (
                  <img src={formData.imagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-3xl">🍽️</span>
                )}
              </div>
              <div className="flex flex-col justify-center">
                <label className="cursor-pointer inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <span className="px-6 py-2 border-2 border-gray-400 rounded font-semibold text-gray-700 hover:bg-gray-100 inline-block">
                    Upload Image
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Price and Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-2">Price</label>
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000]"
                  placeholder="0.00"
                  required
                />
                <span className="font-bold text-gray-700 shrink-0">₱</span>
              </div>
            </div>

            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-2">Quantity</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleInputChange}
                min="0"
                className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000]"
                placeholder="0"
                required
              />
            </div>

          </div>

          {/* Category */}
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000]"
              required
            >
              <option value="Main">Main</option>
              <option value="Snacks">Snacks</option>
              <option value="Drinks">Drinks</option>
              <option value="Desserts">Desserts</option>
            </select>
          </div>

          {/* Product Description */}
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Product Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="w-full border-2 border-gray-400 rounded px-4 py-3 font-semibold focus:outline-none focus:border-[#8B0000] min-h-32 resize-none"
              placeholder="Enter product description..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 justify-center pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-2 border-2 border-gray-400 rounded font-semibold text-gray-700 hover:bg-gray-100"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-2 bg-[#8B0000] text-white rounded font-semibold hover:bg-red-800 disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;
