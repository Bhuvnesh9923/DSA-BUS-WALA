/**
 * BoundedQueue
 *
 * A fixed-capacity FIFO queue backed by a circular buffer.
 * - enqueue()  → O(1)
 * - dequeue()  → O(1)
 * - When full, enqueue() drops the OLDEST item (keeps the freshest N).
 * - No array.shift() / array.splice() — avoids the O(n) re-index cost.
 *
 * Use this for high-frequency position streams (GPS / socket updates) where
 * we want to keep only the latest N points and discard the stale ones.
 */
export default class BoundedQueue {
  /**
   * @param {number} capacity Maximum number of items the queue can hold.
   */
  constructor(capacity) {
    if (typeof capacity !== 'number' || capacity <= 0) {
      throw new Error('[BoundedQueue] capacity must be a positive number');
    }
    this.capacity = Math.floor(capacity);
    this.buffer = new Array(this.capacity);
    this.head = 0; // Index of the oldest item.
    this.tail = 0; // Index where the next item will be written.
    this.count = 0; // Number of valid items currently in the queue.
  }

  /**
   * Add an item to the back of the queue.
   * If the queue is full, the oldest item is evicted first.
   * @param {*} item
   */
  enqueue(item) {
    if (this.count === this.capacity) {
      // Full — evict the oldest by advancing head.
      this.head = (this.head + 1) % this.capacity;
      this.count -= 1;
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count += 1;
  }

  /**
   * Remove and return the oldest item.
   * @returns {*} The oldest item, or undefined if empty.
   */
  dequeue() {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Help GC.
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;
    return item;
  }

  /** Peek at the oldest item without removing it. */
  peek() {
    return this.count === 0 ? undefined : this.buffer[this.head];
  }

  /** Whether the queue is empty. */
  isEmpty() {
    return this.count === 0;
  }

  /** Whether the queue has reached its capacity. */
  isFull() {
    return this.count === this.capacity;
  }

  /** Current number of items. */
  size() {
    return this.count;
  }

  /** Remove all items. */
  clear() {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /** Return a plain array snapshot of the items in FIFO order. */
  toArray() {
    const result = [];
    for (let i = 0; i < this.count; i += 1) {
      result.push(this.buffer[(this.head + i) % this.capacity]);
    }
    return result;
  }
}
