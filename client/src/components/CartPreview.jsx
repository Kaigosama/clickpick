import React from 'react';

const CartPreview = ({ cartItems, cartTotal, onCheckoutClick }) => {
  // Group items by store for preview
  const groupedByStore = cartItems.reduce((acc, item) => {
    const storeId = item.stall || item.stallId || 1;
    if (!acc[storeId]) {
      acc[storeId] = [];
    }
    acc[storeId].push(item);
    return acc;
  }, {});

  const stalls = {
    1: 'Store 1', 2: 'Store 2', 3: 'Store 3', 4: 'Store 4',
    5: 'Store 5', 6: 'Store 6', 7: 'Store 7', 8: 'Store 8',
  };

  return (
    <div
      className="absolute bottom-20 right-0 bg-white rounded-lg shadow-2xl border-4 border-[#8B0000] z-50 max-h-96 overflow-hidden flex flex-col"
      style={{ width: 'min(20rem, calc(100vw - 1rem))' }}
    >
      <div className="p-4 bg-[#8B0000] text-white flex items-center justify-between">
        <h2 className="text-xl font-bold">🛒 My Cart</h2>
      </div>
      
      {cartItems.length === 0 ? (
        <p className="text-gray-600 text-center py-12">Cart is empty</p>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {Object.entries(groupedByStore).map(([storeId, items]) => (
              <div key={storeId}>
                <p className="text-xs font-bold text-[#8B0000] mb-1">{stalls[storeId]}</p>
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded border border-gray-200">
                    <span className="text-gray-700">
                      {item.name}
                      {item.selectedVariation ? ` (${item.selectedVariation})` : ''}
                      {item.riceOptionLabel ? ` - ${item.riceOptionLabel}` : ''}
                    </span>
                    <span className="text-gray-600">₱{(item.price * (item.quantity || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Total and Checkout */}
          <div className="p-3 border-t-2 border-gray-300 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900">Total:</span>
              <span className="font-bold text-lg text-[#8B0000]">₱{cartTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={onCheckoutClick}
              className="w-full bg-[#8B0000] text-white font-bold py-2 rounded-lg hover:bg-red-800 transition-colors text-sm"
            >
              View Full Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPreview;
