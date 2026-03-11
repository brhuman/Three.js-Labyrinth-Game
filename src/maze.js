export class Maze {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = [];
        this.init();
    }

    init() {
        // Initialize grid with all walls (1)
        for (let y = 0; y < this.height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.grid[y][x] = 1;
            }
        }
    }

    generate() {
        const startX = 1;
        const startY = 1;
        this.grid[startY][startX] = 0;

        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack[stack.length - 1];
            const neighbors = this.getNeighbors(x, y);

            if (neighbors.length > 0) {
                const [nx, ny, midX, midY] = neighbors[Math.floor(Math.random() * neighbors.length)];
                this.grid[ny][nx] = 0;
                this.grid[midY][midX] = 0;
                stack.push([nx, ny]);
            } else {
                stack.pop();
            }
        }
        
        // Ensure entrance and exit
        this.grid[1][0] = 0; // Entrance
        this.grid[this.height - 2][this.width - 1] = 0; // Exit
        
        return this.grid;
    }

    getNeighbors(x, y) {
        const neighbors = [];
        const directions = [[0, 2], [0, -2], [2, 0], [-2, 0]];

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && this.grid[ny][nx] === 1) {
                neighbors.push([nx, ny, x + dx / 2, y + dy / 2]);
            }
        }

        return neighbors;
    }
}
