import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView, StyleSheet,
    Switch,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/brand';
import {
    fetchOwnProfile, isUsernameTaken, updateProfile, uploadAvatar,
} from '../../../data/profileRepository';
import { FullProfile } from '../../../domain/profile';
import { AuthInput, GradientButton } from '../../../presentation/auth/AuthUI';
import { Avatar } from '../../../presentation/Avatar';

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [newAvatar, setNewAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [errors, setErrors] = useState<{ fullName?: string; username?: string }>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOwnProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name ?? '');
        setUsername(p.username);
        setBio(p.bio ?? '');
        setIsPrivate(p.is_private);
      })
      .catch((e) => console.warn('edit profile load error', e))
      .finally(() => setLoading(false));
  }, []);

  async function pickAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!res.canceled) setNewAvatar(res.assets[0]);
  }

  async function onSave() {
    if (!profile) return;
    const uname = username.trim().toLowerCase();

    const e: typeof errors = {};
    if (!fullName.trim()) e.fullName = 'Escribe tu nombre.';
    if (!/^[a-z0-9._]{3,20}$/.test(uname))
      e.username = '3 a 20 caracteres: letras, números, punto o guion bajo.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      if (uname !== profile.username && (await isUsernameTaken(uname))) {
        setErrors({ username: 'Ese nombre de usuario ya está en uso.' });
        setBusy(false);
        return;
      }

      let avatar_url = profile.avatar_url;
      if (newAvatar) avatar_url = await uploadAvatar(newAvatar.uri, newAvatar.width);

      await updateProfile({
        username: uname,
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        is_private: isPrivate,
        avatar_url,
      });
      setBusy(false);
      router.back(); // el perfil se recarga solo al recuperar el foco
    } catch (err: any) {
      setBusy(false);
      Alert.alert('No se pudo guardar', err?.message ?? 'Inténtalo de nuevo.');
    }
  }

  if (loading || !profile) {
    return (
      <View style={[s.screen, { justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} disabled={busy} style={{ width: 80 }}>
          <Text style={s.cancel}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={s.title}>Editar perfil</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.avatarBlock}>
          <Avatar
            username={username || profile.username}
            uri={newAvatar ? newAvatar.uri : profile.avatar_url}
            size={96}
          />
          <TouchableOpacity onPress={pickAvatar} disabled={busy}>
            <Text style={s.change}>Cambiar foto de perfil</Text>
          </TouchableOpacity>
        </View>

        <AuthInput
          placeholder="Nombre completo"
          autoCapitalize="words"
          value={fullName}
          onChangeText={setFullName}
          error={errors.fullName}
        />
        <AuthInput
          placeholder="Nombre de usuario"
          value={username}
          onChangeText={setUsername}
          error={errors.username}
        />

        <TextInput
          style={s.bio}
          placeholder="Biografía"
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={150}
          value={bio}
          onChangeText={setBio}
          editable={!busy}
        />
        <Text style={s.counter}>{bio.length}/150</Text>

        <View style={s.privacyRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.privacyTitle}>Cuenta privada</Text>
            <Text style={s.privacyText}>
              Solo los seguidores que apruebes podrán ver tus fotos y tu lista de seguidores.
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: COLORS.border, true: COLORS.indigo }}
            thumbColor={isPrivate ? COLORS.lavender : '#CCCCCC'}
            disabled={busy}
          />
        </View>

        <GradientButton title="Guardar cambios" onPress={onSave} loading={busy} />
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
  body: { padding: 20, paddingBottom: 50 },
  avatarBlock: { alignItems: 'center', marginBottom: 22 },
  change: { color: COLORS.lavender, fontWeight: '600', marginTop: 12 },
  bio: {
    backgroundColor: COLORS.surface, color: COLORS.white, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    minHeight: 80, textAlignVertical: 'top', fontSize: 15,
  },
  counter: { color: COLORS.muted, fontSize: 12, textAlign: 'right', marginTop: 4, marginBottom: 18 },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 22,
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  privacyTitle: { color: COLORS.white, fontWeight: '700', marginBottom: 2 },
  privacyText: { color: COLORS.muted, fontSize: 12 },
});