import { GrandHotel_400Regular, useFonts } from '@expo-google-fonts/grand-hotel';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet,
  Text, TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { BRAND, COLORS, GRADIENT_GLOW, GRADIENT_MAIN } from '../../constants/brand';
import { useKeyboardHeight } from '../useKeyboardHeight';

/** Lo usa cada AuthInput para avisar a la pantalla "me enfocaron, no me tapes". */
const FocusContext = createContext<(view: View | null) => void>(() => {});

/** Traduce los errores más comunes de Supabase Auth. */
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('is invalid')) return 'Ese correo no es válido.';
  if (m.includes('network')) return 'Sin conexión. Revisa tu internet.';
  return message;
}

/** Fondo negro con resplandor degradado arriba (noche + mar). */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  // En Android el teclado se dibuja ENCIMA de la pantalla sin empujarla: la pantalla mide el
  // teclado, se da espacio extra al final y se desplaza sola hasta dejar visible el campo enfocado.
  const kb = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const focused = useRef<View | null>(null);

  const reveal = useCallback(() => {
    const view = focused.current;
    if (!view || kb === 0) return;
    // Esperamos un instante a que el relleno inferior ya esté aplicado
    setTimeout(() => {
      view.measureInWindow((_x, y, _w, h) => {
        const keyboardTop = Dimensions.get('window').height - kb;
        const overflow = y + h - (keyboardTop - 24); // 24 px de aire sobre el teclado
        if (overflow > 0) scrollRef.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    }, 120);
  }, [kb]);

  // Al aparecer el teclado (o cambiar de campo con él abierto) se revisa si el campo queda tapado
  useEffect(() => { reveal(); }, [reveal]);
  const onFocusInput = useCallback((view: View | null) => { focused.current = view; reveal(); }, [reveal]);

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={GRADIENT_GLOW}
        locations={[0, 0.35, 0.7, 1]}
        style={s.glow}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FocusContext.Provider value={onFocusInput}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[s.scroll, { paddingBottom: 40 + kb }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
          >
            {children}
          </ScrollView>
        </FocusContext.Provider>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Logo con tipografía script, al estilo del logo de Instagram. */
export function Logo() {
  const [loaded] = useFonts({ GrandHotel_400Regular });
  return (
    <View style={s.logoWrap}>
      <Text style={s.moon}>🌙</Text>
      <Text
        style={[
          s.logo,
          loaded ? { fontFamily: 'GrandHotel_400Regular' } : { fontStyle: 'italic' },
        ]}
      >
        {BRAND.name}
      </Text>
      <Text style={s.tagline}>{BRAND.tagline}</Text>
    </View>
  );
}

type InputProps = TextInputProps & { error?: string; secure?: boolean };

export function AuthInput({ error, secure, ...props }: InputProps) {
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const onFocusInput = useContext(FocusContext);
  const box = useRef<View>(null);
  return (
    <View ref={box} style={{ marginBottom: 12 }}>
      <View style={[s.inputWrap, focus && s.inputFocus, !!error && s.inputError]}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={COLORS.muted}
          {...props}
          secureTextEntry={hidden}
          style={s.input}
          onFocus={() => { setFocus(true); onFocusInput(box.current); }}
          onBlur={() => setFocus(false)}
        />
        {secure && (
          <TouchableOpacity onPress={() => setHidden((h) => !h)}>
            <Text style={s.toggle}>{hidden ? 'Mostrar' : 'Ocultar'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

export function GradientButton({
  title, onPress, loading, disabled,
}: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={disabled || loading}>
      <LinearGradient
        colors={GRADIENT_MAIN}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.btn, disabled && { opacity: 0.5 }]}
      >
        {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.btnText}>{title}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function Divider() {
  return (
    <View style={s.dividerRow}>
      <View style={s.line} />
      <Text style={s.dividerText}>O</Text>
      <View style={s.line} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 380, opacity: 0.55 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: 70, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  moon: { fontSize: 30, marginBottom: 2 },
  logo: {
    fontSize: 58, color: COLORS.white,
    textShadowColor: COLORS.lavender, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 },
  },
  tagline: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14,
  },
  inputFocus: { borderColor: COLORS.lavender },
  inputError: { borderColor: COLORS.error },
  input: { flex: 1, color: COLORS.white, paddingVertical: 14, fontSize: 15 },
  toggle: { color: COLORS.lavender, fontWeight: '600', fontSize: 13 },
  error: { color: COLORS.error, fontSize: 12, marginTop: 4, marginLeft: 4 },
  btn: { borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, marginHorizontal: 14, fontWeight: '600', fontSize: 12 },
});