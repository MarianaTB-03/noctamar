import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text, TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/brand';
import { publishPost } from '../data/postUploader';
import { GradientButton } from '../presentation/auth/AuthUI';

export default function CreatePost() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1, // la compresión real la hace publishPost
    });
    if (!res.canceled) setAsset(res.assets[0]);
  }

  async function onPublish() {
    if (!asset) {
      Alert.alert('Falta la foto', 'Elige una imagen para publicar.');
      return;
    }
    setBusy(true);
    try {
      await publishPost({ uri: asset.uri, width: asset.width, caption });
      setBusy(false);
      router.back(); // el feed se refresca solo al recuperar el foco
    } catch (e: any) {
      setBusy(false);
      Alert.alert('No se pudo publicar', e?.message ?? 'Inténtalo de nuevo.');
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
        <Text style={s.title}>Nueva publicación</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <TouchableOpacity activeOpacity={0.85} onPress={pickImage} disabled={busy}>
          {asset ? (
            <Image source={{ uri: asset.uri }} style={s.preview} />
          ) : (
            <View style={[s.preview, s.placeholder]}>
              <Ionicons name="images-outline" size={44} color={COLORS.lavender} />
              <Text style={s.placeholderText}>Toca para elegir una foto</Text>
            </View>
          )}
        </TouchableOpacity>

        {asset && (
          <TouchableOpacity onPress={pickImage} disabled={busy}>
            <Text style={s.change}>Cambiar foto</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={s.caption}
          placeholder="Escribe un pie de foto..."
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={2200}
          value={caption}
          onChangeText={setCaption}
          editable={!busy}
        />
        <Text style={s.counter}>{caption.length}/2200</Text>

        <GradientButton title="Publicar" onPress={onPublish} loading={busy} disabled={!asset} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  cancel: { color: COLORS.lavender, fontSize: 15 },
  title: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 40 },
  preview: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: COLORS.surface },
  placeholder: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.indigo,
  },
  placeholderText: { color: COLORS.muted, marginTop: 10 },
  change: { color: COLORS.lavender, textAlign: 'center', marginTop: 10, fontWeight: '600' },
  caption: {
    backgroundColor: COLORS.surface, color: COLORS.white, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 16,
    minHeight: 90, textAlignVertical: 'top', fontSize: 15,
  },
  counter: { color: COLORS.muted, fontSize: 12, textAlign: 'right', marginTop: 4, marginBottom: 12 },
});