import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageResizeMode, ImageStyle, StyleProp, View } from 'react-native';
import { COLORS } from '../constants/brand';
import { peek, request } from './imageCache';

interface Props {
  /** Clave estable de la imagen (ruta en Storage). NO la URL firmada. */
  cacheKey: string;
  /** URL (firmada) desde la que descargar si no está en caché. */
  uri: string;
  style: StyleProp<ImageStyle>;
  /** false = la celda no está en pantalla: no se descarga y se cancela lo pendiente. */
  active?: boolean;
  /** Se llama cuando la imagen ya está lista para mostrarse (las historias arrancan su barra aquí). */
  onReady?: () => void;
  resizeMode?: ImageResizeMode;
}

function CachedImageBase({ cacheKey, uri, style, active = true, onReady, resizeMode }: Props) {
  const [src, setSrc] = useState<string | undefined>(() => peek(cacheKey));
  // La URL firmada cambia en cada recarga; se guarda en un ref para no reiniciar la descarga
  const uriRef = useRef(uri);
  uriRef.current = uri;

  useEffect(() => {
    const hit = peek(cacheKey);
    if (hit) { setSrc(hit); return; }
    if (!active || !uriRef.current) return;

    let alive = true;
    const req = request(cacheKey, uriRef.current);
    req.promise.then((local) => { if (alive) setSrc(local); }).catch(() => {});

    // Al desmontar la celda o salir del viewport: se cancela la descarga
    return () => { alive = false; req.cancel(); };
  }, [cacheKey, active]);

  useEffect(() => { if (src) onReady?.(); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) return <View style={[style as any, { backgroundColor: COLORS.surface }]} />;
  return (
    <Image
      source={{ uri: src }}
      style={style}
      resizeMode={resizeMode}
      resizeMethod="resize" // Android: decodifica al tamaño de la vista, no a 12 MP (menos memoria)
      fadeDuration={0}
    />
  );
}

export const CachedImage = React.memo(CachedImageBase);