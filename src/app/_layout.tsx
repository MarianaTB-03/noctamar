import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { startMessaging, stopMessaging } from '../messaging/realtime';
import { AuthProvider, useAuth } from '../presentation/AuthProvider';
import { clearTray } from '../stories/trayStore';
import { startSync } from '../sync/syncEngine';

// Al abrir la app desde un enlace sin sesión, Expo Router navega a /post/..., pero el Gate lo manda a /login.
// Se recuerda el destino y, al iniciar sesión, se abre el enlace pedido.
export const unstable_settings = { initialRouteName: '(tabs)' };

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const pendingLink = useRef<string | null>(null);

  // Con sesión iniciada arranca el motor de sincronización offline (cola en SQLite)
  useEffect(() => { if (session) startSync(); }, [session]);

  // Escucha global de mensajes (entregado, bandeja, contador de no leídos); se cierra al salir de sesión
  const uid = session?.user.id;
  useEffect(() => {
    if (uid) startMessaging(uid);
    else { stopMessaging(); clearTray(); }
  }, [uid]);

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === 'login' || first === 'register';
    if (!session && !inAuth) {
      if (/^\/post\/[^/]+$/.test(pathname)) pendingLink.current = pathname; // guarda el enlace profundo
      router.replace('/login' as any);
    }
    if (session && inAuth) {
      const target = pendingLink.current;
      pendingLink.current = null;
      router.replace('/' as any);
      if (target) setTimeout(() => router.push(target as any), 0); // abre el post pedido, con Inicio debajo
    }
  }, [session, loading, segments]);

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}