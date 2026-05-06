import { getElement, isSRank, isLimited, isARank } from '../common/team-scorer.js';
import { ELEMENTS } from '../common/constants.js';

let allUnits = [];
let filters = { rank: [], element: [], role: [], faction: [], tier: [], owned: false };

const FILTERS_STORAGE_KEY = 'zzz-char-summary-filters';
const ROSTER_STORAGE_KEY = 'zzz-roster';
const ROLES = ['attack', 'stun', 'anomaly', 'support', 'defense', 'rupture'];



let ownedUnitIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('./data/units.json');
        allUnits = await response.json();
        loadRoster();
        loadFilters();
        populateFactionFilters();
        populateTierFilters();
        applyFiltersToUI();
        setupEventListeners();
        renderGrid();
    } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('character-grid').innerHTML =
            '<div class="no-results-msg">Failed to load character data.</div>';
    }
});

// ============================================================================
// ROSTER
// ============================================================================

function loadRoster() {
    try {
        const saved = localStorage.getItem(ROSTER_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.unitStates) {
                for (const [id, state] of Object.entries(data.unitStates)) {
                    if (state.owned) ownedUnitIds.add(id);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load roster:', e);
    }

    const toggle = document.getElementById('owned-toggle');
    if (toggle) {
        toggle.disabled = ownedUnitIds.size === 0;
        if (ownedUnitIds.size === 0) {
            const hint = document.getElementById('owned-hint');
            if (hint) hint.textContent = 'No roster saved yet — set one up on another page first.';
        }
    }
}

// ============================================================================
// FILTER PERSISTENCE
// ============================================================================

function saveFilters() {
    try {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
        console.warn('Failed to save filters:', e);
    }
}

function loadFilters() {
    try {
        const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            filters = { ...filters, ...data };
        }
    } catch (e) {
        console.warn('Failed to load filters:', e);
    }
}


function applyFiltersToUI() {
    // Multi-dropdowns
    document.querySelectorAll('.multi-dropdown').forEach(dropdown => {
        const key = dropdown.dataset.filter;
        const values = filters[key];
        if (!Array.isArray(values)) return;

        dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = values.includes(cb.value);
        });

        const textEl = dropdown.querySelector('.dropdown-text');
        const label = key === 'tier' ? 'Any Tier' : `Any ${cap(key)}`;
        textEl.textContent = values.length === 0 ? label
            : values.length <= 2 ? values.map(val => key === 'tier' ? `Tier ${val}` : cap(val)).join(', ')
            : `${values.length} selected`;
    });

    // Owned toggle
    const toggle = document.getElementById('owned-toggle');
    if (toggle) toggle.checked = filters.owned;
}

// ============================================================================
// FILTERS
// ============================================================================

function populateFactionFilters() {
    const container = document.getElementById('faction-menu');
    const factions = [...new Set(allUnits.map(u => u.faction).filter(Boolean))].sort();
    container.innerHTML = factions.map(f =>
        `<label class="dropdown-item"><input type="checkbox" value="${f}"> <span>${f}</span></label>`
    ).join('');
}

function populateTierFilters() {
    const container = document.getElementById('tier-menu');
    const tiers = [...new Set(allUnits.map(u => u.tier).filter(t => t !== undefined))].sort((a, b) => a - b);
    container.innerHTML = tiers.map(t =>
        `<label class="dropdown-item"><input type="checkbox" value="${t}"> <span>Tier ${t}</span></label>`
    ).join('');
}

function setupEventListeners() {
    document.querySelectorAll('.multi-dropdown').forEach(dropdown => {
        dropdown.querySelector('.dropdown-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const wasOpen = dropdown.classList.contains('open');
            document.querySelectorAll('.multi-dropdown.open').forEach(dd => dd.classList.remove('open'));
            if (!wasOpen) dropdown.classList.add('open');
        });
        dropdown.querySelector('.dropdown-menu').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') onFilterChange(dropdown);
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-dropdown'))
            document.querySelectorAll('.multi-dropdown.open').forEach(dd => dd.classList.remove('open'));
    });

    const toggle = document.getElementById('owned-toggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            filters.owned = toggle.checked;
            saveFilters();
            renderGrid();
        });
    }

    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFilters);
    }
}

function clearAllFilters() {
    filters = { rank: [], element: [], role: [], faction: [], tier: [], owned: false };
    document.querySelectorAll('.multi-dropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('.multi-dropdown').forEach(dropdown => {
        const key = dropdown.dataset.filter;
        const label = key === 'tier' ? 'Any Tier' : `Any ${cap(key)}`;
        dropdown.querySelector('.dropdown-text').textContent = label;
    });
    const toggle = document.getElementById('owned-toggle');
    if (toggle) toggle.checked = false;
    saveFilters();
    renderGrid();
}

function onFilterChange(dropdown) {
    const key = dropdown.dataset.filter;
    filters[key] = Array.from(dropdown.querySelectorAll('input:checked')).map(cb => cb.value);
    const textEl = dropdown.querySelector('.dropdown-text');
    const v = filters[key];
    const label = key === 'tier' ? 'Any Tier' : `Any ${cap(key)}`;
    textEl.textContent = v.length === 0 ? label
        : v.length <= 2 ? v.map(val => key === 'tier' ? `Tier ${val}` : cap(val)).join(', ')
        : `${v.length} selected`;
    saveFilters();
    renderGrid();
}

// ============================================================================
// RENDERING
// ============================================================================

function renderGrid() {
    const grid = document.getElementById('character-grid');

    const filtered = allUnits.filter(unit => {
        if (filters.owned && !ownedUnitIds.has(unit.id)) return false;
        if (filters.rank.length > 0) {
            let ok = false;
            if (filters.rank.includes('limited-s') && isSRank(unit) && isLimited(unit)) ok = true;
            if (filters.rank.includes('standard-s') && isSRank(unit) && !isLimited(unit)) ok = true;
            if (filters.rank.includes('a-rank') && isARank(unit)) ok = true;
            if (!ok) return false;
        }
        if (filters.element.length > 0 && !filters.element.includes(getElement(unit))) return false;
        if (filters.role.length > 0 && !filters.role.some(r => unit.tags.includes(r))) return false;
        if (filters.faction.length > 0 && !filters.faction.includes(unit.faction)) return false;
        if (filters.tier.length > 0) {
            const unitTier = unit.tier !== undefined ? String(unit.tier) : '';
            if (!filters.tier.includes(unitTier)) return false;
        }
        return true;
    });

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('summary-count').innerHTML =
        `Showing <span class="count-num">${filtered.length}</span> of ${allUnits.length} characters`;

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="no-results-msg">No characters match the selected filters.</div>';
        return;
    }
    grid.innerHTML = filtered.map(buildCard).join('');
}

function buildCard(unit) {
    const element = getElement(unit);
    const role = ROLES.find(r => unit.tags.includes(r));
    const assist = unit.tags.includes('assist:defensive') ? 'Defensive Assist' : 'Evasive Assist';
    const faction = unit.faction || 'Unknown';
    const tier = unit.tier !== undefined ? unit.tier : '?';
    const isTitled = unit.tags.includes('title');

    let rankHtml;
    if (isSRank(unit)) {
        const q = isLimited(unit) ? '(Limited)' : '(Standard)';
        rankHtml = `<span class="rank-s">S</span> ${q}`;
    } else {
        rankHtml = `<span class="rank-a">A</span>`;
    }

    let tierClass = 'tier-low';
    if (tier <= 0) tierClass = 'tier-elite';
    else if (tier <= 0.5) tierClass = 'tier-top';
    else if (tier <= 1.5) tierClass = 'tier-good';
    else if (tier <= 2) tierClass = 'tier-mid';

    const tags = [
        `<span class="char-tag element-${element}">${element}</span>`,
        `<span class="char-tag">${role}</span>`,
        `<span class="char-tag">${assist}</span>`
    ].join('');

    const abilityHtml = buildAbilityLine(unit);
    const synergyHtml = buildSynergyLine(unit);
    const titledBadge = isTitled ? '<span class="titled-badge">VH/GM</span>' : '';
    const isPreview = unit.available === false;

    const img = unit.image || './assets/placeholder.png';

    const avatarHtml = isPreview
        ? `<div class="char-avatar-wrap"><img class="char-avatar" src="${img}" alt="${unit.name}" onerror="this.src='./assets/placeholder.png'"><span class="avatar-preview-badge">Preview</span></div>`
        : `<img class="char-avatar" src="${img}" alt="${unit.name}" onerror="this.src='./assets/placeholder.png'">`;

    return `<div class="char-card element-${element}${isTitled ? ' titled' : ''}">
    <div class="char-card-header">
        ${avatarHtml}
        <div class="char-identity">
            <div class="char-name-row">
                <h4 class="char-name">${unit.name}</h4>
                ${titledBadge}
            </div>
            <div class="char-subtitle">${rankHtml} · ${faction}</div>
        </div>
        <div class="tier-indicator ${tierClass}">T${tier}</div>
    </div>
    <div class="char-card-body">
        <div class="char-tags">${tags}</div>${abilityHtml}${synergyHtml}
    </div>
</div>`;
}

function buildAbilityLine(unit) {
    if (!unit.join) return '';

    const reqs = unit.join.map(j => {
        if (j === 'faction') return unit.faction;
        if (j === 'assist:defensive') return 'Defensive Assist';
        if (j === 'assist:evasive') return 'Evasive Assist';
        return cap(j);
    });

    const reqsHtml = reqs.map(r => `<span class="req">${r}</span>`).join(' / ');

    return `
        <div class="char-ability-line">
            <span class="ability-label">Teammates:</span>
            <span class="ability-reqs">${reqsHtml}</span>
        </div>`;
}

function buildSynergyLine(unit) {
    const parts = [];
    const isSubDPS = unit.synergy?.tags?.includes('subdps');

    if (isSubDPS) {
        parts.push('<strong>Sub-DPS.</strong>');
    }

    if (unit.synergy) {
        const { units, tags } = unit.synergy;

        const archetypeTags = (tags || []).filter(t =>
            !ELEMENTS.includes(t) && t !== 'subdps' && t !== 'stunless'
        );
        const unitNames = (units && units.length > 0) ? units.map(u => cap(u)).join(', ') : null;
        const archDescriptions = archetypeTags.map(t => `${cap(t)} agents`);

        if (unitNames || archDescriptions.length > 0) {
            const allParts = [];
            if (unitNames) {
                const trailing = archDescriptions.length > 0 ? ',' : '.';
                allParts.push(`<span class="unit-ref">${unitNames}${trailing}</span>`);
            }
            if (archDescriptions.length > 0) {
                allParts.push(archDescriptions.join(', ') + '.');
            }
            parts.push(`Works well with ${allParts.join(' ')}`);
        }
    }

    if (parts.length === 0) return '';

    return `
        <div class="char-synergy">${parts.join(' ')}</div>`;
}

function cap(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
