import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/brand';
import { publishStory } from '../data/storiesRepository';
import { GradientButton } from '../presentation/auth/AuthUI';
import { useAuth } from '../presentation/AuthProvider';
import { refreshTray } from '../stories/trayStore';

const W = Dimensions.get('window').width - 80;

export default function CreateStory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], // sin videos
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });
    if (!res.canceled) setAsset(res.assets[0]);
  }

  async function onPublish() {
    if (!asset || !session) return;
    setBusy(true);
    try {
      await publishStory(asset.uri, asset.width);
      await refreshTray(session.user.id);
      router.back();
    } catch (e: any) {
      setBusy(false);
      Alert.alert('No se pudo publicar la historia', e?.message ?? 'Inténtalo de nuevo.');
    }
  }

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />
      <StatusBar style="light" />
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} disabled={busy} style={{ width: 80 }}>
          <Text style={s.cancel}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={s.title}>Nueva historia</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={s.body}>
        <TouchableOpacity activeOpacity={0.85} onPress={pick} disabled={busy}>
          {asset ? (
            <Image source={{ uri: asset.uri }} style={s.preview} />
          ) : (
            <View style={[s.preview, s.placeholder]}>
              <Ionicons name="images-outline" size={44} color={COLORS.lavender} />
              <Text style={s.placeholderText}>Toca para elegir una foto</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={s.hint}>Desaparece a las 24 horas.</Text>
        <View style={{ width: '100%', marginTop: 16 }}>
          <GradientButton title="Compartir historia" onPress={onPublish} loading={busy} disabled={!asset} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  cancel: { color: COLORS.white },
  title: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', padding: 24 },
  preview: { width: W, height: (W * 16) / 9 > 480 ? 480 : (W * 16) / 9, borderRadius: 14, backgroundColor: COLORS.surface },
  placeholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  placeholderText: { color: COLORS.muted, marginTop: 8 },
  hint: { color: COLORS.muted, marginTop: 12 },
});