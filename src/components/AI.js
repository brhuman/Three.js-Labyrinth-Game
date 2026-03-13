export class AI {
    constructor(options = {}) {
        this.state = options.state || 'idle';
        this.target = null;
        this.lastKnownPosition = null;
        
        // Movement speeds
        this.patrolSpeed = options.patrolSpeed || 1.0;
        this.chaseSpeed = options.chaseSpeed || 2.0;
        this.searchSpeed = options.searchSpeed || 1.5;
        
        // Detection and combat
        this.detectionRange = options.detectionRange || 15;
        this.attackRange = options.attackRange || 2;
        this.attackDamage = options.attackDamage || 10;
        this.attackCooldown = options.attackCooldown || 1000; // ms
        this.lastAttackTime = 0;
        
        // Patrol behavior
        this.patrolPoints = options.patrolPoints || [];
        this.currentPatrolIndex = 0;
        
        // Search behavior
        this.searchTimer = 0;
        this.searchDuration = options.searchDuration || 5.0;
        
        // Behavior flags
        this.canPatrol = options.canPatrol !== false;
        this.canChase = options.canChase !== false;
        this.canAttack = options.canAttack !== false;
        this.canSearch = options.canSearch !== false;
        
        // Reaction times
        this.reactionTime = options.reactionTime || 0.5;
        this.lastReactionTime = 0;
    }

    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            return true; // State changed
        }
        return false; // State unchanged
    }

    setTarget(target) {
        this.target = target;
        this.lastKnownPosition = target ? target.clone() : null;
    }

    setPatrolPoints(points) {
        this.patrolPoints = points;
        this.currentPatrolIndex = 0;
    }

    addPatrolPoint(point) {
        this.patrolPoints.push(point);
    }

    canPerformAction(action) {
        switch (action) {
            case 'patrol':
                return this.canPatrol && this.patrolPoints.length > 0;
            case 'chase':
                return this.canChase && this.target !== null;
            case 'attack':
                return this.canAttack && this.target !== null;
            case 'search':
                return this.canSearch;
            default:
                return false;
        }
    }

    isInCombat() {
        return this.state === 'chase' || this.state === 'attack';
    }

    isPassive() {
        return this.state === 'idle' || this.state === 'patrol';
    }

    shouldDetectPlayer(playerPosition, aiPosition) {
        if (!playerPosition || !aiPosition) return false;
        
        const distance = playerPosition.distanceTo(aiPosition);
        return distance <= this.detectionRange;
    }

    shouldAttack(playerPosition, aiPosition) {
        if (!playerPosition || !aiPosition) return false;
        
        const distance = playerPosition.distanceTo(aiPosition);
        return distance <= this.attackRange;
    }

    canAttackNow(currentTime) {
        return currentTime - this.lastAttackTime >= this.attackCooldown;
    }

    performAttack(currentTime) {
        this.lastAttackTime = currentTime;
    }

    updateSearchTimer(deltaTime) {
        if (this.state === 'search') {
            this.searchTimer -= deltaTime;
            return this.searchTimer <= 0;
        }
        return false;
    }

    resetSearch() {
        this.searchTimer = this.searchDuration;
        this.target = null;
    }

    clone() {
        return new AI({
            state: this.state,
            patrolSpeed: this.patrolSpeed,
            chaseSpeed: this.chaseSpeed,
            searchSpeed: this.searchSpeed,
            detectionRange: this.detectionRange,
            attackRange: this.attackRange,
            attackDamage: this.attackDamage,
            attackCooldown: this.attackCooldown,
            patrolPoints: [...this.patrolPoints],
            canPatrol: this.canPatrol,
            canChase: this.canChase,
            canAttack: this.canAttack,
            canSearch: this.canSearch,
            reactionTime: this.reactionTime,
            searchDuration: this.searchDuration
        });
    }
}
