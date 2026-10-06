import { GrandHotel_400Regular, useFonts } from '@expo-google-fonts/grand-hotel';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cacheDebugInfo, clearImageCache } from '../cache/imageCache';
import { BRAND, COLORS, GRADIENT_MAIN } from '../constants/brand';
import { useUnreadMessages } from '../messaging/realtime';
import { SyncBanner } from './SyncBanner';

/** Barra superior del feed: logo + nueva publicación. (Buscar vive en Explorar.) */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loaded] = useFonts({ GrandHotel_400Regular });
  const unread = useUnreadMessages();

  // Mantén pulsado el logo: muestra las métricas de la caché de imágenes (útil para la defensa)
  function showCacheStats() {
    const i = cacheDebugInfo();
    Alert.alert(
      'Caché de imágenes',
      `Aciertos en RAM: ${i.ramHits}\n` +
      `Aciertos en disco: ${i.diskHits}\n` +
      `Descargas de red: ${i.downloads}\n` +
      `Descargas canceladas: ${i.cancelled}\n` +
      `Fallidas: ${i.failed}\n\n` +
      `En RAM: ${i.ramEntries} imágenes\n` +
      `En disco: ${i.diskEntries} imágenes (${i.diskMB} MB)`,
      [
        { text: 'Vaciar caché', style: 'destructive', onPress: () => { clearImageCache(); } },
        { text: 'Cerrar', style: 'cancel' },
      ]
    );
  }

  return (
    <View style={{ backgroundColor: COLORS.black, paddingTop: insets.top }}>
      <View style={s.row}>
        <Text
          onLongPress={showCacheStats}
          style={[
            s.logo,
            loaded ? { fontFamily: 'GrandHotel_400Regular' } : { fontStyle: 'italic' },
          ]}
        >
          {BRAND.name}
        </Text>
        <View style={s.actions}>
          <TouchableOpacity
            onPress={() => router.push('/create' as any)}
            hitSlop={12}
            accessibilityLabel="Nueva publicación"
          >
            <Ionicons name="add-circle-outline" size={28} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/messages' as any)}
            hitSlop={12}
            accessibilityLabel="Mensajes"
          >
            <Ionicons name="paper-plane-outline" size={26} color={COLORS.white} />
            {unread > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <LinearGradient
        colors={GRADIENT_MAIN}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: 2 }}
      />
      <SyncBanner />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  logo: { color: COLORS.white, fontSize: 30 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  badge: {
    position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, backgroundColor: COLORS.magenta, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
});