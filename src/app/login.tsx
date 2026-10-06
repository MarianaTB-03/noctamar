import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants/brand';
import { supabase } from '../data/supabase';
import {
  AuthInput,
  AuthScreen,
  Divider, friendlyError,
  GradientButton,
  Logo,
} from '../presentation/auth/AuthUI';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Escribe un correo válido.';
    if (!password) e.password = 'Escribe tu contraseña.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function signIn() {
    if (!validate()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) Alert.alert('No se pudo iniciar sesión', friendlyError(error.message));
    // Si sale bien, el Gate de _layout te lleva al feed solo.
  }

  return (
    <AuthScreen>
      <Logo />
      <AuthInput
        placeholder="Correo electrónico"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
      />
      <AuthInput
        placeholder="Contraseña"
        secure
        value={password}
        onChangeText={setPassword}
        error={errors.password}
      />
      <GradientButton title="Iniciar sesión" onPress={signIn} loading={busy} />

      <Divider />

      <View style={s.row}>
        <Text style={s.muted}>¿No tienes cuenta? </Text>
        <TouchableOpacity onPress={() => router.replace('/register' as any)}>
          <Text style={s.link}>Regístrate</Text>
        </TouchableOpacity>
      </View>
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center' },
  muted: { color: COLORS.muted },
  link: { color: COLORS.lavender, fontWeight: '700' },
});