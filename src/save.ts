export interface SaveData {
    playerLevel: number;
    playerXp: number;
    maxStageUnlocked: number;
}

const STORAGE_KEY = 'infectious_disease_save_data';

export class SaveManager {
    static load(): SaveData {
        const defaultData: SaveData = {
            playerLevel: 1,
            playerXp: 0,
            maxStageUnlocked: 1
        };

        try {
            const dataStr = localStorage.getItem(STORAGE_KEY);
            if (dataStr) {
                const parsed = JSON.parse(dataStr);
                return { ...defaultData, ...parsed };
            }
        } catch (e) {
            console.error("Failed to load save data", e);
        }

        // Return default new game data
        return defaultData;
    }

    static save(data: SaveData) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save data", e);
        }
    }

    static reset() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // Progression formulas
    static getXpRequiredForNextLevel(level: number): number {
        // Simple exponential curve: 100 * level^1.5
        return Math.floor(100 * Math.pow(level, 1.5));
    }

    static getTitleForLevel(level: number): string {
        if (level >= 80) return "地球防衛総司令 (Earth Defender)";
        if (level >= 70) return "世界保健事務局長 (Director-General)";
        if (level >= 60) return "パンデミック対策最高顧問 (Supreme Advisor)";
        if (level >= 50) return "国際防疫長官 (International Director)";
        if (level >= 40) return "国家対策本部長 (National Chief)";
        if (level >= 30) return "上級疫学マスター (Epidemiology Master)";
        if (level >= 20) return "専門疫学研究員 (Expert Researcher)";
        if (level >= 10) return "シニア感染症医 (Senior Doctor)";
        if (level >= 5) return "若手研究員 (Junior Researcher)";
        return "研修医 (Trainee)";
    }
}
