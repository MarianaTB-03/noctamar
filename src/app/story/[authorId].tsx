import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Easing,
    GestureResponderEvent,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '../../cache/CachedImage';
import { COLORS } from '../../constants/brand';
import { deleteStory } from '../../data/storiesRepository';
import { useAuth } from '../../presentation/AuthProvider';
import { Avatar } from '../../presentation/Avatar';
import { isSeen, markSeen } from '../../stories/seenStore';
import { getTrayGroups, refreshTray } from '../../stories/trayStore';

const DURATION = 5000;       // cada historia dura 5 s
const TAP_MS = 220;          // menos que esto = toque; más = mantener pulsado (pausa)
const SCREEN_W = Dimensions.get('window').width;

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h`;
}

export default function StoryViewer() {
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [groups] = useState(() => getTrayGroups());
  const startGroup = Math.max(0, groups.findIndex((g) => g.author.id === authorId));
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(() => {
    const first = groups[startGroup]?.stories.findIndex((x) => !isSeen(x.id)) ?? 0;
    return first < 0 ? 0 : first; // abre en la primera sin ver; si ya las viste todas, desde el principio
  });

  const progress = useRef(new Animated.Value(0)).current;
  const progressValue = useRef(0);
  const pos = useRef({ gi, si });
  pos.current = { gi, si };
  const ready = useRef(false);
  const holding = useRef(false);
  const pressStart = useRef(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => { progressValue.current = value; });
    return () => progress.removeListener(id);
  }, [progress]);

  const group = groups[gi];
  const story = group?.stories[si];

  const close = useCallback(() => {
    progress.stopAnimation();
    if (myId) refreshTray(myId); // reordena la bandeja (las vistas pasan al final)
    router.back();
  }, [router, myId, progress]);

  const go = useCallback((delta: 1 | -1) => {
    const { gi: g, si: i } = pos.current;
    const stories = groups[g].stories;
    progress.stopAnimation();
    progress.setValue(0);
    ready.current = false;
    if (delta === 1) {
      if (i < stories.length - 1) setSi(i + 1);
      else if (g < groups.length - 1) { setGi(g + 1); setSi(0); }
      else close();
    } else {
      if (i > 0) setSi(i - 1);
      else if (g > 0) { setGi(g - 1); setSi(0); }
      else { ready.current = true; run(0); } // ya es la primera: reinicia
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, close, progress]);

  /** Anima la barra desde `from` hasta 1; al terminar pasa a la siguiente historia. */
  const run = useCallback((from: number) => {
    progress.stopAnimation();
    progress.setValue(from);
    Animated.timing(progress, {
      toValue: 1,
      duration: (1 - from) * DURATION,
      easing: Easing.linear,
      useNativeDriver: false, // anima `width`, que no soporta el driver nativo
    }).start(({ finished }) => { if (finished) go(1); });
  }, [progress, go]);

  // La barra arranca SOLO cuando la imagen ya está lista (así no se "gasta" mientras carga)
  const onImageReady = useCallback(() => {
    ready.current = true;
    if (story) markSeen(story.id);
    if (!holding.current) run(0);
  }, [run, story]);

  // Si alguien cierra la pantalla (botón atrás) se detiene la animación
  useEffect(() => () => progress.stopAnimation(), [progress]);

  function pause() { holding.current = true; progress.stopAnimation(); }
  function resume() {
    holding.current = false;
    if (ready.current) run(progressValue.current); // continúa desde donde quedó, no desde cero
  }

  function onPressIn() { pressStart.current = Date.now(); pause(); }
  function onPressOut(e: GestureResponderEvent) {
    const wasTap = Date.now() - pressStart.current < TAP_MS;
    if (!wasTap) { resume(); return; }       // mantuvo pulsado: solo reanuda
    holding.current = false;
    go(e.nativeEvent.pageX < SCREEN_W / 3 ? -1 : 1); // izquierda = anterior, resto = siguiente
  }

  function onDelete() {
    if (!story) return;
    pause();
    Alert.alert('¿Eliminar historia?', 'Se borrará para todos.', [
      { text: 'Cancelar', style: 'cancel', onPress: resume },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(story);
            if (myId) await refreshTray(myId);
            router.back();
          } catch (e: any) {
            Alert.alert('No se pudo eliminar', e?.message ?? 'Inténtalo de nuevo.');
            resume();
          }
        },
      },
    ], { onDismiss: resume });
  }

  if (!group || !story) {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.white }}>Esta historia ya no está disponible.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.lavender, fontWeight: '600' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isMine = group.author.id === myId;

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ animation: 'fade' }} />
      <StatusBar style="light" hidden />

      <CachedImage
        key={story.id}
        cacheKey={story.imagePath}
        uri={story.imageUrl}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        onReady={onImageReady}
      />

      {/* Capa táctil: mantener = pausa; toque corto = anterior / siguiente */}
      <Pressable style={StyleSheet.absoluteFill} onPressIn={onPressIn} onPressOut={onPressOut} />

      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={s.bars} pointerEvents="none">
          {group.stories.map((st, i) => (
            <View key={st.id} style={s.track}>
              <Animated.View
                style={[
                  s.fill,
                  {
                    width: i < si ? '100%'
                      : i === si ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                      : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={s.header} pointerEvents="box-none">
          <Avatar username={group.author.username} uri={group.author.avatar_url} size={32} />
          <Text style={s.name}>{group.author.username}</Text>
          <Text style={s.time}>{ago(story.createdAt)}</Text>
          <View style={{ flex: 1 }} />
          {isMine && (
            <TouchableOpacity onPress={onDelete} hitSlop={12} style={{ marginRight: 16 }}>
              <Ionicons name="trash-outline" size={22} color={COLORS.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={close} hitSlop={12}>
            <Ionicons name="close" size={28} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 8 },
  bars: { flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 4 },
  name: { color: COLORS.white, fontWeight: '700' },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});