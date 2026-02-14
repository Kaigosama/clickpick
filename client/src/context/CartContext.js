import React, { createContext, useState, useContext } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  // Add item to cart
  const addToCart = (item) => {
    setCartItems((prevItems) => {
      // Check if item already exists in cart to update quantity instead of adding duplicate
      const existingItem = prevItems.find((i) => i._id === item._id);
      if (existingItem) {
        return prevItems.map((i) =>
          i._id === item._id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevItems, { ...item, quantity: 1 }];
    });
  };

  // Remove item from cart
  const removeFromCart = (itemId) => {
    setCartItems((prevItems) => prevItems.filter((item) => item._id !== itemId));
  };

  // Decrease quantity or remove if 0
  const decreaseQuantity = (itemId) => {
    setCartItems((prevItems) => 
      prevItems.map(item => 
        item._id === itemId ? { ...item, quantity: item.quantity - 1 } : item
      ).filter(item => item.quantity > 0)
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
      clearCart, 
      cartTotal 
    }}>
      {children}
    </CartContext.Provider>
  );
};