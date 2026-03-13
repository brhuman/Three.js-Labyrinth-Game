export class Flashlight {
    constructor(initialBattery = 100) {
        this.maxBattery = 100;
        this.currentBattery = initialBattery;
        this.isOn = false;
        this.intensity = 1.0;
        this.batteryDrainRate = 2.0; // Battery units per second
        this.rechargeRate = 5.0; // Battery units per second when recharging
    }

    turnOn() {
        if (this.currentBattery > 0) {
            this.isOn = true;
            return true;
        }
        return false;
    }

    turnOff() {
        this.isOn = false;
    }

    toggle() {
        if (this.isOn) {
            this.turnOff();
        } else {
            return this.turnOn();
        }
        return this.isOn;
    }

    updateBattery(deltaTime) {
        if (this.isOn && this.currentBattery > 0) {
            this.currentBattery = Math.max(0, this.currentBattery - this.batteryDrainRate * deltaTime);
            
            if (this.currentBattery <= 0) {
                this.isOn = false;
                this.intensity = 0;
            } else {
                // Fade intensity as battery gets low
                this.intensity = Math.min(1.0, this.currentBattery / 20);
            }
        }
    }

    recharge(deltaTime) {
        if (!this.isOn) {
            this.currentBattery = Math.min(this.maxBattery, this.currentBattery + this.rechargeRate * deltaTime);
            this.intensity = 1.0;
        }
    }

    addBattery(amount) {
        this.currentBattery = Math.min(this.maxBattery, this.currentBattery + amount);
    }

    getBatteryPercentage() {
        return this.currentBattery / this.maxBattery;
    }

    isEmpty() {
        return this.currentBattery <= 0;
    }

    reset() {
        this.currentBattery = this.maxBattery;
        this.isOn = false;
        this.intensity = 1.0;
    }

    clone() {
        return new Flashlight(this.currentBattery);
    }
}
