import { type Simulation } from './simulation';
import { type EconomyManager } from './economy';

export class ActionManager {
    sim: Simulation;
    eco: EconomyManager;

    globalLockdownActive: boolean = false;
    vaccineResearchLevel: number = 0;
    bordersClosed: boolean = false;
    masksMandatory: boolean = false;
    socialDistancingActive: boolean = false;

    // Compliance represents how willing the population is to follow rules (0 to 1)
    globalCompliance: number = 1.0;

    onNewsEvent: ((news: string, type?: 'alert' | 'system' | 'normal') => void) | null = null;

    constructor(sim: Simulation, eco: EconomyManager) {
        this.sim = sim;
        this.eco = eco;

        this.sim.onSystemEvent = (eventName: string, description: string) => {
            this.handleSystemEvent(eventName, description);
        };
    }

    handleSystemEvent(eventName: string, description: string) {
        this.log(description, 'system');
        switch (eventName) {
            case "STOCK_CRASH":
                this.eco.budget = Math.max(0, this.eco.budget - 500);
                break;
            case "PROTESTS":
                this.globalCompliance = Math.max(0, this.globalCompliance - 0.2);
                break;
            case "WHO_GRANT":
                this.eco.budget += 300;
                if (this.vaccineResearchLevel > 0 && this.vaccineResearchLevel < 5) {
                    this.sim.vaccineProgress += 5.0; // Flat boost
                }
                break;
        }
    }

    // New dynamic helper to apply a measure to a specific scope
    private applyMeasure(
        measureName: 'masks' | 'distancing' | 'lockdown' | 'borders',
        scope: 'global' | 'region' | 'country',
        targetId: string,
        baseCost: number,
        logMessage: string,
        complianceHit: number = 0
    ): boolean {
        let targets = Array.from(this.sim.countries.values());
        let costMultiplier = 1.0;
        let scopeName = "全世界";

        if (scope === 'country') {
            targets = targets.filter(c => c.id === targetId);
            costMultiplier = 0.05; // 5% cost for a single country
            scopeName = targets[0]?.name || "指定国";
        } else if (scope === 'region') {
            targets = targets.filter(c => c.region === targetId);
            costMultiplier = 0.3; // 30% cost for a region
            scopeName = targetId;
        }

        if (targets.length === 0) return false;

        // Filter to countries that don't already have this measure active
        const applicableTargets = targets.filter(c => !c.measures[measureName]);
        if (applicableTargets.length === 0) {
            this.log(`⚠️ ${scopeName}では、すでにその対策が実施されています。`, 'system');
            return false;
        }

        const finalCost = Math.max(1, Math.floor(baseCost * costMultiplier));
        if (!this.eco.spend(finalCost)) return false;

        if (complianceHit > 0) {
            // Further scale compliance hit down for local measures so it doesn't wreck the global economy instantly
            const actualHit = complianceHit * (applicableTargets.length / this.sim.countries.size);
            this.globalCompliance -= actualHit;
        }

        // Apply it
        applicableTargets.forEach(c => {
            c.measures[measureName] = true;
        });

        this.log(`[${scopeName}] ${logMessage} (コスト: $${finalCost}M)`);
        this.checkComplianceDrop();
        return true;
    }

    enforceMasks(scope: 'global' | 'region' | 'country' = 'global', targetId: string = '') {
        return this.applyMeasure('masks', scope, targetId, 50, "😷 マスク着用義務化を実施しました。");
    }

    enforceSocialDistancing(scope: 'global' | 'region' | 'country' = 'global', targetId: string = '') {
        return this.applyMeasure('distancing', scope, targetId, 100, "↔️ ソーシャルディスタンスを徹底しました。", 0.1);
    }

    enforceLockdown(scope: 'global' | 'region' | 'country' = 'global', targetId: string = '') {
        // Check global compliance for lockdowns specifically
        if (Math.random() > this.globalCompliance) {
            this.log("🔥 暴動発生: 市民の反発が強く、ロックダウンの実施に失敗しました！", "alert");
            if (!this.eco.spend(10)) return false; // Penalty cost
            return false;
        }
        return this.applyMeasure('lockdown', scope, targetId, 500, "⚠️ 強制ロックダウン実施: 経済活動を停止します。", 0.3);
    }

    closeBorders(scope: 'global' | 'region' | 'country' = 'global', targetId: string = '') {
        return this.applyMeasure('borders', scope, targetId, 200, "🛑 国境封鎖/移動制限を実施しました。", 0.1);
    }

    fundVaccineResearch() {
        if (this.vaccineResearchLevel >= 5) return false;
        if (!this.eco.spend(300)) return false;

        this.vaccineResearchLevel++;
        this.sim.vaccineFundingLevel = this.vaccineResearchLevel;
        this.sim.recoveryRate += 0.025;
        this.sim.deathRate *= 0.7;
        this.log(`💉 ワクチン開発プロジェクトへ投資 [$300M] (Lv ${this.vaccineResearchLevel}/5): 開発スピードと回復率が向上。`);
        return true;
    }

    checkComplianceDrop() {
        if (this.globalCompliance < 0.5) {
            this.log("⚠️ 警告: 市民の不満が高まっています。これ以上の厳しい制限は反発を招く恐れがあります。", "alert");
        }
    }

    // Auto-deactivation logic
    update(_dt: number) {
        if (this.sim.day < 10) return;

        let releasedCount = 0;

        // Evaluate each country individually. If its internal case load is super low, citizens relax rules
        Array.from(this.sim.countries.values()).forEach(c => {
            if (c.infected < 10 && this.sim.outbreakTimer > 2) {
                let changed = false;
                if (c.measures.masks) { c.measures.masks = false; changed = true; }
                if (c.measures.distancing) { c.measures.distancing = false; changed = true; }
                if (c.measures.lockdown) { c.measures.lockdown = false; changed = true; }
                if (c.measures.borders) { c.measures.borders = false; changed = true; }

                if (changed) {
                    releasedCount++;
                }
            }
        });

        if (releasedCount > 0) {
            this.log(`❇️ 感染の沈静化により、${releasedCount}カ国・地域で制限措置が自動的に解除されました！`, "system");
            // Citizens are happy restrictions dropped
            this.globalCompliance = Math.min(1.0, this.globalCompliance + 0.1);

            // Re-sync UI manually by calling listeners if needed (handled in main.ts usually)
            // Or we just let player observe map
        }
    }

    private log(message: string, type: 'alert' | 'system' | 'normal' = 'normal') {
        if (this.onNewsEvent) {
            this.onNewsEvent(message, type);
        }
    }
}
