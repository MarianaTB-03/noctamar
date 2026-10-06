# Noctamar

Red social móvil estilo Instagram, con identidad nocturna y marina. Proyecto 3 (V2) del parcial de Desarrollo Móvil, Universidad de La Sabana.

Construida con **React Native + Expo (Expo Go) + Expo Router + TypeScript** y **Supabase** (Auth, Postgres con RLS, Realtime y Storage).

---

## Funcionalidades

### Módulo 1: Feed, publicaciones y privacidad
- Registro e inicio de sesión (Supabase Auth, sesión persistente).
- Feed con paginación por cursor (`created_at < cursor`), sin saltos ni repetidos aunque se publique mientras se hace scroll.
- Publicar fotos (compresión a 1080 px / JPEG 75 % antes de subir), likes con doble toque y comentarios anidados en tiempo real.
- Compartir publicaciones mediante enlace profundo.
- Cuentas públicas y privadas: seguir, solicitud pendiente, aprobar o rechazar. La privacidad la aplica **el servidor** (RLS), no la app.
- Perfil con cuadrícula, contadores y listas de seguidores y seguidos.

### Módulo 2: Caché de imágenes propia
- Caché de dos niveles: RAM (LRU, 80 entradas) y disco (LRU, 80 MB).
- Clave de caché = ruta en Storage, no la URL firmada (que cambia en cada consulta).
- Descargas con `AbortController`: se cancelan cuando la celda sale del viewport.
- Cola de descargas acotada y LIFO (lo que está en pantalla pasa primero) y deduplicación de peticiones iguales.
- Mantener pulsado el logo muestra estadísticas de la caché (aciertos, descargas canceladas, etc.).

### Módulo 3: UI optimista y sincronización offline
- Los likes, comentarios y mensajes se reflejan al instante y se guardan en una **cola de salida en SQLite** (`outbox`).
- Orden garantizado con `seq INTEGER PRIMARY KEY AUTOINCREMENT`.
- Acciones fusionables (like + unlike se cancelan) y **reintentos idempotentes**: los ids los genera el cliente (UUID) y se usa `upsert`; el código 23505 se trata como éxito.
- Disparadores: recuperar conexión (NetInfo), volver a primer plano (AppState) y reintentos con espera exponencial.
- Errores permanentes: se revierte la interfaz y se avisa al usuario.

### Módulo 4: Mensajería en tiempo real
- Mensajes directos con `postgres_changes` de Realtime.
- Indicador "escribiendo…" por `broadcast`, estados entregado y visto, y bandeja reordenada por último mensaje.
- Contador de no leídos en el encabezado.

### Módulo 5: Navegación, deep linking e historias
- **Pilas independientes**: Inicio, Explorar, Actividad y Perfil tienen cada una su propio `Stack`; cambiar de pestaña no destruye lo abierto en las demás.
- **Deep linking**: `src/app/+native-intent.tsx` intercepta el enlace antes de que Expo Router lo convierta en ruta, valida el UUID y abre directamente el post. Si no hay sesión, recuerda el destino y lo abre tras iniciar sesión.
- **Historias de 24 h**: fila horizontal de avatares, visor a pantalla completa, una barra de progreso por historia con avance automático, pausa al mantener pulsado, toque izquierdo/derecho para retroceder/avanzar y estado "visto" guardado en el dispositivo.

---

## Arquitectura

```
src/
  app/            rutas (Expo Router): una pila por pestaña, rutas compartidas en un grupo común
  data/           repositorios (únicos que hablan con Supabase)
  domain/         tipos del dominio
  cache/          caché de imágenes LRU, viewport y componente CachedImage
  sync/           cola offline (SQLite) y motor de sincronización
  messaging/      escucha global de mensajes en tiempo real
  stories/        bandeja de historias y estado "visto"
  presentation/   componentes de interfaz
  constants/      marca y paleta
supabase/         SQL: esquema, políticas RLS, funciones y buckets
```

Las pantallas nunca llaman a `supabase` directamente: pasan por los repositorios de `data/`.

### Decisiones técnicas
| Tema | Decisión | Motivo |
|---|---|---|
| Paginación | Cursor por `created_at` | OFFSET repite o salta filas cuando cambian los datos |
| Privacidad | RLS + funciones `security definer` | La regla vive en el servidor; un cliente modificado no puede saltarla |
| Imágenes privadas | Bucket privado + URLs firmadas | Una cuenta privada no expone sus fotos |
| Caché | Clave = ruta de Storage | La URL firmada cambia siempre y rompería los aciertos |
| Cola offline | SQLite con `seq` autoincremental | Orden cronológico que sobrevive al cierre de la app |
| Idempotencia | UUID generado en el cliente + `upsert` | Un reintento nunca duplica |
| Barra de historia | `Animated.timing` | Pausable y reanudable desde el valor actual, sin temporizadores manuales |
| Estado "visto" | AsyncStorage local | El autor no sabe quién vio la historia |

---

## Puesta en marcha

### Requisitos
- Node.js 18 o superior
- Cuenta en [Supabase](https://supabase.com)
- App **Expo Go** en el celular (celular y computador en la misma red)

### 1. Base de datos
En **SQL Editor** de Supabase, ejecuta en este orden los archivos de `supabase/`:

1. `01_schema.sql`: tablas, RLS, triggers y Realtime
2. `02_storage_media.sql`: bucket privado `media` y sus políticas
3. `03_profile_stats_avatars.sql`: contadores y bucket público `avatars`
4. `04_connections_privacy.sql`: listas de seguidores y seguidos con privacidad
5. `05_messaging.sql`: funciones de mensajería

Después, en **Authentication → Providers → Email**, desactiva *Confirm email* (solo para desarrollo).

### 2. Variables de entorno
```
cp .env.example .env
```
En Windows (PowerShell): `Copy-Item .env.example .env`.

Completa `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API). **Nunca** uses la clave `service_role` en la app.

### 3. Instalar y ejecutar
```
npm install
npx expo start -c
```
Escanea el QR con Expo Go.

---

## Probar el deep linking

| Entorno | Enlace | Cómo |
|---|---|---|
| Expo Go | `exp://IP:8081/--/post/{uuid}` | Compartir un post y abrir el enlace, o `npx uri-scheme open "exp://IP:8081/--/post/UUID" --android` |
| Build propia | `noctamar://post/{uuid}` | `npx expo run:android` y luego `npx uri-scheme open "noctamar://post/UUID" --android` |

Casos a verificar: app cerrada, app abierta, sin sesión, enlace inválido (cae en Inicio) y post de una cuenta privada que no se sigue (muestra "no disponible").

---

## Limitaciones conocidas
- `noctamar://` solo funciona en una build propia; en Expo Go el esquema es `exp://`.
- Las listas (feed, comentarios) no se leen sin conexión; lo offline cubre las **acciones** (likes, comentarios, mensajes), no mostrar contenido sin red.
- El canal de "escribiendo…" no usa autorización de Realtime: quien conozca el UUID de la conversación podría escuchar ese aviso.
- Las cuadrículas cargan las imágenes a tamaño completo, sin miniaturas.
- Las historias vencidas dejan de mostrarse por la política RLS, pero no se borran del servidor (un `pg_cron` podría limpiarlas).

---

## Tecnologías
Expo SDK 56 · React Native · Expo Router · TypeScript · Supabase (Auth, Postgres, Realtime, Storage) · expo-sqlite · NetInfo · expo-image-manipulator · expo-image-picker · expo-crypto · expo-linear-gradient

## Autoría
Mar, Universidad de La Sabana. Desarrollo Móvil, 2026.