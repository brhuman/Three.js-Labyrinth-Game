export class Health {
    constructor(maxHealth = 100) {
        this.maxHealth = maxHealth;
        this.currentHealth = maxHealth;
        this.isInvulnerable = false;
        this.invulnerabilityTime = 0;
    }

    takeDamage(amount) {
        if (this.isInvulnerable) return false;
        
        this.currentHealth = Math.max(0, this.currentHealth - amount);
        return this.currentHealth <= 0;
    }

    heal(amount) {
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    }

    setInvulnerable(duration) {
        this.isInvulnerable = true;
        this.invulnerabilityTime = duration;
    }

    updateInvulnerability(deltaTime) {
        if (this.isInvulnerable) {
            this.invulnerabilityTime -= deltaTime;
            if (this.invulnerabilityTime <= 0) {
                this.isInvulnerable = false;
                this.invulnerabilityTime = 0;
            }
        }
    }

    getHealthPercentage() {
        return this.currentHealth / this.maxHealth;
    }

    isDead() {
        return this.currentHealth <= 0;
    }

    reset() {
        this.currentHealth = this.maxHealth;
        this.isInvulnerable = false;
        this.invulnerabilityTime = 0;
    }

    clone() {
        return new Health(this.maxHealth);
    }
}
