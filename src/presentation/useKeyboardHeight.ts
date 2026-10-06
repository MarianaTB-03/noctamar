import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Altura actual del teclado (0 si está oculto).
 * En Android el teclado se dibuja ENCIMA de la pantalla sin empujarla, así que la
 * pantalla mide el teclado y se sube ella misma. En iOS se usa el evento "will"
 * para que la subida vaya al mismo tiempo que la animación del teclado.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));

    // Importante: quitar los listeners al salir evita fugas de memoria
    return () => { show.remove(); hide.remove(); };
  }, []);

  return height;
}