// ZZZ Gacha Simulator - Client-side UI
// Imports core logic from shared module

import {
    SIMULATIONS,
    REFUND_RATE,
    PITY_C,
    PITY_W,
    PITY_A,
    TACTICS,
    simulate,
    toLabel,
    toPercentage,
    runBatchSimulation
} from './lib/gacha-core.js';

import { replaceSelect } from './lib/custom-dropdown.js';

// DOM Elements
const polychromeInput = document.getElementById('polychrome');
const tapesInput = document.getElementById('tapes');
const totalPullsDisplay = document.getElementById('total-pulls');
const targetCInput = document.getElementById('target-c');
const targetWInput = document.getElementById('target-w');
const pitySCInput = document.getElementById('pity-sc');
const pitySWInput = document.getElementById('pity-sw');
const pityACInput = document.getElementById('pity-ac');
const pityAWInput = document.getElementById('pity-aw');
const guaranteeCInput = document.getElementById('guarantee-c');
const guaranteeWInput = document.getElementById('guarantee-w');
const includeRefundsInput = document.getElementById('include-refunds');
const showStandardInput = document.getElementById('show-standard');
const showARankInput = document.getElementById('show-arank');
const pullTacticInput = document.getElementById('pull-tactic');
const simulateBtn = document.getElementById('simulate-btn');
const resultsSection = document.getElementById('results-section');
const standardChartContainer = document.getElementById('standard-chart-container');
const arankChartContainer = document.getElementById('arank-chart-container');
const validationErrorsDiv = document.getElementById('validation-errors');

let chartInstance = null;
let standardChartInstance = null;
let arankChartInstance = null;

// Custom dropdown instances
let targetCDropdown = null;
let targetWDropdown = null;
let tacticDropdown = null;

// Initialize custom dropdowns
function initCustomDropdowns() {
    // Replace Character target select
    targetCDropdown = replaceSelect(targetCInput, {
        onChange: () => updateTacticVisibility()
    });
    
    // Replace W-Engine target select
    targetWDropdown = replaceSelect(targetWInput, {
        onChange: () => updateTacticVisibility()
    });
    
    // Replace Pull Tactic select with inline style
    tacticDropdown = replaceSelect(pullTacticInput, {
        className: 'inline'
    });
}

// Update total pulls display
function updateTotalPulls() {
    const polychrome = parseInt(polychromeInput.value) || 0;
    const tapes = parseInt(tapesInput.value) || 0;
    const totalPulls = Math.floor(polychrome / 160) + tapes;
    totalPullsDisplay.textContent = totalPulls;
}

// Add event listeners for pull calculation
polychromeInput.addEventListener('input', updateTotalPulls);
tapesInput.addEventListener('input', updateTotalPulls);

// Show/hide tactic option based on targets
function updateTacticVisibility() {
    const targetC = parseInt(targetCInput.value) || 0;
    const targetW = parseInt(targetWInput.value) || 0;
    // Only show tactic option when pulling for both character AND engine
    // and when aiming for more than M0 (since M0W1 has no practical difference between tactics)
    const shouldShow = targetC > 1 && targetW > 0;
    
    if (tacticDropdown) {
        if (shouldShow) {
            tacticDropdown.show();
        } else {
            tacticDropdown.hide();
        }
    }
}

// Pity validation
function validatePityInput(input, maxValue) {
    const value = parseInt(input.value) || 0;
    if (value >= maxValue) {
        input.value = maxValue - 1;
        input.classList.add('invalid');
        setTimeout(() => input.classList.remove('invalid'), 1000);
    } else if (value < 0) {
        input.value = 0;
    }
}

// Pity hint elements
const pitySCHint = document.getElementById('pity-sc-hint');
const pitySWHint = document.getElementById('pity-sw-hint');
const pityACHint = document.getElementById('pity-ac-hint');
const pityAWHint = document.getElementById('pity-aw-hint');

// Update pity hints
function updatePityHints() {
    const scValue = parseInt(pitySCInput.value) || 0;
    const swValue = parseInt(pitySWInput.value) || 0;
    const acValue = parseInt(pityACInput.value) || 0;
    const awValue = parseInt(pityAWInput.value) || 0;
    
    pitySCHint.textContent = `${PITY_C - scValue} until guarantee`;
    pitySWHint.textContent = `${PITY_W - swValue} until guarantee`;
    pityACHint.textContent = `${PITY_A - acValue} until guarantee`;
    pityAWHint.textContent = `${PITY_A - awValue} until guarantee`;
}

pitySCInput.addEventListener('input', () => { validatePityInput(pitySCInput, PITY_C); updatePityHints(); });
pitySWInput.addEventListener('input', () => { validatePityInput(pitySWInput, PITY_W); updatePityHints(); });
pityACInput.addEventListener('input', () => { validatePityInput(pityACInput, PITY_A); updatePityHints(); });
pityAWInput.addEventListener('input', () => { validatePityInput(pityAWInput, PITY_A); updatePityHints(); });

// Validation error display
function showValidationErrors(errors) {
    validationErrorsDiv.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    validationErrorsDiv.style.display = 'block';
    // Re-trigger animation
    validationErrorsDiv.style.animation = 'none';
    validationErrorsDiv.offsetHeight; // Trigger reflow
    validationErrorsDiv.style.animation = 'shake 0.3s ease-out';
}

function hideValidationErrors() {
    validationErrorsDiv.style.display = 'none';
}

// Main simulation function
function runSimulation() {
    // Disable button during simulation
    simulateBtn.disabled = true;
    simulateBtn.textContent = 'SIMULATING...';

    // Use setTimeout to allow UI to update
    setTimeout(() => {
        try {
            // Build context from inputs
            const polychrome = parseInt(polychromeInput.value) || 0;
            const tapes = parseInt(tapesInput.value) || 0;
            let totalPulls = Math.floor(polychrome / 160) + tapes;

            const includeRefunds = includeRefundsInput.checked;
            if (includeRefunds && totalPulls > 100) {
                totalPulls += Math.floor(totalPulls * REFUND_RATE);
            }

            const context = {
                p: totalPulls,
                c: parseInt(targetCInput.value) || 0,
                w: parseInt(targetWInput.value) || 0,
                pity: [
                    parseInt(pitySCInput.value) || 0,
                    parseInt(pitySWInput.value) || 0,
                    parseInt(pityACInput.value) || 0,
                    parseInt(pityAWInput.value) || 0
                ],
                guarantees: [
                    guaranteeCInput.checked,
                    guaranteeWInput.checked
                ],
                tactic: pullTacticInput.value
            };

            // Validation
            const errors = [];
            if (context.p === 0) {
                errors.push("Please enter your available resources (Polychrome or Tapes)");
            }
            if (context.c === 0 && context.w === 0) {
                errors.push("Please set at least one target (Character or W-Engine)");
            }
            
            if (errors.length > 0) {
                showValidationErrors(errors);
                return;
            }
            
            hideValidationErrors();

            // Run batch simulation using shared core
            const results = runBatchSimulation(context);

            // Display results
            displayResults(context, results, includeRefunds);

        } finally {
            simulateBtn.disabled = false;
            simulateBtn.textContent = 'RUN SIMULATION';
        }
    }, 50);
}

function displayResults(context, results, includeRefunds) {
    const { target, s_limited, s_standard, a_featured, mean, stddev, avgP } = results;
    
    resultsSection.style.display = 'block';

    // Target info
    const targetInfoDiv = document.getElementById('target-info');
    targetInfoDiv.innerHTML = `
        <h4>Target</h4>
        <div class="stat-line">
            <span class="stat-label">Target S-Rank</span>
            <span class="stat-value success">${target}</span>
        </div>
        <div class="stat-line">
            <span class="stat-label">Total Pulls${includeRefunds ? ' <span class="stat-note">(including refunds)</span>' : ''}</span>
            <span class="stat-value">${context.p}</span>
        </div>
    `;

    // S-Limited results
    const sLimitedDiv = document.getElementById('s-limited');
    let sLimitedHtml = '<h4>Featured S-Rank Distribution</h4><div class="distribution-table">';
    const chartData = [];
    const chartLabels = [];
    
    for (const key in s_limited) {
        if (s_limited[key] == 0) continue;
        const percentage = toPercentage(s_limited[key]).trim();
        const isTarget = key === target;
        sLimitedHtml += `<div class="distribution-row${isTarget ? ' target' : ''}">
            <span class="distribution-label">${key}${isTarget ? ' ← TARGET' : ''}</span>
            <span class="distribution-count">${s_limited[key].toLocaleString()}</span>
            <span class="distribution-percent">${percentage}</span>
        </div>`;
        chartLabels.push(key);
        chartData.push(s_limited[key]);
    }
    sLimitedHtml += '</div>';
    sLimitedDiv.innerHTML = sLimitedHtml;

    // S-Standard results
    const sStandardDiv = document.getElementById('s-standard');
    if (showStandardInput.checked) {
        let sStandardHtml = '<h4>Standard S-Rank Distribution</h4><div class="distribution-table">';
        const standardChartLabels = [];
        const standardChartData = [];
        for (const key in s_standard) {
            if (s_standard[key] == 0) continue;
            sStandardHtml += `<div class="distribution-row">
                <span class="distribution-label">${key}</span>
                <span class="distribution-count">${s_standard[key].toLocaleString()}</span>
                <span class="distribution-percent">${toPercentage(s_standard[key]).trim()}</span>
            </div>`;
            standardChartLabels.push(key);
            standardChartData.push(s_standard[key]);
        }
        sStandardHtml += '</div>';
        sStandardDiv.innerHTML = sStandardHtml;
        sStandardDiv.style.display = 'block';
        
        // Show and update standard chart
        standardChartContainer.style.display = 'block';
        updateStandardChart(standardChartLabels, standardChartData);
    } else {
        sStandardDiv.style.display = 'none';
        standardChartContainer.style.display = 'none';
    }

    // A-Featured results (bell curve chart only)
    const aFeaturedDiv = document.getElementById('a-featured');
    aFeaturedDiv.style.display = 'none'; // Hide the text block, use chart instead
    
    if (showARankInput.checked) {
        // Sort keys numerically and build chart data
        const sortedKeys = Object.keys(a_featured).map(Number).sort((a, b) => a - b);
        const arankLabels = sortedKeys.map(k => k.toString());
        const arankData = sortedKeys.map(k => a_featured[k.toString()]);
        
        arankChartContainer.style.display = 'block';
        updateARankChart(arankLabels, arankData);
    } else {
        arankChartContainer.style.display = 'none';
    }

    // Stats
    const statsDiv = document.getElementById('stats');
    statsDiv.innerHTML = `
        <h4>Statistics</h4>
        <div class="stat-line">
            <span class="stat-label">Average pulls executed</span>
            <span class="stat-value success">${avgP}</span>
        </div>
        <div class="stat-line">
            <span class="stat-label">Avg remaining on success</span>
            <span class="stat-value">${mean} pulls</span>
        </div>
        <div class="stat-line">
            <span class="stat-label">Standard deviation</span>
            <span class="stat-value">±${stddev}</span>
        </div>
        <div class="stat-line">
            <span class="stat-label">Expected range</span>
            <span class="stat-value success">${Math.max(avgP - stddev, 0)} - ${Math.min(avgP + stddev, context.p)} pulls</span>
        </div>
    `;

    // Update chart
    updateChart(chartLabels, chartData, target);

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function updateChart(labels, data, target) {
    const ctx = document.getElementById('results-chart').getContext('2d');

    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Generate colors - highlight target
    const colors = labels.map((label, i) => {
        if (label === target) {
            return '#00d4aa';
        }
        // Generate colors in orange/amber range
        const hue = 25 + (i * 15) % 40;
        return `hsl(${hue}, 80%, ${55 + (i * 5) % 20}%)`;
    });

    chartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#1a1a26',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    align: 'center',
                    labels: {
                        color: '#e8e8e8',
                        font: {
                            family: "'Rajdhani', sans-serif",
                            size: 12
                        },
                        padding: 10,
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            const value = tooltipItem.raw;
                            const percentage = ((value / SIMULATIONS) * 100).toFixed(1);
                            return `${tooltipItem.label}: ${percentage}% (${value.toLocaleString()} runs)`;
                        }
                    }
                }
            }
        }
    });
}

function updateStandardChart(labels, data) {
    const ctx = document.getElementById('standard-chart').getContext('2d');

    // Destroy existing chart
    if (standardChartInstance) {
        standardChartInstance.destroy();
    }

    // Generate colors in purple/blue range for standard
    const colors = labels.map((label, i) => {
        const hue = 220 + (i * 20) % 60;
        return `hsl(${hue}, 60%, ${50 + (i * 5) % 20}%)`;
    });

    standardChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#1a1a26',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    align: 'center',
                    labels: {
                        color: '#e8e8e8',
                        font: {
                            family: "'Rajdhani', sans-serif",
                            size: 12
                        },
                        padding: 10,
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            const value = tooltipItem.raw;
                            const percentage = ((value / SIMULATIONS) * 100).toFixed(1);
                            return `${tooltipItem.label}: ${percentage}% (${value.toLocaleString()} runs)`;
                        }
                    }
                }
            }
        }
    });
}

function updateARankChart(labels, data) {
    const ctx = document.getElementById('arank-chart').getContext('2d');

    // Destroy existing chart
    if (arankChartInstance) {
        arankChartInstance.destroy();
    }

    arankChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Featured A-Rank Pulls',
                data: data,
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.2)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            const value = tooltipItem.raw;
                            const percentage = ((value / SIMULATIONS) * 100).toFixed(1);
                            return `${percentage}% (${value.toLocaleString()} runs)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'A-Rank Pulls',
                        color: '#a0a0a0',
                        font: {
                            family: "'Rajdhani', sans-serif",
                            size: 12
                        }
                    },
                    ticks: {
                        color: '#a0a0a0',
                        font: {
                            family: "'Rajdhani', sans-serif"
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency',
                        color: '#a0a0a0',
                        font: {
                            family: "'Rajdhani', sans-serif",
                            size: 12
                        }
                    },
                    ticks: {
                        color: '#a0a0a0',
                        font: {
                            family: "'Rajdhani', sans-serif"
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    }
                }
            }
        }
    });
}

// LocalStorage persistence
const STORAGE_KEY = 'zzz-gacha-simulator-inputs';

function saveInputs() {
    const inputs = {
        polychrome: polychromeInput.value,
        tapes: tapesInput.value,
        targetC: targetCInput.value,
        targetW: targetWInput.value,
        pitySC: pitySCInput.value,
        pitySW: pitySWInput.value,
        pityAC: pityACInput.value,
        pityAW: pityAWInput.value,
        guaranteeC: guaranteeCInput.checked,
        guaranteeW: guaranteeWInput.checked,
        includeRefunds: includeRefundsInput.checked,
        showStandard: showStandardInput.checked,
        showARank: showARankInput.checked,
        pullTactic: pullTacticInput.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
}

function loadInputs() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    
    try {
        const inputs = JSON.parse(saved);
        if (inputs.polychrome !== undefined) polychromeInput.value = inputs.polychrome;
        if (inputs.tapes !== undefined) tapesInput.value = inputs.tapes;
        if (inputs.targetC !== undefined) targetCInput.value = inputs.targetC;
        if (inputs.targetW !== undefined) targetWInput.value = inputs.targetW;
        if (inputs.pitySC !== undefined) pitySCInput.value = inputs.pitySC;
        if (inputs.pitySW !== undefined) pitySWInput.value = inputs.pitySW;
        if (inputs.pityAC !== undefined) pityACInput.value = inputs.pityAC;
        if (inputs.pityAW !== undefined) pityAWInput.value = inputs.pityAW;
        if (inputs.guaranteeC !== undefined) guaranteeCInput.checked = inputs.guaranteeC;
        if (inputs.guaranteeW !== undefined) guaranteeWInput.checked = inputs.guaranteeW;
        if (inputs.includeRefunds !== undefined) includeRefundsInput.checked = inputs.includeRefunds;
        if (inputs.showStandard !== undefined) showStandardInput.checked = inputs.showStandard;
        if (inputs.showARank !== undefined) showARankInput.checked = inputs.showARank;
        if (inputs.pullTactic !== undefined) pullTacticInput.value = inputs.pullTactic;
    } catch (e) {
        console.warn('Failed to load saved inputs:', e);
    }
}

// Sync custom dropdowns with loaded values
function syncCustomDropdowns() {
    if (targetCDropdown && targetCInput.value) {
        targetCDropdown.setValue(targetCInput.value);
    }
    if (targetWDropdown && targetWInput.value) {
        targetWDropdown.setValue(targetWInput.value);
    }
    if (tacticDropdown && pullTacticInput.value) {
        tacticDropdown.setValue(pullTacticInput.value);
    }
}

// Event listener for simulate button
simulateBtn.addEventListener('click', () => {
    saveInputs();
    runSimulation();
});

// Initialize
loadInputs();
initCustomDropdowns();
syncCustomDropdowns();
updateTotalPulls();
updatePityHints();
updateTacticVisibility();
