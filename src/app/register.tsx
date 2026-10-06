import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BRAND, COLORS } from '../constants/brand';
import { supabase } from '../data/supabase';
import {
    AuthInput,
    AuthScreen,
    Divider, friendlyError,
    GradientButton,
    Logo,
} from '../presentation/auth/AuthUI';

type Errors = {
  fullName?: string; username?: string; email?: string; password?: string; confirm?: string;
};

export default function Register() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const e: Errors = {};
    if (!fullName.trim()) e.fullName = 'Escribe tu nombre.';
    if (!/^[a-z0-9._]{3,20}$/.test(username.trim().toLowerCase()))
      e.username = '3 a 20 caracteres: letras, números, punto o guion bajo.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Escribe un correo válido.';
    if (password.length < 6) e.password = 'Mínimo 6 caracteres.';
    if (confirm !== password) e.confirm = 'Las contraseñas no coinciden.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function signUp() {
    if (!validate()) return;
    setBusy(true);
    const uname = username.trim().toLowerCase();

    // ¿Ya existe ese usuario? (profiles es legible para todos)
    const { data: taken } = await supabase
      .from('profiles').select('id').eq('username', uname).maybeSingle();
    if (taken) {
      setBusy(false);
      setErrors({ username: 'Ese nombre de usuario ya está en uso.' });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: uname, full_name: fullName.trim() } },
    });
    setBusy(false);

    if (error) {
      Alert.alert('No se pudo crear la cuenta', friendlyError(error.message));
      return;
    }
    if (!data.session) {
      Alert.alert('Revisa tu correo', 'Te enviamos un enlace para confirmar tu cuenta.');
    }
    // Con sesión activa, el Gate de _layout te lleva al feed solo.
  }

  return (
    <AuthScreen>
      <Logo />
      <Text style={s.title}>Únete a {BRAND.name}</Text>

      <AuthInput placeholder="Nombre completo" autoCapitalize="words"
        value={fullName} onChangeText={setFullName} error={errors.fullName} />
      <AuthInput placeholder="Nombre de usuario"
        value={username} onChangeText={setUsername} error={errors.username} />
      <AuthInput placeholder="Correo electrónico" keyboardType="email-address"
        value={email} onChangeText={setEmail} error={errors.email} />
      <AuthInput placeholder="Contraseña" secure
        value={password} onChangeText={setPassword} error={errors.password} />
      <AuthInput placeholder="Confirmar contraseña" secure
        value={confirm} onChangeText={setConfirm} error={errors.confirm} />

      <GradientButton title="Crear cuenta" onPress={signUp} loading={busy} />

      <Divider />

      <View style={s.row}>
        <Text style={s.muted}>¿Ya tienes cuenta? </Text>
        <TouchableOpacity onPress={() => router.replace('/login' as any)}>
          <Text style={s.link}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  title: { color: COLORS.white, fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 18 },
  row: { flexDirection: 'row', justifyContent: 'center' },
  muted: { color: COLORS.muted },
  link: { color: COLORS.lavender, fontWeight: '700' },
});