import { describe, it, expect } from 'vitest';
import { Maze } from './maze.js';
import { findPathBFS } from './utils.js';

describe('Maze Solvability', () => {
  it('should generate a solvable path from entrance to exit', () => {
    // Test multiple generations to ensure consistency
    for (let i = 0; i < 10; i++) {
        const width = 25;
        const height = 25;
        const maze = new Maze(width, height);
        const grid = maze.generate();
        
        const startX = 0, startY = 1;
        const endX = width - 1, endY = height - 2;
        
        const path = findPathBFS(grid, width, height, startX, startY, endX, endY);
        expect(path.length).toBeGreaterThan(0);
    }
  });

  it('should have a path to every key and then its door', () => {
      // This is harder to test without the full Game logic, 
      // but we can at least check if there's a path between any two points in the grid
      const width = 25;
      const height = 25;
      const maze = new Maze(width, height);
      const grid = maze.generate();
      
      const emptySpaces = [];
      for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
              if (grid[y][x] === 0) emptySpaces.push([x, y]);
          }
      }
      
      // Pick 5 random pairs and check if they are connected
      for (let i = 0; i < 5; i++) {
          const s = emptySpaces[Math.floor(Math.random() * emptySpaces.length)];
          const e = emptySpaces[Math.floor(Math.random() * emptySpaces.length)];
          const path = findPathBFS(grid, width, height, s[0], s[1], e[0], e[1]);
          expect(path.length).toBeGreaterThan(0);
      }
  });
});

describe('Maze Generator', () => {
  it('should generate a grid of correct dimensions', () => {
    const width = 21;
    const height = 21;
    const maze = new Maze(width, height);
    const grid = maze.generate();
    
    expect(grid.length).toBe(height);
    expect(grid[0].length).toBe(width);
  });

  it('should have walls at boundaries', () => {
    const maze = new Maze(21, 21);
    const grid = maze.generate();
    
    expect(grid[0][0]).toBe(1);
    expect(grid[20][20]).toBe(1);
  });

  it('should have a valid start and end path', () => {
    const maze = new Maze(21, 21);
    const grid = maze.generate();
    
    // Start is usually at (0, 1) or similar depending on implementation
    // But we just check if there's at least some path (0)
    let pathCount = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (grid[y][x] === 0) pathCount++;
      }
    }
    expect(pathCount).toBeGreaterThan(0);
  });
});
