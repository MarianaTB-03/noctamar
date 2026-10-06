import { useEffect, useState } from 'react';
import { fetchPendingCount } from '../data/followsRepository';
import { supabase } from '../data/supabase';
import { useAuth } from './AuthProvider';

// Pequeño "bus" para que cualquier pantalla pueda pedir que se recalcule el globo
// (por ejemplo, tras aprobar o rechazar, porque Realtime no avisa de los DELETE filtrados).
const listeners = new Set<() => void>();
export function refreshPendingBadge() {
  listeners.forEach((l) => l());
}

/**
 * Número de solicitudes de seguimiento pendientes, siempre al día:
 *  - se consulta al iniciar sesión,
 *  - se actualiza en vivo por Supabase Realtime cuando alguien te pide seguirte,
 *  - y se puede forzar con refreshPendingBadge().
 */
export function usePendingCount(): number {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    let alive = true;
    const refresh = () => {
      fetchPendingCount()
        .then((n) => { if (alive) setCount(n); })
        .catch(() => {});
    };

    refresh();
    listeners.add(refresh);
    const channel = supabase
      .channel(`pending:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows', filter: `following_id=eq.${uid}` },
        refresh
      )
      .subscribe();

    // Limpieza: sin esto quedarían canales y listeners abiertos al cerrar sesión
    return () => {
      alive = false;
      listeners.delete(refresh);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return count;
}