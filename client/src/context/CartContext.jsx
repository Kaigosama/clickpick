import React, { createContext, useState, useContext } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  const buildKey = (id, variation = '', rice = '', note = '') => {
    const normalizedNote = String(note || '').trim();
    return `${id}::${variation}::${rice}::${normalizedNote}`;
  };

  const getCartItemKey = (item) =>
    buildKey(
      item?._id,
      item?.selectedVariation || '',
      item?.selectedRiceOption || '',
      item?.noteToStall || ''
    );

  const parseTarget = (itemOrId, selectedVariation = '', selectedRiceOption = '', noteToStall = '') => {
    if (typeof itemOrId === 'object' && itemOrId !== null) {
      return { mode: 'exact', id: itemOrId._id, key: getCartItemKey(itemOrId) };
    }

    const id = itemOrId;
    const hasOptions = Boolean(selectedVariation || selectedRiceOption);

    return hasOptions
        ? { mode: 'exact', id, key: buildKey(id, selectedVariation, selectedRiceOption, noteToStall) }
      : { mode: 'idOnly', id, key: null };
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
  const removeFromCart = (itemOrId, selectedVariation = '', selectedRiceOption = '', noteToStall = '') => {
    const target = parseTarget(itemOrId, selectedVariation, selectedRiceOption, noteToStall);

    setCartItems((prevItems) =>
      prevItems.filter((item) => {
        if (target.mode === 'idOnly') return item._id !== target.id;
        return getCartItemKey(item) !== target.key;
      })
    );
  };

  // Decrease quantity or remove if 0
  const decreaseQuantity = (itemOrId, selectedVariation = '', selectedRiceOption = '', noteToStall = '') => {
    const target = parseTarget(itemOrId, selectedVariation, selectedRiceOption, noteToStall);

    setCartItems((prevItems) => {
      if (target.mode === 'idOnly') {
        const index = prevItems.findIndex((item) => item._id === target.id);
        if (index === -1) return prevItems;

        const nextItems = [...prevItems];
        nextItems[index] = { ...nextItems[index], quantity: nextItems[index].quantity - 1 };
        return nextItems.filter((item) => item.quantity > 0);
      }

      return prevItems
        .map((item) =>
          getCartItemKey(item) === target.key ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0);
    });
  };

  // Increase quantity
  const increaseQuantity = (itemOrId, selectedVariation = '', selectedRiceOption = '', noteToStall = '') => {
    const target = parseTarget(itemOrId, selectedVariation, selectedRiceOption, noteToStall);

    setCartItems((prevItems) => {
      if (target.mode === 'idOnly') {
        const index = prevItems.findIndex((item) => item._id === target.id);
        if (index === -1) return prevItems;

        const nextItems = [...prevItems];
        nextItems[index] = { ...nextItems[index], quantity: nextItems[index].quantity + 1 };
        return nextItems;
      }

      return prevItems.map((item) =>
        getCartItemKey(item) === target.key ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
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
