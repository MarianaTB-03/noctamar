/**
 * Caché LRU (Least Recently Used) genérica.
 *
 * Se apoya en que un Map de JavaScript conserva el ORDEN DE INSERCIÓN:
 *  - la primera clave del Map es la menos usada (la más antigua),
 *  - cada vez que se lee o escribe una clave se borra y se vuelve a insertar,
 *    así pasa al final (la "más reciente").
 * Cuando el costo total supera el máximo, se expulsan las claves del principio.
 *
 * El "costo" permite usarla con límite por número de entradas (costo 1 por entrada,
 * nivel RAM) o por bytes (costo = tamaño del archivo, nivel disco).
 * get/set son O(1).
 */
export class LRUCache<V> {
  private map = new Map<string, V>();
  private totalCost = 0;

  constructor(
    private readonly maxCost: number,
    private readonly costOf: (value: V) => number = () => 1,
    private readonly onEvict?: (key: string, value: V) => void
  ) {}

  get size() { return this.map.size; }
  get cost() { return this.totalCost; }
  has(key: string) { return this.map.has(key); }

  /** Lee y marca como "recién usada". */
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V) {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.totalCost -= this.costOf(old);
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.totalCost += this.costOf(value);
    // Expulsa las menos usadas hasta volver al presupuesto (siempre deja la recién escrita)
    while (this.totalCost > this.maxCost && this.map.size > 1) {
      const oldestKey = this.map.keys().next().value as string;
      const oldestValue = this.map.get(oldestKey) as V;
      this.map.delete(oldestKey);
      this.totalCost -= this.costOf(oldestValue);
      this.onEvict?.(oldestKey, oldestValue);
    }
  }

  /** Borra sin disparar onEvict (borrado explícito). */
  delete(key: string) {
    const old = this.map.get(key);
    if (old === undefined) return;
    this.totalCost -= this.costOf(old);
    this.map.delete(key);
  }

  /** Entradas de la más antigua a la más reciente (para persistir el índice). */
  entries(): [string, V][] {
    return Array.from(this.map.entries());
  }

  clear() {
    this.map.clear();
    this.totalCost = 0;
  }
}