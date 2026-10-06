import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native';
import { CachedImage } from '../cache/CachedImage';
import { COLORS, GRADIENT_MAIN } from '../constants/brand';

interface Props {
  username: string;
  uri: string | null;
  size?: number;
}

/** Avatar: foto si existe; si no, círculo degradado con la inicial del usuario. */
export function Avatar({ username, uri, size = 34 }: Props) {
  const base = { width: size, height: size, borderRadius: size / 2 };
  // Las URLs de avatar llevan ?v=<versión>, así que la propia URL sirve como clave de caché
  if (uri) return <CachedImage cacheKey={uri} uri={uri} style={base} />;
  return (
    <LinearGradient
      colors={GRADIENT_MAIN}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[base, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: size * 0.42 }}>
        {username.charAt(0).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}