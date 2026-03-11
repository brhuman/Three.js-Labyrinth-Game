import { describe, it, expect } from 'vitest';
import { Maze } from '../maze.js';

describe('Maze Generation', () => {
  it('should generate a grid of the correct size', () => {
    const size = 11;
    const maze = new Maze(size, size);
    const grid = maze.generate();
    
    expect(grid.length).toBe(size);
    expect(grid[0].length).toBe(size);
  });

  it('should have an entrance and exit', () => {
    const size = 11;
    const maze = new Maze(size, size);
    const grid = maze.generate();
    
    // Entrance at [1][0] should be 0 (path)
    expect(grid[1][0]).toBe(0);
    // Exit at [size-2][size-1] should be 0 (path)
    expect(grid[size - 2][size - 1]).toBe(0);
  });

  it('should only contain 0s and 1s', () => {
    const size = 11;
    const maze = new Maze(size, size);
    const grid = maze.generate();
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        expect([0, 1]).toContain(grid[y][x]);
      }
    }
  });
});

// Mock collision logic test
const checkPlayerCollisionMock = (x, z, mazeSize, grid) => {
    const r = 0.35;
    const minX = Math.floor(x - r + 0.5);
    const maxX = Math.floor(x + r + 0.5);
    const minZ = Math.floor(z - r + 0.5);
    const maxZ = Math.floor(z + r + 0.5);
    
    for (let gy = minZ; gy <= maxZ; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
            if (gx < 0 || gx >= mazeSize || gy < 0 || gy >= mazeSize) return true;
            if (grid[gy][gx] === 1) {
                const testX = Math.max(gx - 0.5, Math.min(x, gx + 0.5));
                const testZ = Math.max(gy - 0.5, Math.min(z, gy + 0.5));
                const distX = x - testX;
                const distZ = z - testZ;
                if ((distX*distX + distZ*distZ) <= r*r) return true;
            }
        }
    }
    return false;
};

describe('Collision Logic (AABB)', () => {
  const mazeSize = 5;
  const mockGrid = [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1]
  ];

  it('should return true for out of bounds (negative)', () => {
    // Player radius is 0.35. A grid cell x=0 spans [-0.5, +0.5].
    // If x = -0.2, the left edge is -0.55, which means minX will be Math.floor(-0.55 + 0.5) = -1
    expect(checkPlayerCollisionMock(-0.2, 1, mazeSize, mockGrid)).toBe(true);
    expect(checkPlayerCollisionMock(1, -0.2, mazeSize, mockGrid)).toBe(true);
  });

  it('should return true for out of bounds (large)', () => {
    // mazeSize = 5. So grid goes up to 4, which spans [3.5, 4.5].
    // Edge of world is 4.5. If z = 4.2 + radius 0.35 = 4.55 -> maxZ = 5 (Out of bounds)
    expect(checkPlayerCollisionMock(4.2, 1, mazeSize, mockGrid)).toBe(true);
  });

  it('should correctly identify walls on overlap', () => {
    expect(checkPlayerCollisionMock(0.5, 0.5, mazeSize, mockGrid)).toBe(true); 
    expect(checkPlayerCollisionMock(2, 2, mazeSize, mockGrid)).toBe(true); 
  });

  it('should correctly identify safe paths', () => {
    expect(checkPlayerCollisionMock(1, 1, mazeSize, mockGrid)).toBe(false); 
    expect(checkPlayerCollisionMock(0, 1, mazeSize, mockGrid)).toBe(false); 
  });
});

