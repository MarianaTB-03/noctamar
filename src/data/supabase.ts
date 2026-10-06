import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,      // la sesión sobrevive al cierre de la app
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,  // en móvil no hay redirect por URL
    },
  }
);