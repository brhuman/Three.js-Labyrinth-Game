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
        // 1. Initialize grid with walls
        this.init();

        // 2. Place random rooms (they become the 'seeds' of the path)
        this.createRooms();

        // 3. Collect all path cells as starting points for the maze
        let pathCells = [];
        for (let y = 1; y < this.height - 1; y += 2) {
            for (let x = 1; x < this.width - 1; x += 2) {
                if (this.grid[y][x] === 0) {
                    pathCells.push([x, y]);
                }
            }
        }

        // If no rooms, start from (1,1)
        if (pathCells.length === 0) {
            pathCells.push([1, 1]);
            this.grid[1][1] = 0;
        }

        // Shuffle path cells to start carving from random seeds
        pathCells.sort(() => Math.random() - 0.5);
        const stack = [...pathCells];

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
        
        // 4. Add non-linearity (Loops)
        this.addNonLinearity(0.12);

        // 5. Ensure entrance and exit connectivity
        this.grid[1][0] = 0; // Entrance
        this.grid[1][1] = 0; 
        this.grid[this.height - 2][this.width - 1] = 0; // Exit
        this.grid[this.height - 2][this.width - 2] = 0;

        return this.grid;
    }

    createRooms() {
        // Adjust number of rooms based on size
        const numRooms = Math.floor((this.width * this.height) / 200); 
        for (let i = 0; i < numRooms; i++) {
            // Room dimensions should be odd for better grid alignment
            const roomW = 3 + Math.floor(Math.random() * 2) * 2; // 3 or 5
            const roomH = 3 + Math.floor(Math.random() * 2) * 2; // 3 or 5
            
            // X and Y should be odd to align with potential path cells
            const x = Math.floor(Math.random() * (this.width - roomW - 1) / 2) * 2 + 1;
            const y = Math.floor(Math.random() * (this.height - roomH - 1) / 2) * 2 + 1;

            for (let ry = y; ry < y + roomH; ry++) {
                for (let rx = x; rx < x + roomW; rx++) {
                    if (ry > 0 && ry < this.height - 1 && rx > 0 && rx < this.width - 1) {
                        this.grid[ry][rx] = 0;
                    }
                }
            }
            
            // Connection point (always on an odd/odd cell for the maze to find it)
            const connX = x + (Math.random() < 0.5 ? 0 : roomW - 1);
            const connY = y + (Math.random() < 0.5 ? 0 : roomH - 1);
            this.grid[connY][connX] = 0;
        }
    }

    addNonLinearity(chance) {
        // Find wall cells (even/odd or odd/even) that separate two path cells
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (this.grid[y][x] === 1) {
                    const horiz = this.grid[y][x-1] === 0 && this.grid[y][x+1] === 0;
                    const vert = this.grid[y-1][x] === 0 && this.grid[y+1][x] === 0;
                    
                    if ((horiz || vert) && Math.random() < chance) {
                        this.grid[y][x] = 0;
                    }
                }
            }
        }
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
