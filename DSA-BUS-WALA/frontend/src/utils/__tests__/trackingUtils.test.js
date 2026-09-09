import { describe, it, expect } from 'vitest';
import BoundedQueue from '../BoundedQueue';
import { projectToPath, densifyPath } from '../projectToPath';

describe('BoundedQueue', () => {
  it('enqueues and dequeues in FIFO order', () => {
    const q = new BoundedQueue(3);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.size()).toBe(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.dequeue()).toBe(3);
    expect(q.isEmpty()).toBe(true);
  });

  it('evicts oldest when full', () => {
    const q = new BoundedQueue(2);
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c'); // evicts 'a'
    expect(q.size()).toBe(2);
    expect(q.toArray()).toEqual(['b', 'c']);
  });

  it('peek returns oldest without removing', () => {
    const q = new BoundedQueue(2);
    q.enqueue('x');
    q.enqueue('y');
    expect(q.peek()).toBe('x');
    expect(q.size()).toBe(2);
  });

  it('isFull reflects capacity', () => {
    const q = new BoundedQueue(1);
    expect(q.isFull()).toBe(false);
    q.enqueue(1);
    expect(q.isFull()).toBe(true);
  });

  it('clear removes all', () => {
    const q = new BoundedQueue(2);
    q.enqueue(1);
    q.enqueue(2);
    q.clear();
    expect(q.isEmpty()).toBe(true);
  });

  it('throws on non-positive capacity', () => {
    expect(() => new BoundedQueue(0)).toThrow();
  });
});

describe('projectToPath', () => {
  const path = [
    [10, 20],
    [11, 21],
    [12, 21]
  ];

  it('returns nearest point on a segment', () => {
    const point = { lat: 10.5, lng: 20.5 };
    const proj = projectToPath(path, point);
    expect(proj.lat).toBeGreaterThanOrEqual(10);
    expect(proj.lat).toBeLessThanOrEqual(11);
  });

  it('returns the point when path is null', () => {
    const point = { lat: 5, lng: 6 };
    expect(projectToPath(null, point)).toEqual(point);
  });

  it('handles degenerate single-point path', () => {
    const point = { lat: 5, lng: 6 };
    expect(projectToPath([[5, 6]], point)).toEqual(point);
  });
});

describe('densifyPath', () => {
  it('inserts intermediate points', () => {
    const result = densifyPath([[0, 0], [0, 0.001]], 0.0004);
    expect(result.length).toBeGreaterThan(2);
  });

  it('returns empty for null path', () => {
    expect(densifyPath(null)).toEqual([]);
  });

  it('keeps endpoints', () => {
    const result = densifyPath([[0, 0], [0, 0.001]], 0.0004);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([0, 0.001]);
  });
});
