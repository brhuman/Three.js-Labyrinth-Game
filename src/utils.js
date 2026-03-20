class MinHeap {
    constructor() {
        this.heap = [];
    }
    push(val) {
        this.heap.push(val);
        this.bubbleUp(this.heap.length - 1);
    }
    pop() {
        if (this.heap.length === 0) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this.bubbleDown(0);
        }
        return top;
    }
    bubbleUp(i) {
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (this.heap[p].f <= this.heap[i].f) break;
            [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
            i = p;
        }
    }
    bubbleDown(i) {
        const len = this.heap.length;
        while (true) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            let min = i;
            if (left < len && this.heap[left].f < this.heap[min].f) min = left;
            if (right < len && this.heap[right].f < this.heap[min].f) min = right;
            if (min === i) break;
            [this.heap[i], this.heap[min]] = [this.heap[min], this.heap[i]];
            i = min;
        }
    }
    get length() {
        return this.heap.length;
    }
}

export function findPathAStar(grid, width, height, startX, startY, endX, endY, isMonster = false) {
    if (startX === endX && startY === endY) return [];

    const openSet = new MinHeap();
    openSet.push({x: startX, y: startY, f: heuristic(startX, startY, endX, endY)});
    
    // Using simple coordinate strings for Map keys
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(`${startX},${startY}`, 0);

    const key = (x, y) => `${x},${y}`;

    while (openSet.length > 0) {
        const current = openSet.pop();

        if (current.x === endX && current.y === endY) {
            return reconstructPath(cameFrom, current);
        }

        const neighbors = [
            {x: current.x, y: current.y - 1}, {x: current.x + 1, y: current.y},
            {x: current.x, y: current.y + 1}, {x: current.x - 1, y: current.y}
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height) {
                // For monster: allow passing through crouch beams (type 4), for player: block them
                const isBlocked = isMonster ? grid[neighbor.y][neighbor.x] === 1 : grid[neighbor.y][neighbor.x] === 1 || grid[neighbor.y][neighbor.x] === 4;
                
                if (!isBlocked) {
                    const tentGScore = (gScore.get(key(current.x, current.y)) ?? Infinity) + 1;
                    const neighborGScore = gScore.get(key(neighbor.x, neighbor.y)) ?? Infinity;

                    if (tentGScore < neighborGScore) {
                        const currentKey = key(current.x, current.y);
                        cameFrom.set(key(neighbor.x, neighbor.y), {x: current.x, y: current.y});
                        gScore.set(key(neighbor.x, neighbor.y), tentGScore);
                        const f = tentGScore + heuristic(neighbor.x, neighbor.y, endX, endY);
                        
                        // We strictly push to MinHeap. The duplicate states with higher 'f'
                        // will be naturally skipped if their 'f' is higher, or evaluated later
                        // but they won't trigger re-expansions since their tentGscore won't be < gScore.
                        openSet.push({x: neighbor.x, y: neighbor.y, f: f});
                    }
                }
            }
        }
    }

    return []; // No path found
}

function heuristic(x1, y1, x2, y2) {
    // Manhattan distance for grid movement
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function reconstructPath(cameFrom, current) {
    const path = [];
    let curr = current;
    const key = (x, y) => `${x},${y}`;
    
    while (cameFrom.has(key(curr.x, curr.y))) {
        path.push([curr.x, curr.y]);
        curr = cameFrom.get(key(curr.x, curr.y));
    }
    path.reverse();
    return path;
}

export function getAccessibleArea(grid, width, height, startX, startY, blockedSet) {
    const queue = [[startX, startY]];
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    visited[startY][startX] = true;
    
    const dirs = [
        {x: 0, y: -1}, {x: 1, y: 0},
        {x: 0, y: 1}, {x: -1, y: 0}
    ];
    
    const accessible = [];
    
    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        accessible.push([cx, cy]);
        
        // If this spot is blocked (e.g. locked door), we don't explore past it
        if (blockedSet && blockedSet.has(`${cx},${cy}`)) {
            continue;
        }
        
        for (const dir of dirs) {
            const nx = cx + dir.x;
            const ny = cy + dir.y;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (grid[ny][nx] !== 1 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    queue.push([nx, ny]);
                }
            }
        }
    }
    
    return accessible;
}
