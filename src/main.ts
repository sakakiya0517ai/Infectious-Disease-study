import './style.css';
import { Simulation, type CountryData } from './simulation';
import { MapRenderer } from './map';
import { ActionManager } from './actions';
import { EconomyManager } from './economy';
import { NewsManager } from './news';
import { SaveManager, type SaveData } from './save';

const sim = new Simulation();
const eco = new EconomyManager();
let mapRenderer: MapRenderer;
const actionManager = new ActionManager(sim, eco);
const news = new NewsManager('news-chat');

// Load Save Data
let saveData: SaveData = SaveManager.load();

// UI Elements
const globalPopEl = document.getElementById('global-population');
const globalInfEl = document.getElementById('global-infected');
const globalDeadEl = document.getElementById('global-dead');
const globalBudgetEl = document.getElementById('global-budget');
const globalDebtEl = document.getElementById('global-debt');
const globalVaccineEl = document.getElementById('global-vaccine');
const simDayEl = document.getElementById('sim-day');
const diseaseNameEl = document.getElementById('disease-name');
const regionInfoEl = document.getElementById('region-info');

// Title Overlay
const titleOverlay = document.getElementById('title-overlay');
const titlePlayerRank = document.getElementById('title-player-rank');
const titlePlayerXp = document.getElementById('title-player-xp');
const btnNewGame = document.getElementById('btn-new-game');
const btnDeleteData = document.getElementById('btn-delete-data');

// Win Overlay
const winOverlay = document.getElementById('win-overlay');
const winMessage = document.getElementById('win-message');
const winXpDisplay = document.getElementById('win-xp-display');
const btnRestart = document.getElementById('btn-restart');

// Finance Buttons
const btnEmergencyFund = document.getElementById('btn-emergency-fund');
const btnTakeLoan = document.getElementById('btn-take-loan');

// Measure Buttons
const btnMasks = document.getElementById('btn-masks');
const btnDistance = document.getElementById('btn-distance');
const btnLockdown = document.getElementById('btn-lockdown');
const btnVaccine = document.getElementById('btn-vaccine');
const btnBorders = document.getElementById('btn-borders');

// Format numbers nicely
const formatNum = (num: number) => new Intl.NumberFormat().format(Math.floor(num));

function wrapActionBtn(btn: HTMLElement | null, action: () => boolean) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    action();
    // Button state disabling is now completely handled dynamically in the UI loop
  });
}

// Wrapper to pass day to news
function logGameNews(msg: string, type: 'system' | 'alert' | 'finance' | 'normal' = 'normal') {
  news.log(msg, type, sim.day);
}

// Map animation queue to prevent too many lines at once
let unhandledRouteDraws = 0;

async function init() {
  logGameNews("シミュレーションエンジン起動中...", "system");

  // Load data first
  await sim.loadData();
  logGameNews(`${sim.countries.size}ヶ国のデータを読み込みました。`, "system");

  // Initialize map
  mapRenderer = new MapRenderer('map', sim);

  // Link event loggers
  actionManager.onNewsEvent = logGameNews;
  eco.onFinanceEvent = logGameNews;
  eco.onGameOver = (reason: string) => {
    sim.gameCleared = true;
    if (sim.onGameClear) sim.onGameClear(reason);
  };

  sim.onNewOutbreak = (countryName: string, scaleLabel: string, countryId: string) => {
    logGameNews(`⚠️ 【新たな脅威】 ${countryName} で ${scaleLabel} の新たな感染爆発（アウトブレイク）が確認されました！`, "alert");
    if (mapRenderer && countryId) {
      sim.originCountryId = countryId;
      mapRenderer.setOrigin(countryId);
    }
  };

  sim.onInfectionJump = (sourceId: string, targetId: string) => {
    // Throttle line drawing to prevent massive SVG DOM lag during late game
    if (unhandledRouteDraws < 5 && Math.random() < 0.3) {
      unhandledRouteDraws++;
      setTimeout(() => {
        mapRenderer.drawInfectionRoute(sourceId, targetId);
        unhandledRouteDraws--;
      }, 0);
    }
  };

  sim.onGameClear = (reason: string) => {
    logGameNews(`🎉 【パンデミック終息】 ${reason}`, "alert");

    // Progression Math calculation
    const isWin = reason.includes("完成") || reason.includes("根絶");
    let xpGained = isWin ? 500 : 100; // 500 for win, 100 for trying
    saveData.playerXp += xpGained;

    // Level up check
    let leveledUp = false;
    let requiredXp = SaveManager.getXpRequiredForNextLevel(saveData.playerLevel);
    while (saveData.playerXp >= requiredXp) {
      saveData.playerXp -= requiredXp;
      saveData.playerLevel++;
      leveledUp = true;
      requiredXp = SaveManager.getXpRequiredForNextLevel(saveData.playerLevel);
    }

    if (isWin) {
      saveData.maxStageUnlocked = Math.min(10, Math.max(saveData.maxStageUnlocked, sim.stage + 1));
    }

    // Save progress
    SaveManager.save(saveData);

    const titleStr = SaveManager.getTitleForLevel(saveData.playerLevel);

    if (winOverlay) winOverlay.classList.remove('hidden');
    if (winMessage) winMessage.innerText = reason;
    if (winXpDisplay) {
      let xpMsg = `+${xpGained} XP獲得!`;
      if (leveledUp) xpMsg += ` (レベルアップ! ${titleStr} に昇格)`;
      winXpDisplay.innerText = xpMsg;
    }
  };

  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Setup Finance Actions
  wrapActionBtn(btnEmergencyFund, () => eco.requestEmergencyFund());
  wrapActionBtn(btnTakeLoan, () => eco.takeLoan());

  // Setup Target UI Elements
  const actionScopeSelect = document.getElementById('action-scope') as HTMLSelectElement;
  const targetRegionSelect = document.getElementById('target-region') as HTMLSelectElement;
  const targetCountrySelect = document.getElementById('target-country') as HTMLSelectElement;
  const targetRegionContainer = document.getElementById('target-region-container');
  const targetCountryContainer = document.getElementById('target-country-container');

  actionScopeSelect?.addEventListener('change', () => {
    const val = actionScopeSelect.value;
    if (targetRegionContainer) targetRegionContainer.style.display = val === 'region' ? 'block' : 'none';
    if (targetCountryContainer) targetCountryContainer.style.display = val === 'country' ? 'block' : 'none';
  });

  // Populate dropdowns once data is loaded (sim.countries)
  const regions = new Set<string>();
  const countriesByRegion = new Map<string, { id: string, name: string }[]>();
  sim.countries.forEach(c => {
    regions.add(c.region);
    let list = countriesByRegion.get(c.region) || [];
    list.push({ id: c.id, name: c.name });
    countriesByRegion.set(c.region, list);
  });

  // Sort and append Regions
  Array.from(regions).sort().forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.innerText = r;
    targetRegionSelect?.appendChild(opt);
  });

  // Sort and append Countries
  Array.from(sim.countries.values()).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.name;
    targetCountrySelect?.appendChild(opt);
  });

  const getTargetArgs = (): ['global' | 'region' | 'country', string] => {
    const scope = (actionScopeSelect?.value || 'global') as 'global' | 'region' | 'country';
    let target = '';
    if (scope === 'region') target = targetRegionSelect?.value || '';
    if (scope === 'country') target = targetCountrySelect?.value || '';
    return [scope, target];
  };

  // Setup Measure Actions with Scopes
  wrapActionBtn(btnMasks, () => actionManager.enforceMasks(...getTargetArgs()));
  wrapActionBtn(btnDistance, () => actionManager.enforceSocialDistancing(...getTargetArgs()));
  wrapActionBtn(btnLockdown, () => actionManager.enforceLockdown(...getTargetArgs()));
  wrapActionBtn(btnVaccine, () => actionManager.fundVaccineResearch()); // Vaccine is always global
  wrapActionBtn(btnBorders, () => actionManager.closeBorders(...getTargetArgs()));

  // Handle Map clicks
  mapRenderer.onCountrySelect = (country: CountryData) => {
    updateRegionPanel(country);

    // Automatically select this country as the action target
    if (actionScopeSelect && targetCountrySelect) {
      actionScopeSelect.value = 'country';
      actionScopeSelect.dispatchEvent(new Event('change')); // Trigger visibility toggle
      targetCountrySelect.value = country.id;
    }
  };

  // Title Setup ---------------------------------
  const stageSelect = document.getElementById('stage-select') as HTMLSelectElement;
  const btnStartStage = document.getElementById('btn-start-stage');

  const updateTitleScreenData = () => {
    const title = SaveManager.getTitleForLevel(saveData.playerLevel);
    if (titlePlayerRank) titlePlayerRank.innerText = `${title} (Lv. ${saveData.playerLevel})`;
    if (titlePlayerXp) titlePlayerXp.innerText = `XP: ${saveData.playerXp} / ${SaveManager.getXpRequiredForNextLevel(saveData.playerLevel)}`;

    // Populate Stage Selector UI up to maxStageUnlocked (Max 10)
    if (stageSelect) {
      stageSelect.innerHTML = '';
      const maxStage = Math.min(10, saveData.maxStageUnlocked || 1);
      for (let i = 1; i <= maxStage; i++) {
        const opt = document.createElement('option');
        opt.value = i.toString();
        opt.innerText = `STAGE ${i} ${i === maxStage ? '(最新)' : ''}`;
        stageSelect.appendChild(opt);
      }
      stageSelect.value = maxStage.toString(); // Default to latest
    }
  };

  updateTitleScreenData();

  if (btnStartStage) {
    btnStartStage.addEventListener('click', () => {
      const selectedStage = parseInt(stageSelect?.value || '1', 10);
      startGame(selectedStage);
    });
  }

  if (btnNewGame) {
    btnNewGame.addEventListener('click', () => {
      if (confirm("STAGE 1からやり直しますか？ (レベルやXPは引き継がれます)")) {
        startGame(1);
      }
    });
  }

  if (btnDeleteData) {
    btnDeleteData.addEventListener('click', () => {
      if (confirm("本当に進行データをすべて削除しますか？")) {
        SaveManager.reset();
        window.location.reload();
      }
    });
  }

  // Start logic generator
  const startGame = (stage: number) => {

    titleOverlay?.classList.add('hidden');

    // Setup base scaled economy based on stage
    // Higher stages give less budget
    const budgetScaleCoef = Math.max(0.2, 1.0 - (stage * 0.01));
    eco.baseIntervalIncome = Math.floor(1500 * budgetScaleCoef);
    eco.budget = eco.baseIntervalIncome; // Initial payout

    // Randomize whether we do historical or random outbreak (50% chance)
    const isHistorical = Math.random() < 0.5;

    if (isHistorical) {
      logGameNews(`【STAGE ${stage}】歴史的シナリオ（COVID-19型）を生成中...`, "system");
      sim.startSimulation("CN", true, stage);
    } else {
      logGameNews(`【STAGE ${stage}】ランダムな地点からの未知のウイルス発生をシミュレートします。`, "system");
      sim.startSimulation(undefined, false, stage);
    }

    if (sim.originCountryId) {
      mapRenderer.setOrigin(sim.originCountryId);
    }

    logGameNews("🚨 アウトブレイク（感染爆発）を検知しました 🚨", "alert");

    let lastTime = performance.now();
    function loop(time: number) {
      // Delta time calculation
      // Slowed down per user request. 1000 means 1 real second = 1 sim day.
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      sim.update(dt);
      eco.update(dt); // Update economy
      actionManager.update(dt); // Update auto-toggles

      updateGlobalUI();

      if (mapRenderer.selectedCountryId) {
        const c = sim.countries.get(mapRenderer.selectedCountryId);
        if (c) updateRegionPanel(c);
      }

      if (Math.random() < 0.1) {
        mapRenderer.updateColors();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  };
}

function updateGlobalUI() {
  if (globalPopEl) globalPopEl.innerText = formatNum(sim.globalPopulation);
  if (globalInfEl) globalInfEl.innerText = formatNum(sim.globalInfected);
  if (globalDeadEl) globalDeadEl.innerText = formatNum(sim.globalDead);
  if (simDayEl) simDayEl.innerText = formatNum(sim.day);
  if (diseaseNameEl) diseaseNameEl.innerText = sim.currentDiseaseName;
  if (globalVaccineEl) globalVaccineEl.innerText = `${Math.min(100, sim.vaccineProgress).toFixed(1)}%`;

  if (globalBudgetEl) globalBudgetEl.innerText = `$${formatNum(eco.budget)}M`;
  if (globalDebtEl) globalDebtEl.innerText = `$${formatNum(eco.debt)}M`;

  // Sync Measure Buttons status (disabled if already active, active class applied)
  if (btnMasks) {
    (btnMasks as HTMLButtonElement).disabled = actionManager.masksMandatory;
    actionManager.masksMandatory ? btnMasks.classList.add('active') : btnMasks.classList.remove('active');
  }
  if (btnDistance) {
    (btnDistance as HTMLButtonElement).disabled = actionManager.socialDistancingActive;
    actionManager.socialDistancingActive ? btnDistance.classList.add('active') : btnDistance.classList.remove('active');
  }
  if (btnLockdown) {
    (btnLockdown as HTMLButtonElement).disabled = actionManager.globalLockdownActive;
    actionManager.globalLockdownActive ? btnLockdown.classList.add('active') : btnLockdown.classList.remove('active');
  }
  if (btnBorders) {
    (btnBorders as HTMLButtonElement).disabled = actionManager.bordersClosed;
    actionManager.bordersClosed ? btnBorders.classList.add('active') : btnBorders.classList.remove('active');
  }
}

function updateRegionPanel(country: CountryData) {
  if (!regionInfoEl) return;

  regionInfoEl.classList.remove('empty');
  regionInfoEl.innerHTML = `
    <div class="region-name">${country.name}</div>
    <div class="region-detail-row total">
      <span>総人口</span>
      <span>${formatNum(country.population)}</span>
    </div>
    <div class="region-detail-row">
      <span style="color: var(--text-muted)">感受性（未感染）</span>
      <span>${formatNum(country.susceptible)}</span>
    </div>
    <div class="region-detail-row">
      <span style="color: var(--warning)">感染中</span>
      <span style="color: var(--warning)">${formatNum(country.infected)}</span>
    </div>
    <div class="region-detail-row">
      <span style="color: var(--success)">回復済み</span>
      <span style="color: var(--success)">${formatNum(country.recovered)}</span>
    </div>
    <div class="region-detail-row">
      <span style="color: var(--danger)">死者</span>
      <span style="color: var(--danger)">${formatNum(country.dead)}</span>
    </div>
  `;
}

// Boot
init().catch(err => console.error("INIT ERROR:", err));
