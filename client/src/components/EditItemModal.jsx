import React, { useState } from 'react';
import api from '../services/api.js';

const EditItemModal = ({ item, onClose, onSave, onDelete }) => {
  const initialImagePreview = item.image
    ? (item.image.startsWith('http') ? item.image : `http://localhost:5000${item.image}`)
    : null;

  const [formData, setFormData] = useState({
    name: item.name || '',
    price: item.price || '',
    quantity: item.quantity || 0,
    category: item.category || 'Main',
    description: item.description || '',
    image: null,
    imagePreview: initialImagePreview,
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
    if (!formData.name || !formData.price || formData.quantity === '' || !formData.category) {
      setError('Please fill in name, price, quantity, and category');
      return;
    }
    setLoading(true);

    try {
      let updatedImage = item.image;

      if (formData.image) {
        const submitData = new FormData();
        submitData.append('name', formData.name);
        submitData.append('price', String(formData.price));
        submitData.append('quantity', String(formData.quantity));
        submitData.append('category', formData.category);
        submitData.append('description', formData.description);
        submitData.append('image', formData.image);

        const response = await api.put(`/menu/${item._id}`, submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        updatedImage = response.data?.image || formData.imagePreview || updatedImage;
      } else {
        const updateData = {
          name: formData.name,
          price: formData.price,
          quantity: formData.quantity,
          category: formData.category,
          description: formData.description
        };

        const response = await api.put(`/menu/${item._id}`, updateData);
        updatedImage = response.data?.image || updatedImage;
      }

      alert('Item updated successfully!');
      onSave({
        ...item,
        name: formData.name,
        price: formData.price,
        quantity: formData.quantity,
        category: formData.category,
        description: formData.description,
        image: updatedImage
      });
      onClose();
    } catch (err) {
      console.error('Error updating item:', err);
      setError(err.response?.data?.message || 'Failed to update item');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Delete this item? This cannot be undone.');
    if (!confirmed) return;

    setLoading(true);
    setError('');

    try {
      await api.delete(`/menu/${item._id}`);
      if (onDelete) {
        onDelete(item);
      }
      onClose();
    } catch (err) {
      console.error('Error deleting item:', err);
      setError(err.response?.data?.message || 'Failed to delete item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#8B0000] text-white py-4 px-6 flex items-center justify-between sticky top-0">
          <h1 className="text-2xl font-bold">Item Information</h1>
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
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
            <button
              type="button"
              onClick={handleDelete}
              className="px-8 py-2 border-2 border-red-500 text-red-600 rounded font-semibold hover:bg-red-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
              disabled={loading}
            >
              Delete Item
            </button>
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
              {loading ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditItemModal;
