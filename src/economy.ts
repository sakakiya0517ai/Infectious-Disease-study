export class EconomyManager {
    budget: number; // In millions
    debt: number; // In millions
    interestRate: number = 0.05; // 5% per cycle

    // Funding cycle
    daysUntilNextFunding: number = 180; // 6 months
    baseIntervalIncome: number = 1000;
    regularFundingAmount: number = 1000; // $1 Billion
    hasTakenEmergencyFund: boolean = false;
    consecutiveDebtFailures: number = 0; // Phase 6: Game Over condition

    onFinanceEvent: ((news: string, type: 'finance') => void) | null = null;
    onGameOver: ((reason: string) => void) | null = null;

    constructor() {
        this.budget = 2000; // Start with $2B
        this.debt = 0;
    }

    update(dt: number) {
        this.daysUntilNextFunding -= dt;

        if (this.daysUntilNextFunding <= 0) {
            this.grantRegularFunding();
            this.daysUntilNextFunding = 180;
        }
    }

    grantRegularFunding() {
        let grant = this.baseIntervalIncome;

        // Penalize if emergency funds were taken
        if (this.hasTakenEmergencyFund) {
            grant = Math.floor(grant / 2);
            this.hasTakenEmergencyFund = false; // Reset for next cycle
            this.log(`⚠️ ペナルティ適用: 前期の緊急予算要請により、今期の予算支給額が半減しました。`);
        }

        // Phase 6: Check debt failure (Can't pay interest/principal + budget is critically low)
        let isDebtCrisis = false;

        // Pay debt automatically
        if (this.debt > 0) {
            const repayment = Math.min(this.debt, grant * 0.5); // Max 50% of grant goes to debt
            this.debt -= repayment;
            grant -= repayment;
            this.log(`💸 自動天引き: 負債返済のため $${repayment}M が引き落とされました。(残債: $${Math.floor(this.debt)}M)`);

            // If debt is still higher than half our incoming grant, we are struggling
            if (this.debt > (this.baseIntervalIncome * 0.5) && grant < 100 && this.budget < 100) {
                isDebtCrisis = true;
            }
        }

        this.budget += grant;
        this.log(`💰 定期予算支給: $${grant}M が追加されました。`);

        if (isDebtCrisis) {
            this.consecutiveDebtFailures++;
            if (this.consecutiveDebtFailures >= 3) {
                if (this.onGameOver) this.onGameOver("経済破綻（GAME OVER）: 膨大な債務により国家機能が完全に停止しました。");
            } else {
                this.log(`🚨 【警告】 深刻な債務不履行リスク: このままでは経済が破綻します！ (${this.consecutiveDebtFailures}/3回)`);
            }
        } else {
            this.consecutiveDebtFailures = 0; // Reset if we successfully recover
        }

        // Apply interest to remaining debt
        if (this.debt > 0) {
            this.debt += this.debt * this.interestRate;
        }
    }

    requestEmergencyFund() {
        if (this.hasTakenEmergencyFund) {
            this.log(`❌ 緊急予算は各期間で1回しか要請できません。`);
            return false;
        }
        this.hasTakenEmergencyFund = true;
        this.budget += 500;
        this.log(`🚨 緊急予算 $500M を調達しました。次回の定期予算は半分になります。`);
        return true;
    }

    takeLoan() {
        this.debt += 1000;
        this.budget += 1000;
        this.log(`🏦 国際機関から $1000M の借入を行いました。`);
        return true;
    }

    spend(amount: number) {
        if (this.budget >= amount) {
            this.budget -= amount;
            return true;
        }
        this.log(`❌ 予算が不足しています。(必要額: $${amount}M / 現在額: $${Math.floor(this.budget)}M)`);
        return false;
    }

    grantEarlyResolutionReward(days: number) {
        // Reward inversely proportional to days taken. E.g. 30 days = $2000M, 90 days = $1000M
        if (days > 180) return; // Too late, no reward

        const reward = Math.floor(Math.max(0, 2000 - (days * 10)));
        if (reward > 0) {
            this.budget += reward;
            this.log(`🏆 早期鎮圧報酬: 迅速な対応が評価され、特別報奨金 $${reward}M が授与されました！`);
        }
    }

    private log(msg: string) {
        if (this.onFinanceEvent) {
            this.onFinanceEvent(msg, 'finance');
        }
    }
}
