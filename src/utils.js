export function findPathAStar(grid, width, height, startX, startY, endX, endY, isMonster = false) {
    if (startX === endX && startY === endY) return [];

    // Priority Queue implementation (min-heap would be better, but simple sorted array is fine for maze sizes)
    const openSet = [{x: startX, y: startY, g: 0, f: heuristic(startX, startY, endX, endY)}];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(`${startX},${startY}`, 0);

    const key = (x, y) => `${x},${y}`;

    while (openSet.length > 0) {
        // Sort by f score (cheapest estimate first)
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();

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
                        cameFrom.set(key(neighbor.x, neighbor.y), {x: current.x, y: current.y});
                        gScore.set(key(neighbor.x, neighbor.y), tentGScore);
                        const f = tentGScore + heuristic(neighbor.x, neighbor.y, endX, endY);
                        
                        const existingIdx = openSet.findIndex(item => item.x === neighbor.x && item.y === neighbor.y);
                        if (existingIdx === -1) {
                            openSet.push({x: neighbor.x, y: neighbor.y, g: tentGScore, f: f});
                        } else if (f < openSet[existingIdx].f) {
                            openSet[existingIdx].f = f;
                            openSet[existingIdx].g = tentGScore;
                        }
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
