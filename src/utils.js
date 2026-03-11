export function findPathBFS(grid, width, height, startX, startY, endX, endY) {
    if (startX === endX && startY === endY) return [];
    
    const queue = [[startX, startY]];
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const parent = Array(height).fill().map(() => Array(width).fill(null));
    
    visited[startY][startX] = true;
    
    const dirs = [
        {x: 0, y: -1}, {x: 1, y: 0},
        {x: 0, y: 1}, {x: -1, y: 0}
    ];
    
    let found = false;
    
    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        
        if (cx === endX && cy === endY) {
            found = true;
            break;
        }
        
        for (const dir of dirs) {
            const nx = cx + dir.x;
            const ny = cy + dir.y;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                // grid[ny][nx] !== 1 (wall)
                if (grid[ny][nx] !== 1 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    parent[ny][nx] = [cx, cy];
                    queue.push([nx, ny]);
                }
            }
        }
    }
    
    if (!found) return [];
    
    const path = [];
    let curr = [endX, endY];
    while (curr !== null && (curr[0] !== startX || curr[1] !== startY)) {
        path.push(curr);
        curr = parent[curr[1]][curr[0]];
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
