/**
 * INTERCEPTA los enlaces del sistema (noctamar://post/{uuid} o exp://IP:8081/--/post/{uuid})
 * ANTES de que Expo Router los convierta en una ruta. Aquí se valida y se normaliza:
 *  - post/{uuid} válido  -> /post/{uuid}  (abre el detalle directamente)
 *  - cualquier otra cosa -> / (inicio), así un enlace roto o malicioso nunca rompe la app.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // Quita esquema/host: "noctamar://post/x", "exp://1.2.3.4:8081/--/post/x" o "/post/x"
    let p = path;
    const dev = p.indexOf('/--/');
    if (dev >= 0) p = p.slice(dev + 3);
    else p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/');
    p = p.split('?')[0].replace(/\/+$/, '');

    const m = p.match(/^\/?post\/([^/]+)$/i);
    if (m && UUID.test(m[1])) return `/post/${m[1].toLowerCase()}`;
    if (p === '' || p === '/') return '/';
    return '/';
  } catch {
    return '/';
  }
}