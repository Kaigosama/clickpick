import React, { useEffect, useState } from 'react';

const ProductDetail = ({ item, stall, stallId, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);
  const parsedVariationOptions = Array.isArray(item.variationOptions) && item.variationOptions.length > 0
    ? item.variationOptions
        .map((option) => ({
          name: String(option?.name || '').trim(),
          price: Number(option?.price ?? item.price ?? 0),
          quantity: Number(option?.quantity ?? 0)
        }))
        .filter((option) => option.name)
    : (item.variation || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((name) => ({ name, price: Number(item.price || 0), quantity: Number(item.quantity || 0) }));

  const [selectedVariation, setSelectedVariation] = useState(parsedVariationOptions[0]?.name || '');
  const selectedVariationOption = parsedVariationOptions.find((option) => option.name === selectedVariation);
  const selectedVariationPrice = selectedVariationOption?.price;
  const selectedVariationQuantity = selectedVariationOption?.quantity;
  const maxAvailableQuantity = parsedVariationOptions.length > 0
    ? Number(selectedVariationQuantity || 0)
    : Number(item.quantity || 0);
  const basePrice = selectedVariation ? Number(selectedVariationPrice ?? item.price ?? 0) : Number(item.price || 0);
  const isMainItem = String(item.category || '').toLowerCase() === 'main';
  const riceOptions = [
    item.noRiceAvailable ? { value: 'no_rice', label: 'No Rice' } : null,
    item.withRiceAvailable
      ? { value: 'with_rice', label: `With Rice (+₱${Number(item.withRiceAdditionalPrice ?? 15).toFixed(2)})` }
      : null
  ].filter(Boolean);
  const [selectedRiceOption, setSelectedRiceOption] = useState(riceOptions[0]?.value || '');
  const riceSurcharge = selectedRiceOption === 'with_rice' ? Number(item.withRiceAdditionalPrice ?? 15) : 0;
  const effectivePrice = Number(basePrice || 0) + riceSurcharge;

  useEffect(() => {
    if (quantity > maxAvailableQuantity && maxAvailableQuantity > 0) {
      setQuantity(maxAvailableQuantity);
    }
    if (maxAvailableQuantity === 0) {
      setQuantity(1);
    }
  }, [maxAvailableQuantity, quantity]);

  const handleAddToBasket = () => {
    for (let i = 0; i < quantity; i++) {
      const itemToAdd = {
        ...item,
        selectedVariation,
        selectedRiceOption,
        riceOptionLabel: selectedRiceOption === 'with_rice' ? 'With Rice' : selectedRiceOption === 'no_rice' ? 'No Rice' : '',
        price: effectivePrice,
        stallId: stallId || stall?.id || 1
      };
      onAddToCart(itemToAdd);
    }
    onClose();
  };

  const handleQuantityChange = (value) => {
    if (value >= 1 && value <= Math.max(1, maxAvailableQuantity)) {
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
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#8B0000] text-white py-4 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-2xl hover:opacity-80"
            >
              ←
            </button>
            <h1 className="text-xl sm:text-2xl font-bold">Product Details</h1>
          </div>
          <button
            onClick={onClose}
            className="text-2xl hover:opacity-80"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{item.name}</h2>

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
            <p className="text-4xl font-bold text-gray-900">₱{effectivePrice.toFixed(2)}</p>
          </div>

          {isMainItem && (
            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-3">RICE OPTION</label>
              {riceOptions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {riceOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setSelectedRiceOption(option.value)}
                      className={`border-2 rounded py-2 px-3 font-semibold text-sm transition-colors ${
                        selectedRiceOption === option.value
                          ? 'border-[#8B0000] text-[#8B0000] bg-red-50'
                          : 'border-gray-300 text-gray-700 hover:border-[#8B0000]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-red-600 font-semibold">No rice option available for this item.</p>
              )}
            </div>
          )}

          {parsedVariationOptions.length > 0 && (
            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-3">VARIATION</label>
              <select
                value={selectedVariation}
                onChange={(e) => setSelectedVariation(e.target.value)}
                className="w-full border-2 border-gray-400 rounded py-2 px-3 font-semibold focus:outline-none focus:border-[#8B0000]"
              >
                {parsedVariationOptions.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} — ₱{Number(option.price || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity Selector */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-3">QUANTITY</label>
            <p className={`text-xs mb-2 ${maxAvailableQuantity > 0 ? 'text-gray-600' : 'text-red-600 font-semibold'}`}>
              {maxAvailableQuantity > 0 ? `Available: ${maxAvailableQuantity}` : 'Not Available'}
            </p>
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
                min="1"
                max={Math.max(1, maxAvailableQuantity)}
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
              <span className="text-2xl font-bold text-gray-900">₱{(effectivePrice * quantity).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">ESTIMATED TIME</span>
              <span className="text-gray-900">{estimatedTime} MINUTES</span>
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
              disabled={!item.isAvailable || maxAvailableQuantity <= 0 || (isMainItem && riceOptions.length === 0)}
              className={`flex-1 py-3 px-6 font-bold rounded-lg text-lg transition-colors ${
                item.isAvailable && maxAvailableQuantity > 0 && (!isMainItem || riceOptions.length > 0)
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
