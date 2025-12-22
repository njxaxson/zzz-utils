// ZZZ Gacha Simulator - Client-side Logic
// Ported from simulation.js

// Constants
const SIMULATIONS = 100000.0;
const RATE_S = 0.006;
const RATE_A = 0.072;
const PITY_C = 90;
const PITY_W = 80;
const PITY_A = 10;
const CFEATURED = 0.5;
const WFEATURED = 0.75;
const REFUND_RATE = 0.043;
const RESULT_FEATURED_S = 4;
const RESULT_STANDARD_S = 3;
const RESULT_FEATURED_A = 2;
const RESULT_STANDARD_A = 1;
const RESULT_NOTHING = 0;

// Tracking for average calculations
let caverage = {
    pulls: 0,
    wins: 0
};

function cpull(state) {
    state.cpity++;
    const roll = Math.random();
    if (state.cpity >= PITY_C || roll < RATE_S) {
        caverage.pulls += state.cpity;
        caverage.wins++;
        state.cpity = 0;
        if (state.cguaranteed || Math.random() < CFEATURED) {
            state.cguaranteed = false;
            return RESULT_FEATURED_S;
        }
        //otherwise
        state.cguaranteed = true;
        return RESULT_STANDARD_S;
    } else
    if (state.apity >= PITY_A || roll < RATE_S + RATE_A) {
        state.apity = 0;
        if (state.aguaranteed || Math.random() < CFEATURED) {
            state.aguaranteed = false;
            return RESULT_FEATURED_A;
        }
        //otherwise
        state.aguaranteed = true;
        return RESULT_STANDARD_A;
    }
    //otherwise
    return RESULT_NOTHING;
}

function wpull(state) {
    state.wpity++;
    const roll = Math.random();
    if (state.wpity >= PITY_W || roll < RATE_S) {
        state.wpity = 0;
        if (state.wguaranteed || Math.random() < WFEATURED) {
            state.wguaranteed = false;
            return RESULT_FEATURED_S;
        }
        //otherwise
        state.wguaranteed = true;
        return RESULT_STANDARD_S;
    } else
    if (state.epity >= PITY_A || roll < RATE_S + RATE_A) {
        state.epity = 0;
        if (state.eguaranteed || Math.random() < WFEATURED) {
            state.eguaranteed = false;
            return RESULT_FEATURED_A;
        }
        //otherwise
        state.eguaranteed = true;
        return RESULT_STANDARD_A;
    }
    //otherwise
    return RESULT_NOTHING;
}

function simulate(context) {
    let state = {
        cpity: context.pity && context.pity.length > 0 && context.pity[0] ? context.pity[0] : 0,
        wpity: context.pity && context.pity.length > 1 && context.pity[1] ? context.pity[1] : 0,
        apity: context.pity && context.pity.length > 2 && context.pity[2] ? context.pity[2] : 0,
        epity: context.pity && context.pity.length > 3 && context.pity[3] ? context.pity[3] : 0,
        cguaranteed: context.guarantees && context.guarantees.length > 0 && context.guarantees[0],
        wguaranteed: context.guarantees && context.guarantees.length > 1 && context.guarantees[1],
        aguaranteed: context.guarantees && context.guarantees.length > 2 && context.guarantees[2],
        eguaranteed: context.guarantees && context.guarantees.length > 3 && context.guarantees[3]
    };
    let results = {
        fc: 0,
        fw: 0,
        sc: 0,
        sw: 0,
        fa: 0,
        sa: 0,
        fe: 0,
        se: 0
    };
    let pulls = context.p;
    //Minimum success 1
    while (context.c > 0 && pulls > 0 && results.fc == 0) {
        pulls--;
        const result = cpull(state);
        ctally(result, results);
    }
    while (context.w > 0 && pulls > 0 && results.fw == 0) {
        pulls--;
        const result = wpull(state);
        wtally(result, results);
    }
    //Extra successes
    while (results.fc < context.c && pulls > 0) {
        pulls--;
        const result = cpull(state);
        ctally(result, results);
    }
    while (results.fw < context.w && pulls > 0) {
        pulls--;
        const result = wpull(state);
        wtally(result, results);
    }
    results.p = pulls;
    return results;
}

function ctally(result, results) {
    if (result == RESULT_FEATURED_S) results.fc++; else
    if (result == RESULT_STANDARD_S) results.sc++; else
    if (result == RESULT_FEATURED_A) results.fa++; else
    if (result == RESULT_STANDARD_A) results.sa++;
}

function wtally(result, results) {
    if (result == RESULT_FEATURED_S) results.fw++; else
    if (result == RESULT_STANDARD_S) results.sw++; else
    if (result == RESULT_FEATURED_A) results.fe++; else
    if (result == RESULT_STANDARD_A) results.se++;
}

function toLabel(c, w) {
    const label = (c == 0) ? "MxW" + w : "M" + Math.min(c - 1, 6) + "W" + Math.min(w, 5);
    return label == "MxW0" ? "None" : label;
}

function toPercentage(n, d) {
    if (d === undefined) d = SIMULATIONS;
    const ratio = n / d;
    const adjusted = Math.round(ratio * 1000) / 10;
    const percent = adjusted.toFixed(1).toString() + "%";
    return percent.padStart(6);
}

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
const simulateBtn = document.getElementById('simulate-btn');
const resultsSection = document.getElementById('results-section');
const standardChartContainer = document.getElementById('standard-chart-container');
const arankChartContainer = document.getElementById('arank-chart-container');
const validationErrorsDiv = document.getElementById('validation-errors');

let chartInstance = null;
let standardChartInstance = null;
let arankChartInstance = null;

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
    
    pitySCHint.textContent = `${90 - scValue} until guarantee`;
    pitySWHint.textContent = `${80 - swValue} until guarantee`;
    pityACHint.textContent = `${10 - acValue} until guarantee`;
    pityAWHint.textContent = `${10 - awValue} until guarantee`;
}

pitySCInput.addEventListener('input', () => { validatePityInput(pitySCInput, 90); updatePityHints(); });
pitySWInput.addEventListener('input', () => { validatePityInput(pitySWInput, 80); updatePityHints(); });
pityACInput.addEventListener('input', () => { validatePityInput(pityACInput, 10); updatePityHints(); });
pityAWInput.addEventListener('input', () => { validatePityInput(pityAWInput, 10); updatePityHints(); });

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
            // Reset caverage
            caverage = { pulls: 0, wins: 0 };

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
                ]
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

            // Prepare keys
            const s_limited = {}, s_standard = {}, a_featured = {};
            for (let w = 0; w <= context.w; w++) {
                for (let c = 0; c <= context.c; c++) {
                    s_limited[toLabel(c, w)] = 0;
                    s_standard[toLabel(c, w)] = 0;
                }
            }

            // Run simulations
            const target = toLabel(context.c, context.w);
            let totalPullsUsed = 0;
            let remaining = 0;
            let set = [];

            for (let i = 0, n = SIMULATIONS; i < n; i++) {
                const result = simulate(context);
                s_limited[toLabel(result.fc, result.fw)]++;
                s_standard[toLabel(result.sc, result.sw)]++;
                if (result.fa.toString() in a_featured) {
                    a_featured[result.fa.toString()]++;
                } else {
                    a_featured[result.fa.toString()] = 1;
                }
                remaining += result.p;
                totalPullsUsed += context.p - result.p;
                if (result.p > 0) set.push(result.p);
            }

            let mean = remaining / s_limited[target];
            set = set.map(k => (k - mean) ** 2);
            const squaresum = set.reduce((sum, item) => sum + item, 0);
            const variance = squaresum / set.length;
            let stddev = Math.sqrt(variance);
            mean = Math.round(mean);
            stddev = Math.round(stddev);

            // Display results
            displayResults(context, s_limited, s_standard, a_featured, target, totalPullsUsed, mean, stddev, includeRefunds);

        } finally {
            simulateBtn.disabled = false;
            simulateBtn.textContent = 'RUN SIMULATION';
        }
    }, 50);
}

function displayResults(context, s_limited, s_standard, a_featured, target, totalPullsUsed, mean, stddev, includeRefunds) {
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
    const avgP = Math.ceil(totalPullsUsed / SIMULATIONS);
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
        showARank: showARankInput.checked
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
    } catch (e) {
        console.warn('Failed to load saved inputs:', e);
    }
}

// Event listener for simulate button
simulateBtn.addEventListener('click', () => {
    saveInputs();
    runSimulation();
});

// Initialize
loadInputs();
updateTotalPulls();
updatePityHints();

