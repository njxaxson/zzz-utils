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

/**
 * Run simulation to find how many discs needed to get target
 * @param {Object} target - Target criteria
 * @returns {number} Number of discs generated until match
 */
function runSingleSimulation(target) {
    let count = 0;
    let found = false;
    let calibratorsUsed = 0;
    
    while (!found) {
        count++;
        
        let forcedMain = null;
        if (target.maxCalibrators && count <= target.maxCalibrators && target.mainStats.length === 1) {
            forcedMain = target.mainStats[0];
            calibratorsUsed++;
        }
        
        const disc = generateDisc(target.slot, forcedMain);
        if (discMatchesTarget(disc, target)) {
            found = true;
        }
        
        // Safety limit to prevent infinite loops
        if (count > 1000000) {
            console.warn('Simulation hit safety limit');
            break;
        }
    }
    
    return { count, calibratorsUsed };
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
    
    // Calculate statistics for counts
    const sum = counts.reduce((a, b) => a + b, 0);
    const average = sum / counts.length;
    
    const squaredDiffs = counts.map(val => Math.pow(val - average, 2));
    const sumOfSquaredDiffs = squaredDiffs.reduce((a, b) => a + b, 0);
    const variance = sumOfSquaredDiffs / counts.length;
    const stddev = Math.sqrt(variance);
    
    // Calculate average calibrators
    const avgCalibrators = calibrators.reduce((a, b) => a + b, 0) / calibrators.length;
    
    // Calculate percentiles
    const sorted = [...counts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    
    console.log('Simulation Stats:', {
        average,
        stddev,
        median,
        p90,
        avgCalibrators,
        first10Results: counts.slice(0, 10)
    });
    
    return {
        average,
        stddev,
        median,
        p90,
        avgCalibrators,
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
let useCalibrators = false;
let maxCalibrators = 0;

// ============================================================================
// UI RENDERING
// ============================================================================

function initSlotDropdown() {
    const container = document.getElementById('slot-dropdown-container');
    
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

function initSubstatDropdowns() {
    for (let i = 0; i < 4; i++) {
        const container = document.getElementById(`substat${i + 1}-container`);
        renderSubstatDropdown(i, container);
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
            renderSubstatDropdowns(); // Re-render all to update disabled options
        }
    });
    
    substatDropdowns[index] = dropdown;
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
        summaryHTML += `<div class="target-item"><span class="target-label">Substats:</span> <span class="target-value">${target.substats.join(', ')}</span></div>`;
    } else {
        summaryHTML += `<div class="target-item"><span class="target-label">Substats:</span> <span class="target-value">Any</span></div>`;
    }
    
    summaryHTML += '</div>';
    summaryEl.innerHTML = summaryHTML;
    
    // Statistics
    document.getElementById('result-average').textContent = stats.average.toFixed(1);
    document.getElementById('result-stddev').textContent = '±' + stats.stddev.toFixed(1);
    document.getElementById('result-count').textContent = stats.count.toLocaleString();
    
    // Add Median and P90 to statistics block
    const statsBlock = document.getElementById('result-count').closest('.result-block');
    let medianEl = document.getElementById('result-median');
    let p90El = document.getElementById('result-p90');
    
    if (!medianEl) {
        // Create elements if they don't exist
        const countLine = document.getElementById('result-count').parentNode;
        
        const medianLine = document.createElement('div');
        medianLine.className = 'stat-line';
        medianLine.innerHTML = `<span class="stat-label">Median (50% Chance)</span><span class="stat-value" id="result-median">${stats.median}</span>`;
        statsBlock.insertBefore(medianLine, countLine);
        
        const p90Line = document.createElement('div');
        p90Line.className = 'stat-line';
        p90Line.innerHTML = `<span class="stat-label">90th Percentile (Bad Luck)</span><span class="stat-value" id="result-p90">${stats.p90}</span>`;
        statsBlock.insertBefore(p90Line, countLine);
    } else {
        // Update existing elements
        medianEl.textContent = stats.median;
        p90El.textContent = stats.p90;
    }

    // Add Resources row
    const resourceMultiplier = target.slot ? 6 : 3;
    const resourceCost = Math.round(stats.average * resourceMultiplier);
    let resourcesEl = document.getElementById('result-resources');

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
    
    // Interpretation
    const interpEl = document.getElementById('result-interpretation');
    let interpretation = '';
    
    if (stats.average < 5) {
        interpretation = `<span class="interp-good">Very easy!</span> You'll find this disc configuration quickly with minimal farming.`;
    } else if (stats.average < 20) {
        interpretation = `<span class="interp-good">Reasonable.</span> A modest amount of farming should yield this disc.`;
    } else if (stats.average < 100) {
        interpretation = `<span class="interp-medium">Moderate difficulty.</span> Expect to spend some time farming for this configuration.`;
    } else if (stats.average < 500) {
        interpretation = `<span class="interp-hard">Challenging.</span> This is a fairly specific configuration that will require significant farming.`;
    } else if (stats.average < 2000) {
        interpretation = `<span class="interp-hard">Very difficult.</span> Be prepared for extensive farming to achieve this exact configuration.`;
    } else {
        interpretation = `<span class="interp-extreme">Extremely rare!</span> This configuration is highly unlikely. Consider relaxing some requirements.`;
    }
    
    // Add context about 4-substat requirement
    if (target.substats.length === 4) {
        interpretation += ` <em class="note">Note: Requiring 4 specific substats means you need the 20% lucky roll at disc creation.</em>`;
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
    // Build target substats array (filter out empty selections)
    const targetSubstats = selectedSubstats.filter(s => s !== '');
    
    // Build target object
    const target = {
        slot: selectedSlot === 'any' ? null : parseInt(selectedSlot),
        mainStats: [...selectedMainStats],
        substats: targetSubstats,
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

function init() {
    // Initialize dropdowns
    initSlotDropdown();
    initSubstatDropdowns();
    
    // Calculate button
    const calcBtn = document.getElementById('calculate-btn');
    calcBtn.addEventListener('click', runCalculation);
    
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
        });
        
        calibratorInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) {
                val = 1;
                e.target.value = 1;
            }
            maxCalibrators = val;
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
