// src/context/NotificacionesContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const NotificacionesContext = createContext();

export const NotificacionesProvider = ({ children }) => {
  const { token } = useAuth();

  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotificaciones = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Ajusta esta ruta si tu backend usa otra (ej: '/notificaciones')
      const res = await api.get('/notificaciones', {
        headers: { Authorization: `Bearer ${token}` },
      });

      // soporta: res.data (array) o { data: [...] } o { results: [...] }
      const data = Array.isArray(res.data)
        ? res.data
        : (res.data?.data ?? res.data?.results ?? []);

      setNotificaciones(data);
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  const marcarComoLeida = async (notifno) => {
    if (!token) return;

    // Optimista: que la UI refleje de inmediato
    setNotificaciones((prev) =>
      prev.map((n) => (n.notifno === notifno ? { ...n, leida: true } : n))
    );

    try {
      await api.put(
        '/notificaciones/leidas',
        { notifno },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Opcional: recargar por si el backend cambia algo más
      await fetchNotificaciones();
    } catch (err) {
      console.error('Error al marcar como leída:', err);
      // Si falló, revertimos el cambio optimista
      setNotificaciones((prev) =>
        prev.map((n) => (n.notifno === notifno ? { ...n, leida: false } : n))
      );
    }
  };

  const noLeidas = useMemo(
    () => notificaciones.filter((n) => !n.leida),
    [notificaciones]
  );

  useEffect(() => {
    if (token) fetchNotificaciones();
    else setNotificaciones([]);
  }, [token]);

  return (
    <NotificacionesContext.Provider
      value={{
        notificaciones,
        noLeidas,
        loading,
        fetchNotificaciones,
        marcarComoLeida,
      }}
    >
      {children}
    </NotificacionesContext.Provider>
  );
};

export const useNotificaciones = () => useContext(NotificacionesContext);
