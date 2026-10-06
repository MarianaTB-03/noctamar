import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, GRADIENT_MAIN } from '../constants/brand';
import { StoryGroup } from '../domain/stories';
import { isSeen, useSeenVersion } from '../stories/seenStore';
import { useTray } from '../stories/trayStore';
import { useAuth } from './AuthProvider';
import { Avatar } from './Avatar';

const SIZE = 62;

function Ring({ unseen, children }: { unseen: boolean; children: React.ReactNode }) {
  const inner = <View style={s.inner}>{children}</View>;
  return unseen ? (
    <LinearGradient colors={GRADIENT_MAIN} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={s.ring}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[s.ring, s.ringSeen]}>{inner}</View>
  );
}

/** Fila horizontal de historias que va arriba del feed. */
export function StoryTray() {
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const groups = useTray();
  useSeenVersion(); // se vuelve a pintar cuando algo pasa a "visto"

  const mine = groups.find((g) => g.author.id === myId);
  const others = groups.filter((g) => g.author.id !== myId);

  const open = (g: StoryGroup) => router.push(`/story/${g.author.id}` as any);
  const unseen = (g: StoryGroup) => g.stories.some((x) => !isSeen(x.id));

  const data: (StoryGroup | 'me')[] = ['me', ...others];

  return (
    <View style={s.wrap}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(g) => (g === 'me' ? 'me' : g.author.id)}
        contentContainerStyle={{ paddingHorizontal: 10 }}
        renderItem={({ item }) => {
          if (item === 'me') {
            return (
              <View style={s.item}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => (mine ? open(mine) : router.push('/create-story' as any))}
                >
                  <Ring unseen={!!mine && unseen(mine)}>
                    <Avatar
                      username={mine?.author.username ?? session?.user.email ?? '?'}
                      uri={mine?.author.avatar_url ?? null}
                      size={SIZE - 8}
                    />
                  </Ring>
                </TouchableOpacity>
                <TouchableOpacity style={s.plus} onPress={() => router.push('/create-story' as any)} hitSlop={6}>
                  <Ionicons name="add" size={16} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={s.label} numberOfLines={1}>Tu historia</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity style={s.item} activeOpacity={0.85} onPress={() => open(item)}>
              <Ring unseen={unseen(item)}>
                <Avatar username={item.author.username} uri={item.author.avatar_url} size={SIZE - 8} />
              </Ring>
              <Text style={[s.label, !unseen(item) && { color: COLORS.muted }]} numberOfLines={1}>
                {item.author.username}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 8 },
  item: { alignItems: 'center', width: 74, marginHorizontal: 2 },
  ring: { width: SIZE + 4, height: SIZE + 4, borderRadius: (SIZE + 4) / 2, alignItems: 'center', justifyContent: 'center' },
  ringSeen: { borderWidth: 2, borderColor: COLORS.border },
  inner: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: COLORS.black,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { color: COLORS.white, fontSize: 11, marginTop: 5, maxWidth: 70 },
  plus: {
    position: 'absolute', right: 6, top: SIZE - 18, width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.azure, borderWidth: 2, borderColor: COLORS.black,
    alignItems: 'center', justifyContent: 'center',
  },
});