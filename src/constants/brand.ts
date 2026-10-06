// Cambia el nombre de la app aquí y se actualiza en todas las pantallas.
export const BRAND = {
  name: 'Noctamar',
  tagline: 'Comparte tu noche, navega tu mar',
};

export const COLORS = {
  // Paleta
  blue: '#0B02E6',
  violet: '#A002E6',
  indigo: '#5602E6',
  azure: '#0241E6',
  magenta: '#E602DD',
  lavender: '#864FE6',
  // Base
  black: '#000000',
  white: '#FFFFFF',
  surface: '#121212',
  border: '#2A2A2A',
  muted: '#9A9AA5',
  error: '#FF5C8A',
};

export const GRADIENT_MAIN = [COLORS.azure, COLORS.indigo, COLORS.violet] as const;
export const GRADIENT_GLOW = [COLORS.blue, COLORS.violet, COLORS.magenta, COLORS.black] as const;