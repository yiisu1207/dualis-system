import React from 'react';
import { Outlet } from 'react-router-dom';
import { CartProvider } from '../context/CartContext';

export default function PosLayout() {
  return (
    <CartProvider>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-[#0a0f1e] text-gray-900 dark:text-white">
        <Outlet />
      </div>
    </CartProvider>
  );
}
