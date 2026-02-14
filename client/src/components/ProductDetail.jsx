import React, { useState } from 'react';

const ProductDetail = ({ item, stall, stallId, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);

  const handleAddToBasket = () => {
    for (let i = 0; i < quantity; i++) {
      const itemToAdd = {
        ...item,
        stallId: stallId || stall?.id || 1
      };
      onAddToCart(itemToAdd);
    }
    onClose();
  };

  const handleQuantityChange = (value) => {
    if (value >= 1) {
      setQuantity(value);
    }
  };

  // Calculate estimated time based on quantity (approximate)
  // Actual time will be calculated by backend based on queue
  const estimateTime = () => {
    const baseTime = 5;
    const timePerItem = 3;
    return baseTime + (quantity * timePerItem);
  };
  
  const estimatedTime = estimateTime();
  
  // Generate order ID
  const orderId = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#8B0000] text-white py-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-2xl hover:opacity-80"
            >
              ←
            </button>
            <h1 className="text-2xl font-bold">Product Details</h1>
          </div>
          <button
            onClick={onClose}
            className="text-2xl hover:opacity-80"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">{item.name}</h2>

          {/* Product Image / Icon */}
          <div className="bg-[#8B0000] h-48 rounded-lg flex items-center justify-center text-8xl mb-8 border-2 border-gray-300 overflow-hidden">
            {item.image ? (
              <img
                src={item.image.startsWith('http') ? item.image : `http://localhost:5000${item.image}`}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>🍽️</span>
            )}
          </div>

          {/* Store Info */}
          <div className="mb-8 pb-6 border-b-2 border-gray-200">
            <p className="text-lg font-bold text-gray-900 mb-2">{stall.name}</p>
            <p className="text-4xl font-bold text-gray-900">₱{item.price}</p>
          </div>

          {/* Quantity Selector */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-3">QUANTITY</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                className="w-10 h-10 border-2 border-gray-400 rounded flex items-center justify-center text-lg font-bold hover:border-[#8B0000] transition-colors"
              >
                −
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                className="w-16 text-center border-2 border-gray-400 rounded py-2 font-bold text-lg"
              />
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                className="w-10 h-10 border-2 border-gray-400 rounded flex items-center justify-center text-lg font-bold hover:border-[#8B0000] transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Order Details */}
          <div className="space-y-4 mb-8 pb-6 border-b-2 border-gray-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">TOTAL</span>
              <span className="text-2xl font-bold text-gray-900">₱{(item.price * quantity).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">MODE OF PAYMENT</span>
              <span className="text-gray-900">CASH ▼</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">ESTIMATED TIME</span>
              <span className="text-gray-900">{estimatedTime} MINUTES</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">ORDER ID</span>
              <span className="text-gray-900 font-mono">{orderId}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-6 border-2 border-gray-400 text-gray-900 font-bold rounded-lg hover:bg-gray-50 transition-colors text-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddToBasket}
              disabled={!item.isAvailable}
              className={`flex-1 py-3 px-6 font-bold rounded-lg text-lg transition-colors ${
                item.isAvailable
                  ? 'bg-[#8B0000] text-white hover:bg-red-800'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Add to Basket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
