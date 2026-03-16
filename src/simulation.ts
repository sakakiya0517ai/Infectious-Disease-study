import countriesData from '../public/data/countries.json';

export interface CountryData {
  id: string; // ISO 2-letter code (cca2)
  cca3: string; // ISO 3-letter code
  name: string;
  population: number;
  susceptible: number;
  infected: number;
  recovered: number;
  dead: number;
  borders: string[]; // List of cca3 neighbor codes
  neighbors: CountryData[]; // Resolved references
  color?: string; // Cache color for the map
  region: string;
  subregion: string;
  measures: {
    masks: boolean;
    distancing: boolean;
    lockdown: boolean;
    borders: boolean;
  };
}

export class Simulation {
  countries: Map<string, CountryData> = new Map();
  day: number = 0;
  isRunning: boolean = false;

  // Progression Mechanics
  stage: number = 1;

  // Initial Quiet Period
  initialQuietTimer: number = 0;
  pendingOriginCountryId: string | null = null;
  pendingDiseaseName: string = "";

  // SIR Parameters
  transmissionRate: number = 0.12; // beta: significantly slowed down for realism
  recoveryRate: number = 0.04; // gamma: how fast people recover
  deathRate: number = 0.01; // portion of infected who die per day
  mobilityRate: number = 0.01; // Base chance multiplier for air/sea travel (reduced)

  outbreakTimer: number = 30; // Days until next periodic outbreak
  eventTimer: number = 60; // Days until next random event
  onNewOutbreak: ((countryName: string, scale: string, countryId: string) => void) | null = null;
  onInfectionJump: ((sourceId: string, targetId: string) => void) | null = null;
  onSystemEvent: ((eventName: string, description: string) => void) | null = null;

  globalPopulation: number = 0;
  globalInfected: number = 0;
  globalDead: number = 0;

  currentDiseaseName: string = "ウイルス未検出";
  isApocalyptic: boolean = false;

  // Game Clear Mechanics
  vaccineProgress: number = 0; // 0 to 100
  vaccineFundingLevel: number = 0;
  onGameClear: ((reason: string) => void) | null = null;
  gameCleared: boolean = false;
  originCountryId: string | null = null;

  constructor() { }

  async loadData() {
    try {
      const data: any[] = countriesData;

      const cca3Map = new Map<string, CountryData>();

      data.forEach((c: any) => {
        const id = c.cca2;
        const pop = Math.max(c.population || 0, 1000); // Minimum population 1000 for small islands
        const jpName = c.translations && c.translations.jpn ? c.translations.jpn.common : c.name.common;

        const country: CountryData = {
          id: id,
          cca3: c.cca3,
          name: jpName,
          population: pop,
          susceptible: pop,
          infected: 0,
          recovered: 0,
          dead: 0,
          borders: c.borders || [],
          neighbors: [],
          region: c.region || "Unknown",
          subregion: c.subregion || "Unknown",
          measures: {
            masks: false,
            distancing: false,
            lockdown: false,
            borders: false
          }
        };

        this.countries.set(id, country);
        cca3Map.set(c.cca3, country);
        this.globalPopulation += pop;
      });

      // Resolve neighbor references for radial spreading
      this.countries.forEach(c => {
        c.borders.forEach(borderCca3 => {
          const neighbor = cca3Map.get(borderCca3);
          if (neighbor) c.neighbors.push(neighbor);
        });
      });

      console.log(`Loaded ${this.countries.size} countries`);
    } catch (error) {
      console.error("Failed to load country population data:", error);
    }
  }

  startSimulation(startCountryId?: string, isHistorical: boolean = false, currentStage: number = 1) {
    if (this.countries.size === 0) return;

    this.applyStageScaling(currentStage);

    if (isHistorical) {
      this.transmissionRate = 0.18; // COVID-19 aggressive spread but realistic
      this.recoveryRate = 0.04;
      this.deathRate = 0.015;
      startCountryId = "CN"; // Origin: China
      this.pendingDiseaseName = "SARS-CoV-2 (新型コロナウイルス)";
      this.isApocalyptic = false;
    } else {
      if (!startCountryId) {
        const keys = Array.from(this.countries.keys());
        startCountryId = keys[Math.floor(Math.random() * keys.length)];
      }

      // 10% chance for an apocalyptic strain
      this.isApocalyptic = Math.random() < 0.1;

      // Generate a random pathogen name
      const randomId = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

      if (this.isApocalyptic) {
        this.pendingDiseaseName = `💥 終末変異株 (Strain-X${randomId})`;
        this.transmissionRate = 0.25; // 2x faster baseline
        this.deathRate = 0.15; // 15x deadlier baseline
        this.recoveryRate = 0.02; // Harder to recover
      } else {
        this.pendingDiseaseName = `未知の病原体 (Pathogen-${randomId})`;
        this.transmissionRate = 0.12;
        this.deathRate = 0.01;
      }
    }

    this.currentDiseaseName = "平時・ウイルス未確認";

    // Infect Patient Zero(s) - Delayed by 5 days
    this.pendingOriginCountryId = startCountryId || null;
    this.initialQuietTimer = 5;

    this.isRunning = true;
    this.day = 1;
    this.outbreakTimer = 30 + this.initialQuietTimer + Math.random() * 30; // Next outbreak delayed
  }

  // Phase 5: Re-calculate settings based on stage (1-10 scale for 50-min class)
  applyStageScaling(stage: number) {
    this.stage = Math.max(1, Math.min(10, stage));

    if (this.isApocalyptic) {
      // Very fast at stage 10
      this.transmissionRate = 0.35 + (this.stage * 0.03);
      this.deathRate = 0.15 + (this.stage * 0.01);
    } else {
      // Scales up transmission so it does not die down without measures
      this.transmissionRate = 0.20 + (this.stage * 0.035);
      this.deathRate = 0.01 + (this.stage * 0.003);
    }
  }

  // Delta time in days
  update(dt: number) {
    if (!this.isRunning || this.gameCleared) return;

    // Handle initial quiet period
    if (this.initialQuietTimer > 0) {
      this.initialQuietTimer -= dt;
      if (this.initialQuietTimer <= 0) {
        // Quiet period over, infect Patient Zero
        this.originCountryId = this.pendingOriginCountryId;
        this.currentDiseaseName = this.pendingDiseaseName;
        if (this.originCountryId) {
          const country = this.countries.get(this.originCountryId);
          if (country && country.population > 0) {
            country.infected = 500; // Start with initial cluster
            country.susceptible -= 500;
            this.globalInfected = 500;
            console.log(`${country.name}で最初の感染爆発が確認されました。`);
            if (this.onNewOutbreak) {
              this.onNewOutbreak(country.name, '最初の', country.id);
            }
          }
        }
      }
    }

    // Advance Vaccine Progress (Target: ~3-4 mins to win if well funded)
    if (this.vaccineFundingLevel > 0) {
      // Accelerated for 50-minute teaching session constraints
      // level 1 = 1.0% per day, level 5 = 5.0% per day
      this.vaccineProgress += (this.vaccineFundingLevel * 1.0) * dt;
      if (this.vaccineProgress >= 100) {
        this.vaccineProgress = 100;
        this.gameCleared = true;
        if (this.onGameClear) this.onGameClear("ワクチンが完成しました！");
      }
    }

    let dailyNewCases = 0;
    let dailyRecoveries = 0;
    let dailyDeaths = 0;

    const countryList = Array.from(this.countries.values());

    countryList.forEach(c => {
      // SIR Model Calculation
      const S = c.susceptible;
      const I = c.infected;
      const N = c.population;

      // Calculate local multipliers based on country-specific measures
      let localTransmissionRate = this.transmissionRate;
      let localMobilityRate = this.mobilityRate;

      if (c.measures.masks) localTransmissionRate *= 0.85;
      if (c.measures.distancing) localTransmissionRate *= 0.7;
      if (c.measures.lockdown) {
        localTransmissionRate *= 0.4;
        localMobilityRate *= 0.1; // Lockdown implicitly closes borders mostly
      }
      if (c.measures.borders) localMobilityRate *= 0.1;

      if (c.infected >= 1) {
        const newInfections = (localTransmissionRate * I * S / N) * dt;
        // Healthcare Collapse mechanic: if active infections > 10% of pop, deathRate spikes 5x
        let effectiveDeathRate = this.deathRate;
        if (I > N * 0.1) {
          effectiveDeathRate *= 5.0;
        }

        const recoveries = (this.recoveryRate * I) * dt;
        const deaths = (effectiveDeathRate * I) * dt;

        const actualInfections = Math.min(newInfections, S);
        const resolving = Math.min(recoveries + deaths, I);

        const ratioRec = this.recoveryRate / (this.recoveryRate + effectiveDeathRate);
        const actualRecoveries = resolving * ratioRec;
        const actualDeaths = resolving * (1 - ratioRec);

        c.susceptible -= actualInfections;
        c.infected += (actualInfections - resolving);
        c.recovered += actualRecoveries;
        c.dead += actualDeaths;

        // Lower the actual living population due to deaths
        c.population -= actualDeaths;
        this.globalPopulation -= actualDeaths;

        dailyNewCases += actualInfections;
        dailyRecoveries += actualRecoveries;
        dailyDeaths += actualDeaths;

        // Phase 2 Advanced Spread Mechanics
        if (c.infected > 100) {
          const infectionDensity = c.infected / c.population;

          // 1. Radial Spread (Land borders) - scales with infection density
          const radialChance = (localTransmissionRate * infectionDensity * 300) * dt;
          if (Math.random() < radialChance) {
            const susceptibleNeighbors = c.neighbors.filter(n => n.infected === 0 && n.susceptible > 0);
            if (susceptibleNeighbors.length > 0) {
              const target = susceptibleNeighbors[Math.floor(Math.random() * susceptibleNeighbors.length)];
              const jumpAmount = Math.min(100, target.susceptible); // Initial cluster
              target.infected += jumpAmount;
              target.susceptible -= jumpAmount;
              this.globalInfected += jumpAmount;
              if (this.onInfectionJump) this.onInfectionJump(c.id, target.id);
            }
          }

          // 2. Hub Spread (Air/Sea Logistics) - scales with total infected but has a guaranteed minimum if unmitigated
          // Base hub chance formula. To ensure 100% spread, we add a flat baseline chance for any globally infected country
          const baseSpreadChance = localMobilityRate > 0.005 ? 0.02 : 0; // If borders are NOT closed completely, guarantee slight spread
          const hubChance = (localMobilityRate * (c.infected / 20000) + baseSpreadChance) * dt;
          if (Math.random() < Math.min(0.8 * dt, hubChance)) { // Cap max chance
            // Weighted random pick (favor high pop hubs)
            let target = countryList[Math.floor(Math.random() * countryList.length)];
            for (let i = 0; i < 3; i++) {
              const candidate = countryList[Math.floor(Math.random() * countryList.length)];
              if (candidate.population > target.population) target = candidate;
            }

            if (target.susceptible > 0 && target.infected === 0 && target.id !== c.id) {
              const jumpAmount = Math.min(100, target.susceptible);
              target.infected += jumpAmount;
              target.susceptible -= jumpAmount;
              this.globalInfected += jumpAmount;
              if (this.onInfectionJump) this.onInfectionJump(c.id, target.id);
            }
          }
        }
      }
    });

    // 3. Multi-wave Variants
    // Every ~90 days, chance for a mutated variant locally
    if (Math.floor(this.day) % 90 === 0 && Math.random() < 0.3 * dt) {
      const hotspots = countryList.filter(c => c.recovered > 10000);
      if (hotspots.length > 0) {
        const mutated = hotspots[Math.floor(Math.random() * hotspots.length)];
        // 20% of recovered lose immunity
        const waningImmunity = mutated.recovered * 0.2;
        mutated.recovered -= waningImmunity;
        mutated.susceptible += waningImmunity;
        // new seed
        const newSeed = Math.min(500, mutated.susceptible);
        mutated.infected += newSeed;
        mutated.susceptible -= newSeed;
        this.globalInfected += newSeed;

        this.originCountryId = mutated.id;
        if (this.onNewOutbreak) {
          this.onNewOutbreak(mutated.name, '変異株の', mutated.id);
        }
      }
    }

    // 4. Periodic Random Outbreaks
    this.outbreakTimer -= dt;
    if (this.outbreakTimer <= 0) {
      const scaleStr = Math.random();
      let infectedAmount = 0;
      let scaleLabel = '';

      if (scaleStr < 0.5) {
        infectedAmount = 50 + Math.random() * 200; // Small
        scaleLabel = '小規模';
      } else if (scaleStr < 0.8) {
        infectedAmount = 500 + Math.random() * 2000; // Medium
        scaleLabel = '中規模';
      } else if (scaleStr < 0.95) {
        infectedAmount = 5000 + Math.random() * 20000; // Large
        scaleLabel = '大規模';
      } else {
        infectedAmount = 50000 + Math.random() * 100000; // Massive
        scaleLabel = '超大規模';
      }

      const validCountries = countryList.filter(c => c.susceptible > infectedAmount * 2);
      if (validCountries.length > 0) {
        const target = validCountries[Math.floor(Math.random() * validCountries.length)];
        target.infected += infectedAmount;
        target.susceptible -= infectedAmount;
        this.globalInfected += infectedAmount;

        this.originCountryId = target.id;
        if (this.onNewOutbreak) {
          this.onNewOutbreak(target.name, scaleLabel, target.id);
        }

        if (!this.currentDiseaseName.includes("複数") && !this.isApocalyptic) {
          this.currentDiseaseName += " ほか複数株";
        }
      }

      // Reset timer to 40-80 days depending on random chance
      this.outbreakTimer = 40 + Math.random() * 40;
    }

    // 5. Non-Virus Narrative Random Events
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.triggerRandomEvent();
      this.eventTimer = 60 + Math.random() * 60; // Every 60-120 days
    }

    this.globalInfected += (dailyNewCases - dailyRecoveries - dailyDeaths);
    this.globalDead += dailyDeaths;

    // Extinction victory check (Loss for players technically, but simulation over)
    if (this.globalPopulation > 0 && this.globalDead >= this.globalPopulation - 100) {
      this.gameCleared = true;
      if (this.onGameClear) this.onGameClear("人類滅亡（GAME OVER）");
    }

    // Check for eradication victory
    if (this.day > 30 && this.globalInfected < 1) {
      this.gameCleared = true;
      if (this.onGameClear) this.onGameClear("世界からウイルスが根絶されました！");
    }

    this.day += dt;
  }

  triggerRandomEvent() {
    if (!this.onSystemEvent) return;

    const r = Math.random();
    if (r < 0.33) {
      this.onSystemEvent("STOCK_CRASH", "📉 【経済危機】世界的株価大暴落が発生し、国家予算が減少しました！");
    } else if (r < 0.66) {
      this.onSystemEvent("PROTESTS", "🔥 【市民暴動】長引くパンデミックに疲れ果てた市民が暴動を起こし、コンプライアンスが低下しました！");
    } else {
      this.onSystemEvent("WHO_GRANT", "💰 【WHO支援】WHOから緊急の資金援助と医療技術の提供を受けました！");
    }
  }
}
