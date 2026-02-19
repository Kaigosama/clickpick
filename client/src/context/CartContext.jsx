import React, { createContext, useState, useContext } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  const getCartItemKey = (itemOrId, selectedVariation = '') => {
    if (typeof itemOrId === 'object' && itemOrId !== null) {
      return `${itemOrId._id}::${itemOrId.selectedVariation || ''}::${itemOrId.selectedRiceOption || ''}`;
    }
    return `${itemOrId}::${selectedVariation || ''}`;
  };

  // Add item to cart
  const addToCart = (item) => {
    setCartItems((prevItems) => {
      const cartItemKey = getCartItemKey(item);
      const existingItem = prevItems.find((i) => getCartItemKey(i) === cartItemKey);
      if (existingItem) {
        return prevItems.map((i) =>
          getCartItemKey(i) === cartItemKey ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevItems, { ...item, quantity: 1 }];
    });
  };

  // Remove item from cart
  const removeFromCart = (itemOrId, selectedVariation = '') => {
    const cartItemKey = getCartItemKey(itemOrId, selectedVariation);
    setCartItems((prevItems) => prevItems.filter((item) => getCartItemKey(item) !== cartItemKey));
  };

  // Decrease quantity or remove if 0
  const decreaseQuantity = (itemOrId, selectedVariation = '') => {
    const cartItemKey = getCartItemKey(itemOrId, selectedVariation);
    setCartItems((prevItems) => 
      prevItems.map(item => 
        getCartItemKey(item) === cartItemKey ? { ...item, quantity: item.quantity - 1 } : item
      ).filter(item => item.quantity > 0)
    );
  };

  // Increase quantity
  const increaseQuantity = (itemOrId, selectedVariation = '') => {
    const cartItemKey = getCartItemKey(itemOrId, selectedVariation);
    setCartItems((prevItems) =>
      prevItems.map(item =>
        getCartItemKey(item) === cartItemKey ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  // Clear cart (after successful order)
  const clearCart = () => {
    setCartItems([]);
  };

  // Calculate Total Price
  const cartTotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ 
      cartItems, 
      addToCart, 
      removeFromCart, 
      decreaseQuantity,
      increaseQuantity, 
      clearCart, 
      cartTotal 
    }}>
      {children}
    </CartContext.Provider>
  );
};
