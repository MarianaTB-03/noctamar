import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/brand';
import { useSyncState } from '../sync/syncEngine';

/** Franja de estado: sin conexión / acciones pendientes / sincronizando. No ocupa espacio si todo está al día. */
export function SyncBanner() {
  const { online, pending, syncing } = useSyncState();
  if (online && pending === 0) return null;

  const text = !online
    ? pending > 0
      ? `Sin conexión · ${pending} ${pending === 1 ? 'acción' : 'acciones'} por enviar`
      : 'Sin conexión'
    : syncing
      ? `Sincronizando ${pending}…`
      : `${pending} ${pending === 1 ? 'acción pendiente' : 'acciones pendientes'}`;

  return (
    <View style={[s.bar, !online && s.offline]}>
      <Ionicons name={online ? 'sync' : 'cloud-offline-outline'} size={14} color={COLORS.white} />
      <Text style={s.text}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#5602E6', paddingVertical: 5,
  },
  offline: { backgroundColor: '#3A3A44' },
  text: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
});