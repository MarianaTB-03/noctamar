import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { COLORS } from '../../constants/brand';
import { usePendingCount } from '../../presentation/usePendingCount';

/**
 * Barra inferior persistente de 4 pestañas. Cada pestaña es un grupo con su PROPIA
 * pila de navegación (Stack) en su _layout, así que cambiar de pestaña no destruye
 * lo que había abierto en las demás.
 */
export default function TabsLayout() {
  const pending = usePendingCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: '#6F6F7B',
        tabBarStyle: { backgroundColor: COLORS.black, borderTopColor: COLORS.border },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          tabBarAccessibilityLabel: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(explore)"
        options={{
          tabBarAccessibilityLabel: 'Explorar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(activity)"
        options={{
          tabBarAccessibilityLabel: 'Actividad',
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: COLORS.magenta, color: COLORS.white },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          tabBarAccessibilityLabel: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={30} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}