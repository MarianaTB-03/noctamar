import { Stack } from 'expo-router';
import { COLORS } from '../../../constants/brand';

export const unstable_settings = { initialRouteName: 'activity', anchor: 'activity' };

// Pila propia de la pestaña Actividad
export default function ActivityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.black } }} />
  );
}