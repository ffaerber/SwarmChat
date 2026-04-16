export class LRUSet {
  private order: string[] = [];
  private set = new Set<string>();

  constructor(private capacity: number = 10_000) {}

  has(id: string): boolean {
    return this.set.has(id);
  }

  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.order.push(id);
    if (this.order.length > this.capacity) {
      const evicted = this.order.shift();
      if (evicted) this.set.delete(evicted);
    }
    return true;
  }
}
