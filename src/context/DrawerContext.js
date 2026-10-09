// src/context/DrawerContext.js
import React, { createContext, useContext, useState, useCallback } from 'react';

const DrawerContext = createContext();

export const DrawerProvider = ({ children }) => {
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);

  return (
    <DrawerContext.Provider value={{ open, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </DrawerContext.Provider>
  );
};

export const useDrawer = () => useContext(DrawerContext);
