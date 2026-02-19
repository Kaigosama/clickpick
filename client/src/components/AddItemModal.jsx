import React, { useState } from 'react';
import api from '../services/api.js';

const AddItemModal = ({ stallId, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    variationOptions: [],
    quantity: '',
    category: 'Main',
    noRiceAvailable: true,
    withRiceAvailable: false,
    withRiceAdditionalPrice: 15,
    description: '',
    image: null,
    imagePreview: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const riceOptionsEnabled = formData.noRiceAvailable || formData.withRiceAvailable;
  const variationEnabled = formData.variationOptions.length > 0;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : name === 'price' || name === 'quantity' || name === 'withRiceAdditionalPrice'
          ? parseFloat(value) || 0
          : value
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

  const addVariationOption = () => {
    setFormData((prev) => ({
      ...prev,
      variationOptions: [...prev.variationOptions, { name: '', price: prev.price || 0, quantity: 0 }]
    }));
  };

  const handleVariationToggle = (enabled) => {
    setFormData((prev) => {
      if (!enabled) {
        return {
          ...prev,
          variationOptions: []
        };
      }

      if (prev.variationOptions.length > 0) {
        return prev;
      }

      return {
        ...prev,
        variationOptions: [{ name: '', price: prev.price || 0, quantity: prev.quantity || 0 }]
      };
    });
  };

  const removeVariationOption = (indexToRemove) => {
    setFormData((prev) => ({
      ...prev,
      variationOptions: prev.variationOptions.filter((_, index) => index !== indexToRemove)
    }));
  };

  const handleVariationOptionChange = (indexToUpdate, field, value) => {
    setFormData((prev) => ({
      ...prev,
      variationOptions: prev.variationOptions.map((option, index) => {
        if (index !== indexToUpdate) return option;
        return {
          ...option,
          [field]: field === 'price' || field === 'quantity' ? parseFloat(value) || 0 : value
        };
      })
    }));
  };

  const handleRiceOptionsToggle = (enabled) => {
    setFormData((prev) => {
      if (!enabled) {
        return {
          ...prev,
          noRiceAvailable: false,
          withRiceAvailable: false,
          withRiceAdditionalPrice: 0
        };
      }

      return {
        ...prev,
        noRiceAvailable: prev.noRiceAvailable || prev.withRiceAvailable ? prev.noRiceAvailable : true,
        withRiceAvailable: prev.withRiceAvailable,
        withRiceAdditionalPrice: prev.withRiceAdditionalPrice || 15
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.category) {
      setError('Please fill in name, price, and category');
      return;
    }

    const cleanedVariationOptions = formData.variationOptions
      .map((option) => ({
        name: String(option.name || '').trim(),
        price: Number(option.price || 0),
        quantity: Number(option.quantity || 0)
      }))
      .filter((option) => option.name.length > 0);

    if (!variationEnabled && !formData.price) {
      setError('Please fill in item price.');
      return;
    }

    if (variationEnabled && cleanedVariationOptions.length === 0) {
      setError('Add at least one variation with a name.');
      return;
    }

    const derivedVariationQuantity = cleanedVariationOptions.reduce((sum, option) => sum + Number(option.quantity || 0), 0);
    const derivedVariationPrice = cleanedVariationOptions[0]?.price ?? Number(formData.price || 0);

    setLoading(true);

    try {
      const quantityValue = variationEnabled
        ? derivedVariationQuantity
        : (formData.quantity === '' ? 0 : formData.quantity);
      const priceValue = variationEnabled ? derivedVariationPrice : formData.price;

      let response = null;
      if (formData.image) {
        const submitData = new FormData();
        submitData.append('name', formData.name);
        submitData.append('price', String(priceValue));
        submitData.append('variationOptions', JSON.stringify(cleanedVariationOptions));
        submitData.append('category', formData.category);
        submitData.append('noRiceAvailable', String(formData.noRiceAvailable));
        submitData.append('withRiceAvailable', String(formData.withRiceAvailable));
        submitData.append('withRiceAdditionalPrice', String(formData.withRiceAdditionalPrice || 0));
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
          price: priceValue,
          variationOptions: cleanedVariationOptions,
          category: formData.category,
          noRiceAvailable: formData.category === 'Main' ? formData.noRiceAvailable : false,
          withRiceAvailable: formData.category === 'Main' ? formData.withRiceAvailable : false,
          withRiceAdditionalPrice:
            formData.category === 'Main' && formData.withRiceAvailable
              ? formData.withRiceAdditionalPrice || 0
              : 0,
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
        <div className="bg-[#8B0000] text-white py-4 px-4 sm:px-6 flex items-center justify-between sticky top-0">
          <h1 className="text-xl sm:text-2xl font-bold">Add New Item</h1>
          <button
            onClick={onClose}
            className="text-2xl hover:opacity-80"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6">
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
                  disabled={variationEnabled}
                  className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000] disabled:bg-gray-100 disabled:text-gray-500"
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
                disabled={variationEnabled}
                className="w-full border-2 border-gray-400 rounded px-4 py-2 font-semibold focus:outline-none focus:border-[#8B0000] disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="0"
                required
              />
            </div>

          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="block text-lg font-semibold text-gray-900">Variations</label>
              <button
                type="button"
                onClick={() => handleVariationToggle(!variationEnabled)}
                role="switch"
                aria-checked={variationEnabled}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${variationEnabled ? 'bg-[#8B0000]' : 'bg-gray-300'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${variationEnabled ? 'translate-x-8' : 'translate-x-1'}`}
                />
              </button>
            </div>

            {variationEnabled && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={addVariationOption}
                  className="px-3 py-1 rounded bg-[#8B0000] text-white text-sm font-semibold hover:bg-red-800"
                >
                  + Add Variation
                </button>
              </div>
            )}

            {!variationEnabled ? (
              <p className="text-xs text-gray-500">Variation is OFF. Base price and quantity are used.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-bold uppercase text-gray-600 px-1">
                  <span className="col-span-5">Name</span>
                  <span className="col-span-3">Price</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2"></span>
                </div>
                {formData.variationOptions.map((option, index) => (
                  <div key={`variation-${index}`} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={option.name}
                      onChange={(e) => handleVariationOptionChange(index, 'name', e.target.value)}
                      className="col-span-5 border-2 border-gray-300 rounded px-3 py-2 text-sm font-semibold focus:outline-none focus:border-[#8B0000]"
                      placeholder="Variation name"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={option.price}
                      onChange={(e) => handleVariationOptionChange(index, 'price', e.target.value)}
                      className="col-span-3 border-2 border-gray-300 rounded px-3 py-2 text-sm font-semibold focus:outline-none focus:border-[#8B0000]"
                      placeholder="Price"
                    />
                    <input
                      type="number"
                      min="0"
                      value={option.quantity}
                      onChange={(e) => handleVariationOptionChange(index, 'quantity', e.target.value)}
                      className="col-span-2 border-2 border-gray-300 rounded px-3 py-2 text-sm font-semibold focus:outline-none focus:border-[#8B0000]"
                      placeholder="Qty"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariationOption(index)}
                      className="col-span-2 py-2 rounded border border-red-400 text-red-600 text-xs font-semibold hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <p className="text-xs text-gray-600">
                  Base price and quantity are auto-derived from variation rows when variation is ON.
                </p>
              </div>
            )}
          </div>

          {formData.category === 'Main' && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <label className="block text-lg font-semibold text-gray-900">Rice Options</label>
                <button
                  type="button"
                  onClick={() => handleRiceOptionsToggle(!riceOptionsEnabled)}
                  role="switch"
                  aria-checked={riceOptionsEnabled}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${riceOptionsEnabled ? 'bg-[#8B0000]' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${riceOptionsEnabled ? 'translate-x-8' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              <div className="space-y-2 rounded border-2 border-gray-300 p-3">
                {riceOptionsEnabled && (
                  <>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    name="noRiceAvailable"
                    checked={formData.noRiceAvailable}
                    onChange={handleInputChange}
                  />
                  No Rice Available
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    name="withRiceAvailable"
                    checked={formData.withRiceAvailable}
                    onChange={handleInputChange}
                  />
                  With Rice Available
                </label>

                {formData.withRiceAvailable && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">With Rice Additional Price (₱)</label>
                    <input
                      type="number"
                      name="withRiceAdditionalPrice"
                      min="0"
                      step="0.01"
                      value={formData.withRiceAdditionalPrice}
                      onChange={handleInputChange}
                      className="w-full border-2 border-gray-300 rounded px-3 py-2 font-semibold focus:outline-none focus:border-[#8B0000]"
                    />
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          )}

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
