/**
 * ZZZ Disc Calculator
 * Calculates the average number of discs needed to get a target configuration
 */

import { CustomDropdown } from './lib/custom-dropdown.js';

// ============================================================================
// DISC DATA CONSTANTS
// ============================================================================

const SUBSTATS = [
    "ATK",
    "ATK %",
    "HP",
    "HP %",
    "DEF",
    "DEF %",
    "PEN",
    "Anomaly Proficiency",
    "Crit Rate",
    "Crit Damage",
];

// Main stats per slot (0-indexed, so slot 1 = index 0)
const MAINSTATS = [
    ["ATK"],                                                                                    // Slot 1 - Fixed
    ["HP"],                                                                                     // Slot 2 - Fixed
    ["DEF"],                                                                                    // Slot 3 - Fixed
    ["ATK %", "HP %", "DEF %", "Anomaly Proficiency", "Crit Rate", "Crit Damage"],             // Slot 4
    ["ATK %", "HP %", "DEF %", "PEN Ratio", "Fire Damage", "Ice Damage", "Electric Damage", "Ether Damage", "Physical Damage"], // Slot 5
    ["ATK %", "HP %", "DEF %", "Anomaly Mastery", "Impact", "Energy Regen"]                    // Slot 6
];

const UPGRADE_COSTS = [
    { level: 1, exp: 480, dennies: 720 },
    { level: 2, exp: 720, dennies: 1080 },
    { level: 3, exp: 1200, dennies: 1800 },
    { level: 4, exp: 1440, dennies: 2160 },
    { level: 5, exp: 1680, dennies: 2520 },
    { level: 6, exp: 2160, dennies: 3240 },
    { level: 7, exp: 2400, dennies: 3600 },
    { level: 8, exp: 2640, dennies: 3960 },
    { level: 9, exp: 3120, dennies: 4680 },
    { level: 10, exp: 3600, dennies: 5400 },
    { level: 11, exp: 4080, dennies: 6120 },
    { level: 12, exp: 5040, dennies: 7560 },
    { level: 13, exp: 5760, dennies: 8640 },
    { level: 14, exp: 6480, dennies: 9720 },
    { level: 15, exp: 7200, dennies: 10800 }
];

const PLATING_AGENTS = {
    A: 2000, // Ether Plating Agent
    B: 500,  // Crystallized Plating Agent
    C: 100   // Molded Plating Agent
};

// ============================================================================
// RANDOM NUMBER GENERATOR (Cryptographically secure)
// ============================================================================

function random(until) {
    if (until <= 0 || !Number.isInteger(until)) {
        throw new Error('until must be a positive integer');
    }
    const bitsNeeded = Math.ceil(Math.log2(until));
    const bytesNeeded = Math.ceil(bitsNeeded / 8);
    const maxValue = 2 ** bitsNeeded;
    const threshold = maxValue - (maxValue % until);
    let value;
    do {
        const randomBytes = new Uint8Array(bytesNeeded);
        crypto.getRandomValues(randomBytes);
        value = 0;
        for (let i = 0; i < bytesNeeded; i++) {
            value = (value << 8) | randomBytes[i];
        }
        value = value & (maxValue - 1);
    } while (value >= threshold);
    return value % until;
}

// ============================================================================
// DISC GENERATION
// ============================================================================

/**
 * Generate a random disc for a specific slot (or random slot if not specified)
 * @param {number|null} slot - 1-6 for specific slot, null for random
 * @returns {Object} Generated disc with slot, main stat, and substats
 */
function generateDisc(slot = null, forcedMainStat = null) {
    // Determine slot (0-indexed internally)
    const slotIndex = slot ? slot - 1 : random(6);
    
    // Pick main stat (forced or random)
    let mainStat;
    if (forcedMainStat) {
        mainStat = forcedMainStat;
    } else {
        const mainOptions = MAINSTATS[slotIndex];
        mainStat = mainOptions[random(mainOptions.length)];
    }
    
    // Build available substats pool (exclude main stat if it's in the substat list)
    let substatPool = [...SUBSTATS];
    const mainInSubstats = substatPool.indexOf(mainStat);
    if (mainInSubstats >= 0) {
        substatPool.splice(mainInSubstats, 1);
    }
    
    // Generate 3 substats, with 20% chance of 4th
    const substats = [];
    const substatCount = random(5) === 0 ? 4 : 3; // 20% chance of 4
    
    for (let i = 0; i < substatCount; i++) {
        const index = random(substatPool.length);
        substats.push(substatPool.splice(index, 1)[0]);
    }
    
    return {
        slot: slotIndex + 1,
        main: mainStat,
        substats: substats
    };
}

// ============================================================================
// MATCHING LOGIC
// ============================================================================

/**
 * Check if a disc matches the target criteria
 * @param {Object} disc - The generated disc
 * @param {Object} target - Target criteria
 * @returns {boolean} True if disc matches all criteria
 */
function discMatchesTarget(disc, target) {
    // Check slot match (if specific slot required)
    if (target.slot !== null && disc.slot !== target.slot) {
        return false;
    }
    
    // Check main stat match (if specific main stats required)
    if (target.mainStats.length > 0 && !target.mainStats.includes(disc.main)) {
        return false;
    }
    
    // Check substats - all target substats must be present
    // When "any main stat" is selected, the main stat can count toward substat targets
    const availableStats = [...disc.substats];
    if (target.mainStats.length === 0) {
        // "Any main stat" mode - main stat can satisfy substat requirements
        availableStats.push(disc.main);
    }
    
    for (const targetSub of target.substats) {
        if (!availableStats.includes(targetSub)) {
            return false;
        }
    }
    
    return true;
}

// ============================================================================
// SIMULATION
// ============================================================================

function getCost(startLevel, endLevel) {
    let exp = 0;
    let dennies = 0;
    for (let i = startLevel; i < endLevel; i++) {
        if (UPGRADE_COSTS[i]) {
            exp += UPGRADE_COSTS[i].exp;
            dennies += UPGRADE_COSTS[i].dennies;
        }
    }
    return { exp, dennies };
}

function simulateUpgradeProcess(disc, target) {
    let totalExp = 0;
    let totalDennies = 0;
    let currentLevel = 0;
    let currentSubstats = [...disc.substats];
    let numSubstats = currentSubstats.length;
    
    // Track current upgrades for goal stats
    const currentUpgrades = {};
    for (const stat in target.substatGoals) {
        currentUpgrades[stat] = currentSubstats.includes(stat) ? 0 : -1;
    }
    
    // Check initial impossibility (Main Stat Conflict)
    if (target.mainStats.length === 0) {
        for (const stat in target.substatGoals) {
            if (disc.main === stat) {
                return { success: false, exp: 0, dennies: 0 };
            }
        }
    } else {
        // If specific main stat, we assume generator handled it, but logic holds
        if (!target.mainStats.includes(disc.main)) {
             return { success: false, exp: 0, dennies: 0 };
        }
    }
    
    // Initial feasibility check
    for (const stat in target.substatGoals) {
        if (currentUpgrades[stat] === -1 && numSubstats === 4) {
            return { success: false, exp: 0, dennies: 0 };
        }
    }
    
    const thresholds = [3, 6, 9, 12, 15];
    
    for (const threshold of thresholds) {
        // Calculate needed upgrades
        let neededTotal = 0;
        let allFound = true;
        
        for (const stat in target.substatGoals) {
            const goal = target.substatGoals[stat];
            const current = currentUpgrades[stat];
            if (current === -1) {
                neededTotal += goal;
                allFound = false;
            } else {
                neededTotal += Math.max(0, goal - current);
            }
        }
        
        // Stop if goals met
        if (allFound && neededTotal === 0) {
             return { success: true, exp: totalExp, dennies: totalDennies };
        }
        
        // Calculate remaining opportunities
        const pendingSteps = thresholds.filter(t => t > currentLevel);
        let futureUpgrades = 0;
        
        if (numSubstats === 3) {
            // First step is reveal (0 upgrades)
            futureUpgrades = Math.max(0, pendingSteps.length - 1);
        } else {
            futureUpgrades = pendingSteps.length;
        }
        
        if (neededTotal > futureUpgrades) {
            return { success: false, exp: totalExp, dennies: totalDennies };
        }
        
        // Check missing stat impossibility
        if (!allFound && numSubstats === 4) {
             return { success: false, exp: totalExp, dennies: totalDennies };
        }
        
        // Proceed to upgrade
        const cost = getCost(currentLevel, threshold);
        totalExp += cost.exp;
        totalDennies += cost.dennies;
        currentLevel = threshold;
        
        // Action
        if (threshold === 3 && numSubstats === 3) {
            // Reveal
            const available = SUBSTATS.filter(s => s !== disc.main && !currentSubstats.includes(s));
            const newStat = available[Math.floor(Math.random() * available.length)];
            currentSubstats.push(newStat);
            numSubstats = 4;
            
            if (newStat in currentUpgrades) {
                currentUpgrades[newStat] = 0;
            }
        } else {
            // Upgrade existing
            const upgradedStat = currentSubstats[Math.floor(Math.random() * currentSubstats.length)];
            if (upgradedStat in currentUpgrades) {
                currentUpgrades[upgradedStat]++;
            }
        }
    }
    
    // Final check
    let success = true;
    for (const stat in target.substatGoals) {
        if (currentUpgrades[stat] === -1 || currentUpgrades[stat] < target.substatGoals[stat]) {
            success = false;
            break;
        }
    }
    
    return { success, exp: totalExp, dennies: totalDennies };
}

/**
 * Run simulation to find how many discs needed to get target
 * @param {Object} target - Target criteria
 * @returns {number} Number of discs generated until match
 */
function runSingleSimulation(target) {
    let count = 0;
    let found = false;
    let calibratorsUsed = 0;
    let totalExp = 0;
    let totalDennies = 0;
    
    while (!found) {
        count++;
        
        let forcedMain = null;
        if (target.maxCalibrators && count <= target.maxCalibrators && target.mainStats.length === 1) {
            forcedMain = target.mainStats[0];
            calibratorsUsed++;
        }
        
        const disc = generateDisc(target.slot, forcedMain);
        const result = simulateUpgradeProcess(disc, target);
        
        totalExp += result.exp;
        totalDennies += result.dennies;
        
        if (result.success) {
            found = true;
        }
        
        // Safety limit to prevent infinite loops
        if (count > 1000000) {
            console.warn('Simulation hit safety limit');
            break;
        }
    }
    
    return { count, calibratorsUsed, totalExp, totalDennies };
}

/**
 * Run multiple simulations and calculate statistics
 * @param {Object} target - Target criteria
 * @param {number} maxIterations - Maximum number of simulations to run
 * @param {number} maxTimeMs - Maximum time in milliseconds
 * @returns {Object} Statistics object with average, stddev, and count
 */
function runSimulations(target, maxIterations = 2000, maxTimeMs = 5000) {
    const results = [];
    const startTime = Date.now();
    let iterations = 0;
    
    while (iterations < maxIterations) {
        // Check time limit
        if (Date.now() - startTime >= maxTimeMs) {
            console.log(`Stopped after ${iterations} iterations due to time limit`);
            break;
        }
        
        results.push(runSingleSimulation(target));
        iterations++;
    }
    
    // Extract counts for statistics
    const counts = results.map(r => r.count);
    const calibrators = results.map(r => r.calibratorsUsed);
    const exps = results.map(r => r.totalExp);
    const dennies = results.map(r => r.totalDennies);
    
    // Calculate statistics for counts
    const sum = counts.reduce((a, b) => a + b, 0);
    const average = sum / counts.length;
    
    // Calculate average calibrators
    const avgCalibrators = calibrators.reduce((a, b) => a + b, 0) / calibrators.length;

    // Calculate average resources
    const avgExp = exps.reduce((a, b) => a + b, 0) / exps.length;
    const avgDennies = dennies.reduce((a, b) => a + b, 0) / dennies.length;
    
    console.log('Simulation Stats:', {
        average,
        avgCalibrators,
        avgExp,
        avgDennies,
        first10Results: counts.slice(0, 10)
    });
    
    return {
        average,
        avgCalibrators,
        avgExp,
        avgDennies,
        count: iterations,
        results: counts
    };
}

// ============================================================================
// UI STATE
// ============================================================================

let slotDropdown = null;
let mainstatCheckboxes = [];
let substatDropdowns = [];

let selectedSlot = 'any';
let selectedMainStats = []; // Array for multi-select
let selectedSubstats = ['', '', '', '']; // Four substats, empty string = none
let selectedUpgrades = [0, 0, 0, 0];
let upgradeHistory = [];
let upgradeWidgets = [];
let useCalibrators = false;
let maxCalibrators = 0;

// ============================================================================
// UI RENDERING
// ============================================================================

function initSlotDropdown() {
    const container = document.getElementById('slot-dropdown-container');
    if (container) container.innerHTML = '';
    
    slotDropdown = new CustomDropdown({
        container: container,
        id: 'slot-dropdown',
        options: [
            { value: 'any', label: 'Any Slot', selected: true },
            { value: '1', label: 'Slot 1' },
            { value: '2', label: 'Slot 2' },
            { value: '3', label: 'Slot 3' },
            { value: '4', label: 'Slot 4' },
            { value: '5', label: 'Slot 5' },
            { value: '6', label: 'Slot 6' }
        ],
        onChange: (value) => {
            selectedSlot = value;
            selectedMainStats = [];
            renderMainStatSelector();
            renderSubstatDropdowns();
            updateCalibratorVisibility();
            saveState();
        }
    });
}

function renderMainStatSelector() {
    const container = document.getElementById('mainstat-container');
    const group = document.getElementById('mainstat-group');
    container.innerHTML = '';
    
    // Always make sure the group is visible
    group.style.display = '';
    
    if (selectedSlot === 'any') {
        // Any slot selected - locked to "Any main stat"
        const fixedDisplay = document.createElement('div');
        fixedDisplay.className = 'fixed-stat-display';
        fixedDisplay.textContent = 'Any main stat';
        container.appendChild(fixedDisplay);
        selectedMainStats = [];
        return;
    }
    
    const slotIndex = parseInt(selectedSlot) - 1;
    const mainOptions = MAINSTATS[slotIndex];
    
    if (mainOptions.length === 1) {
        // Fixed main stat (slots 1-3)
        const fixedDisplay = document.createElement('div');
        fixedDisplay.className = 'fixed-stat-display';
        fixedDisplay.textContent = mainOptions[0];
        container.appendChild(fixedDisplay);
        selectedMainStats = []; // Fixed stats don't need to be selected
    } else {
        // Variable main stat (slots 4-6) - multi-dropdown with checkboxes
        const multiDropdown = document.createElement('div');
        multiDropdown.className = 'multi-dropdown';
        
        // Toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'dropdown-toggle';
        
        const dropdownText = document.createElement('span');
        dropdownText.className = 'dropdown-text';
        updateMainStatDropdownText(dropdownText);
        
        const dropdownArrow = document.createElement('span');
        dropdownArrow.className = 'dropdown-arrow';
        dropdownArrow.textContent = '▼';
        
        toggleBtn.appendChild(dropdownText);
        toggleBtn.appendChild(dropdownArrow);
        
        // Dropdown menu
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        
        mainOptions.forEach(stat => {
            const label = document.createElement('label');
            label.className = 'dropdown-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = stat;
            checkbox.checked = selectedMainStats.includes(stat);
            
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedMainStats.push(stat);
                } else {
                    const index = selectedMainStats.indexOf(stat);
                    if (index >= 0) {
                        selectedMainStats.splice(index, 1);
                    }
                }
                updateMainStatDropdownText(dropdownText);
                renderSubstatDropdowns();
                updateCalibratorVisibility();
                saveState();
            });
            
            const span = document.createElement('span');
            span.textContent = stat;
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ')); // Add space between checkbox and label
            label.appendChild(span);
            dropdownMenu.appendChild(label);
        });
        
        // Toggle dropdown on button click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            multiDropdown.classList.toggle('open');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!multiDropdown.contains(e.target)) {
                multiDropdown.classList.remove('open');
            }
        });
        
        multiDropdown.appendChild(toggleBtn);
        multiDropdown.appendChild(dropdownMenu);
        container.appendChild(multiDropdown);
    }
    
    // Update substat dropdowns to disable conflicting stats
    renderSubstatDropdowns();
}

function updateMainStatDropdownText(textElement) {
    if (selectedMainStats.length === 0) {
        textElement.textContent = 'Any main stat';
    } else if (selectedMainStats.length === 1) {
        textElement.textContent = selectedMainStats[0];
    } else {
        textElement.textContent = `${selectedMainStats.length} selected`;
    }
}

class UpgradeWidget {
    constructor(container, index, onChange) {
        this.container = container;
        this.index = index;
        this.value = 0;
        this.onChange = onChange;
        this.render();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="upgrade-widget disabled" id="upgrade-widget-${this.index}">
                <div class="upgrade-display placeholder">—</div>
                <div class="upgrade-controls">
                    <button class="upgrade-btn up" type="button">▲</button>
                    <button class="upgrade-btn down" type="button">▼</button>
                </div>
            </div>
        `;
        
        this.display = this.container.querySelector('.upgrade-display');
        this.widget = this.container.querySelector('.upgrade-widget');
        
        this.widget.addEventListener('mousedown', e => e.preventDefault());
        
        // Cycle on main area click
        this.display.addEventListener('click', (e) => {
             e.stopPropagation();
             if (this.isDisabled()) return;
             
             let next = this.value + 1;
             if (next > 5) next = 0;
             this.onChange(this.index, next);
        });

        this.container.querySelector('.up').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.isDisabled()) this.onChange(this.index, this.value + 1);
        });
        
        this.container.querySelector('.down').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.isDisabled()) this.onChange(this.index, this.value - 1);
        });
    }
    
    updateDisplay() {
        if (this.value === 0) {
            this.display.textContent = '—';
            this.display.classList.add('placeholder');
        } else {
            this.display.textContent = `+${this.value}`;
            this.display.classList.remove('placeholder');
        }
    }
    
    setValue(val) {
        this.value = val;
        this.updateDisplay();
    }
    
    setDisabled(disabled) {
        if (disabled) {
            this.widget.classList.add('disabled');
        } else {
            this.widget.classList.remove('disabled');
        }
    }
    
    isDisabled() {
        return this.widget.classList.contains('disabled');
    }
}

function handleUpgradeChange(index, newValue) {
    if (newValue < 0 || newValue > 5) return;
    
    const oldValue = selectedUpgrades[index];
    if (newValue === oldValue) return;
    
    let currentTotal = selectedUpgrades.reduce((a, b) => a + b, 0);
    const delta = newValue - oldValue;
    
    if (delta > 0) {
        if (currentTotal + delta > 5) {
            const needed = (currentTotal + delta) - 5;
            let reduced = 0;
            let historyCopy = [...upgradeHistory];
            
            for (const histIndex of historyCopy) {
                if (histIndex === index) continue;
                if (reduced >= needed) break;
                
                const available = selectedUpgrades[histIndex];
                if (available > 0) {
                    const take = Math.min(available, needed - reduced);
                    selectedUpgrades[histIndex] -= take;
                    upgradeWidgets[histIndex].setValue(selectedUpgrades[histIndex]);
                    reduced += take;
                }
            }
            
            if (reduced < needed) {
                return;
            }
        }
    }
    
    selectedUpgrades[index] = newValue;
    upgradeWidgets[index].setValue(newValue);
    
    upgradeHistory = upgradeHistory.filter(i => i !== index);
    if (newValue > 0) {
        upgradeHistory.push(index);
    }
    upgradeHistory = upgradeHistory.filter(i => selectedUpgrades[i] > 0);
    
    saveState();
}

function initSubstatDropdowns() {
    for (let i = 0; i < 4; i++) {
        const container = document.getElementById(`substat${i + 1}-container`);
        renderSubstatDropdown(i, container);
        
        // Init upgrade widget
        const upgradeContainer = document.getElementById(`substat${i + 1}-upgrade-container`);
        if (upgradeContainer) {
            const widget = new UpgradeWidget(upgradeContainer, i, handleUpgradeChange);
            upgradeWidgets[i] = widget;
            // Set initial state
            widget.setDisabled(selectedSubstats[i] === '');
        }
    }
}

function renderSubstatDropdowns() {
    for (let i = 0; i < 4; i++) {
        const container = document.getElementById(`substat${i + 1}-container`);
        container.innerHTML = '';
        renderSubstatDropdown(i, container);
    }
}

function renderSubstatDropdown(index, container) {
    if (!container) {
        console.warn(`Container for substat ${index + 1} not found`);
        return;
    }

    // Determine which stats to disable (main stats that are in SUBSTATS)
    const disabledStats = new Set();
    
    // If specific main stats selected, disable those that overlap with substats
    if (selectedMainStats.length > 0) {
        selectedMainStats.forEach(ms => {
            if (SUBSTATS.includes(ms)) {
                disabledStats.add(ms);
            }
        });
    }
    
    // If fixed slot (1-3), disable the fixed main stat
    if (selectedSlot !== 'any') {
        const slotIndex = parseInt(selectedSlot) - 1;
        const mainOptions = MAINSTATS[slotIndex];
        if (mainOptions.length === 1) {
            const fixedMain = mainOptions[0];
            if (SUBSTATS.includes(fixedMain)) {
                disabledStats.add(fixedMain);
            }
        }
    }
    
    // Also disable substats that are already selected in other dropdowns
    selectedSubstats.forEach((stat, i) => {
        if (i !== index && stat !== '') {
            disabledStats.add(stat);
        }
    });
    
    // Build options list
    const options = [{ value: '', label: 'Any', selected: selectedSubstats[index] === '' }];
    
    SUBSTATS.forEach(stat => {
        const disabled = disabledStats.has(stat);
        if (!disabled) {
            options.push({
                value: stat,
                label: stat,
                selected: selectedSubstats[index] === stat
            });
        }
    });
    
    const dropdown = new CustomDropdown({
        container: container,
        id: `substat${index + 1}-dropdown`,
        options: options,
        onChange: (value) => {
            selectedSubstats[index] = value;
            
            // Toggle upgrade widget
            if (upgradeWidgets[index]) {
                upgradeWidgets[index].setDisabled(value === '');
                if (value === '' && selectedUpgrades[index] > 0) {
                    handleUpgradeChange(index, 0); 
                }
            }
            
            renderSubstatDropdowns(); // Re-render all to update disabled options
            saveState();
        }
    });
    
    substatDropdowns[index] = dropdown;

    // Sync upgrade widget state if it exists
    if (upgradeWidgets[index]) {
        upgradeWidgets[index].setDisabled(selectedSubstats[index] === '');
    }
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

function showResults(stats, target) {
    const resultsSection = document.getElementById('results-section');
    resultsSection.style.display = '';
    
    // Build target summary
    const summaryEl = document.getElementById('target-summary');
    let summaryHTML = '<div class="target-details">';
    
    // Slot
    summaryHTML += `<div class="target-item"><span class="target-label">Slot:</span> <span class="target-value">${target.slot ? 'Slot ' + target.slot : 'Any'}</span></div>`;
    
    // Main stat
    if (target.slot) {
        const slotIndex = target.slot - 1;
        const mainOptions = MAINSTATS[slotIndex];
        if (mainOptions.length === 1) {
            summaryHTML += `<div class="target-item"><span class="target-label">Main Stat:</span> <span class="target-value">${mainOptions[0]} (fixed)</span></div>`;
        } else if (target.mainStats.length === 0) {
            summaryHTML += `<div class="target-item"><span class="target-label">Main Stat:</span> <span class="target-value">Any</span></div>`;
        } else {
            summaryHTML += `<div class="target-item"><span class="target-label">Main Stat:</span> <span class="target-value">${target.mainStats.join(' or ')}</span></div>`;
        }
    }
    
    // Substats
    if (target.substats.length > 0) {
        const formattedSubstats = target.substats.map(stat => {
            const upgrades = target.substatGoals ? target.substatGoals[stat] : 0;
            return (upgrades > 0) ? `${stat} +${upgrades}` : stat;
        });
        summaryHTML += `<div class="target-item"><span class="target-label">Substats:</span> <span class="target-value">${formattedSubstats.join(', ')}</span></div>`;
    } else {
        summaryHTML += `<div class="target-item"><span class="target-label">Substats:</span> <span class="target-value">Any</span></div>`;
    }
    
    summaryHTML += '</div>';
    summaryEl.innerHTML = summaryHTML;
    
    // Statistics
    document.getElementById('result-average').textContent = stats.average.toFixed(1);
    document.getElementById('result-count').textContent = stats.count.toLocaleString();
    
    const statsBlock = document.getElementById('result-count').closest('.result-block');

    // Clean up old median/p90 if they exist
    const oldMedian = document.getElementById('result-median');
    if (oldMedian) oldMedian.closest('.stat-line').remove();
    const oldP90 = document.getElementById('result-p90');
    if (oldP90) oldP90.closest('.stat-line').remove();

    // Clean up old resource elements if they exist
    const oldResources = document.getElementById('result-resources');
    if (oldResources) {
        const row = oldResources.closest('.stat-line');
        if (row) row.remove();
    }
    const oldCal = document.getElementById('result-calibrators-row');
    if (oldCal) oldCal.remove();

    // Add Resources Block
    let resourceContainer = document.getElementById('resource-container');
    if (!resourceContainer) {
        resourceContainer = document.createElement('div');
        resourceContainer.id = 'resource-container';
        resourceContainer.style.marginTop = '0.5rem';
        resourceContainer.style.borderTop = 'none';
        resourceContainer.style.paddingTop = '0.5rem';
        statsBlock.appendChild(resourceContainer);
    }
    
    const resourceMultiplier = target.slot ? 6 : 3;
    const hifiCost = Math.round(stats.average * resourceMultiplier);
    
    // Helper for Plating agents
    function calculatePlatingAgents(exp) {
        let remaining = Math.round(exp);
        const a = Math.floor(remaining / 2000);
        remaining %= 2000;
        const b = Math.floor(remaining / 500);
        remaining %= 500;
        const c = Math.ceil(remaining / 100);
        return { a, b, c };
    }
    const agents = calculatePlatingAgents(stats.avgExp);
    
    // Build Resource HTML
    let html = '';
    
    // Hi-Fi
    html += `
        <div class="stat-line" style="font-weight: bold; border: none; padding: 0.25rem 0;">
            <span class="stat-label">Estimated Resources</span>
            <span class="stat-value" style="display: flex; align-items: center; gap: 8px;">
                <img src="assets/resources/hifi.webp" alt="Hi-Fi" style="width: 20px; height: 20px; object-fit: contain;">
                <span style="min-width: 70px; text-align: right;">${hifiCost.toLocaleString()}</span>
            </span>
        </div>
    `;
    
    // Calibrators
    if (stats.avgCalibrators && stats.avgCalibrators > 0) {
        html += `
            <div class="stat-line" style="justify-content: flex-end; border: none; padding: 0.25rem 0;">
                <span class="stat-value" style="display: flex; align-items: center; gap: 8px;">
                    <img src="assets/resources/calibrator.webp" alt="Calibrator" style="width: 20px; height: 20px; object-fit: contain;">
                    <span style="min-width: 70px; text-align: right;">${Math.round(stats.avgCalibrators).toLocaleString()}</span>
                </span>
            </div>
        `;
    }
    
    // Dennies
    html += `
        <div class="stat-line" style="justify-content: flex-end; border: none; padding: 0.25rem 0;">
            <span class="stat-value" style="display: flex; align-items: center; gap: 8px;">
                <img src="assets/resources/denny.webp" alt="Dennies" style="width: 20px; height: 20px; object-fit: contain;">
                <span style="min-width: 70px; text-align: right;">${Math.round(stats.avgDennies).toLocaleString()}</span>
            </span>
        </div>
    `;
    
    // Plating Agents
    const agentInfo = [];
    if (agents.a > 0) agentInfo.push({ label: 'Ether Plating Agent', val: agents.a, icon: 'plating-a.webp' });
    if (agents.b > 0) agentInfo.push({ label: 'Crystallized Plating Agent', val: agents.b, icon: 'plating-b.webp' });
    if (agents.c > 0) agentInfo.push({ label: 'Molded Plating Agent', val: agents.c, icon: 'plating-c.webp' });
    
    agentInfo.forEach(item => {
        html += `
            <div class="stat-line" style="justify-content: flex-end; border: none; padding: 0.25rem 0;">
                <span class="stat-value" style="display: flex; align-items: center; gap: 8px;">
                    <img src="assets/resources/${item.icon}" alt="${item.label}" style="width: 20px; height: 20px; object-fit: contain;">
                    <span style="min-width: 70px; text-align: right;">${item.val.toLocaleString()}</span>
                </span>
            </div>
        `;
    });

    resourceContainer.innerHTML = html;
    
    /* REPLACED LOGIC START */
    /* REMOVED OLD LOGIC
    let resourcesEl = null; // document.getElementById('result-resources');

    if (!resourcesEl) {
        const resourcesLine = document.createElement('div');
        resourcesLine.className = 'stat-line';
        resourcesLine.style.fontWeight = 'bold';
        resourcesLine.style.marginTop = '0.5rem';
        
        resourcesLine.innerHTML = `
            <span class="stat-label">Estimated Resources</span>
            <span class="stat-value" style="display: flex; align-items: center; gap: 6px;">
                <img src="assets/resources/hifi.webp" alt="Hi-Fi" style="width: 20px; height: 20px; object-fit: contain;">
                <span id="result-resources">${resourceCost.toLocaleString()}</span>
            </span>
        `;
        statsBlock.appendChild(resourcesLine);
    } else {
        document.getElementById('result-resources').textContent = resourceCost.toLocaleString();
    }

    // Add Tuning Calibrators row
    let calibratorsEl = document.getElementById('result-calibrators-row');
    const resourcesRow = document.getElementById('result-resources') ? document.getElementById('result-resources').closest('.stat-line') : null;

    if (stats.avgCalibrators && stats.avgCalibrators > 0) {
        const calCost = Math.round(stats.avgCalibrators);
        
        // Remove border from the previous row (Resources) to merge them visually
        if (resourcesRow) {
            resourcesRow.style.borderBottom = 'none';
            resourcesRow.style.paddingBottom = '0.25rem';
        }

        if (!calibratorsEl) {
            const calLine = document.createElement('div');
            calLine.className = 'stat-line';
            calLine.id = 'result-calibrators-row';
            calLine.style.justifyContent = 'flex-end';
            calLine.style.paddingTop = '0';
            
            calLine.innerHTML = `
                <span class="stat-value" style="display: flex; align-items: center; gap: 6px;">
                    <img src="assets/resources/calibrator.webp" alt="Calibrator" style="width: 20px; height: 20px; object-fit: contain;">
                    <span id="result-calibrators">${calCost.toLocaleString()}</span>
                </span>
            `;
            statsBlock.appendChild(calLine);
        } else {
            calibratorsEl.style.display = 'flex';
            calibratorsEl.style.justifyContent = 'flex-end';
            calibratorsEl.style.paddingTop = '0';
            document.getElementById('result-calibrators').textContent = calCost.toLocaleString();
        }
    } else if (calibratorsEl) {
        calibratorsEl.style.display = 'none';
        // Restore border of previous row
        if (resourcesRow) {
            resourcesRow.style.borderBottom = '';
            resourcesRow.style.paddingBottom = '';
        }
    }
    
    */
    // Interpretation
    const interpEl = document.getElementById('result-interpretation');
    let interpretation = '';
    
    if (stats.average < 5) {
        interpretation = `<span class="interp-good">Very easy!</span> Minimal farming and resources required.`;
    } else if (stats.average < 20) {
        interpretation = `<span class="interp-good">Reasonable.</span> Modest farming effort and resource investment.`;
    } else if (stats.average < 100) {
        interpretation = `<span class="interp-medium">Moderate difficulty.</span> Will require some farming and a fair amount of resources.`;
    } else if (stats.average < 500) {
        interpretation = `<span class="interp-hard">Challenging.</span> Significant farming required. Prepare a good stockpile of resources.`;
    } else if (stats.average < 2000) {
        interpretation = `<span class="interp-hard">Very difficult.</span> Extensive farming needed. This will be a major resource drain.`;
    } else {
        interpretation = `<span class="interp-extreme">Extremely rare!</span> Highly unlikely configuration. Requires massive resources and luck.`;
    }
    
    // Add context about 5 upgrades requirement
    let totalUpgrades = 0;
    if (target.substatGoals) {
        for (const stat in target.substatGoals) {
            totalUpgrades += target.substatGoals[stat];
        }
    }
    
    if (totalUpgrades === 5) {
        interpretation += ` <em class="note">Note: Requiring 5 upgrades means you need the 20% lucky roll (4 initial substats) at disc creation.</em>`;
    }
    
    interpEl.innerHTML = interpretation;
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = show ? 'flex' : 'none';
}

// ============================================================================
// MAIN CALCULATION
// ============================================================================

function runCalculation() {
    // Save state before running calculation
    saveState();
    
    // Build target substats array and goals
    const targetSubstats = [];
    const substatGoals = {};
    
    selectedSubstats.forEach((stat, index) => {
        if (stat !== '') {
            targetSubstats.push(stat);
            substatGoals[stat] = selectedUpgrades[index];
        }
    });
    
    // Build target object
    const target = {
        slot: selectedSlot === 'any' ? null : parseInt(selectedSlot),
        mainStats: [...selectedMainStats],
        substats: targetSubstats,
        substatGoals: substatGoals,
        maxCalibrators: useCalibrators ? maxCalibrators : 0
    };
    
    // Show loading
    showLoading(true);
    
    // Run simulation asynchronously to not block UI
    setTimeout(() => {
        try {
            const stats = runSimulations(target, 2000, 5000);
            showLoading(false);
            showResults(stats, target);
        } catch (error) {
            showLoading(false);
            console.error('Simulation error:', error);
            alert('An error occurred during simulation. Please try again.');
        }
    }, 50);
}

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

function saveState() {
    const state = {
        slot: selectedSlot,
        mainStats: selectedMainStats,
        substats: selectedSubstats,
        upgrades: selectedUpgrades,
        useCalibrators: useCalibrators,
        maxCalibrators: maxCalibrators
    };
    try {
        localStorage.setItem('discCalculatorState', JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save state', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem('discCalculatorState');
        if (!saved) return;
        
        const state = JSON.parse(saved);
        
        // Restore slot selection
        if (state.slot) {
            selectedSlot = state.slot;
            // Update the dropdown value without triggering onChange
            if (slotDropdown) {
                const index = slotDropdown.options.findIndex(opt => opt.value === state.slot);
                if (index >= 0) {
                    slotDropdown.selectedValue = state.slot;
                    slotDropdown.selectedLabel = slotDropdown.options[index].label;
                    slotDropdown.display.textContent = slotDropdown.selectedLabel;
                    slotDropdown.display.appendChild(slotDropdown.arrow);
                    slotDropdown.optionElements.forEach((el, i) => {
                        el.classList.toggle('selected', i === index);
                    });
                }
            }
        }
        
        // Restore main stats selection
        if (state.mainStats && Array.isArray(state.mainStats)) {
            selectedMainStats = [...state.mainStats];
        }
        
        // Restore substats and upgrades
        if (state.substats && Array.isArray(state.substats)) {
            selectedSubstats = [...state.substats];
        }
        if (state.upgrades && Array.isArray(state.upgrades)) {
            selectedUpgrades = [...state.upgrades];
        }
        
        // Update UI components
        renderMainStatSelector();
        renderSubstatDropdowns();
        
        // Restore upgrade widget values
        selectedUpgrades.forEach((val, i) => {
            if (upgradeWidgets[i]) {
                upgradeWidgets[i].setValue(val);
                upgradeWidgets[i].setDisabled(selectedSubstats[i] === '');
            }
        });
        
        // Rebuild upgrade history based on current upgrades
        upgradeHistory = [];
        selectedUpgrades.forEach((val, i) => {
            if (val > 0) {
                upgradeHistory.push(i);
            }
        });
        
        // Restore calibrator settings
        if (typeof state.useCalibrators === 'boolean') {
            useCalibrators = state.useCalibrators;
            const cb = document.getElementById('use-calibrators');
            if (cb) cb.checked = useCalibrators;
        }
        
        if (typeof state.maxCalibrators === 'number' && state.maxCalibrators > 0) {
            maxCalibrators = state.maxCalibrators;
            const inp = document.getElementById('calibrator-input');
            if (inp) {
                inp.value = maxCalibrators;
                inp.disabled = !useCalibrators;
            }
        } else {
            const inp = document.getElementById('calibrator-input');
            if (inp) {
                inp.disabled = !useCalibrators;
            }
        }
        
        updateCalibratorVisibility();
        
    } catch (e) {
        console.error('Failed to load state', e);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function updateCalibratorVisibility() {
    const section = document.getElementById('calibrator-section');
    const slotInt = parseInt(selectedSlot);
    const validSlot = !isNaN(slotInt) && slotInt >= 4 && slotInt <= 6;
    const singleMainStat = selectedMainStats.length === 1;
    
    if (section) {
        if (validSlot && singleMainStat) {
            section.style.display = 'flex';
        } else {
            section.style.display = 'none';
        }
    }
}

function resetConfiguration() {
    // Reset Slot
    selectedSlot = 'any';
    initSlotDropdown();
    
    // Reset Main Stats
    selectedMainStats = [];
    renderMainStatSelector();
    
    // Reset Substats & Upgrades
    selectedSubstats = ['', '', '', ''];
    selectedUpgrades = [0, 0, 0, 0];
    upgradeHistory = [];
    upgradeWidgets.forEach(w => { if(w) w.setValue(0); });
    renderSubstatDropdowns();
    
    // Reset Calibrators
    useCalibrators = false;
    maxCalibrators = 0;
    const calCheck = document.getElementById('use-calibrators');
    const calInput = document.getElementById('calibrator-input');
    if (calCheck) calCheck.checked = false;
    if (calInput) {
        calInput.value = '1';
        calInput.disabled = true;
    }
    updateCalibratorVisibility();
    
    // Hide Results
    document.getElementById('results-section').style.display = 'none';
    showLoading(false);
}

function init() {
    // Initialize dropdowns
    initSlotDropdown();
    initSubstatDropdowns();
    
    // Load saved state from localStorage
    loadState();
    
    // Buttons
    const calcBtn = document.getElementById('calculate-btn');
    if (calcBtn) calcBtn.addEventListener('click', runCalculation);
    
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetConfiguration);
    
    // Calibrator controls
    const calibratorCheckbox = document.getElementById('use-calibrators');
    const calibratorInput = document.getElementById('calibrator-input');
    
    if (calibratorCheckbox && calibratorInput) {
        // Sync state on load
        useCalibrators = calibratorCheckbox.checked;
        calibratorInput.disabled = !useCalibrators;
        
        let val = parseInt(calibratorInput.value);
        // If checked, use value (default 1). If not, use 0.
        maxCalibrators = useCalibrators ? ((isNaN(val) || val < 1) ? 1 : val) : 0;
        
        calibratorCheckbox.addEventListener('change', (e) => {
            useCalibrators = e.target.checked;
            calibratorInput.disabled = !useCalibrators;
            
            if (useCalibrators) {
                // Ensure valid value
                if (!calibratorInput.value || parseInt(calibratorInput.value) < 1) {
                    calibratorInput.value = 1;
                }
                maxCalibrators = parseInt(calibratorInput.value);
                calibratorInput.focus();
            } else {
                maxCalibrators = 0;
            }
            saveState();
        });
        
        calibratorInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) {
                val = 1;
                e.target.value = 1;
            }
            maxCalibrators = val;
            saveState();
        });
    }
    
    // Initial render
    renderMainStatSelector();
    updateCalibratorVisibility();
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
