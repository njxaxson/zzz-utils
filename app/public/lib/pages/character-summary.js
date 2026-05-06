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
    ];
    
    // Add Sub-DPS tag if present in pseudoRole
    const pseudoRoles = unit.mechanics?.pseudoRole ? unit.mechanics.pseudoRole.split(',').map(r => r.trim()) : [];
    if (pseudoRoles.includes('subdps')) {
        tags.push(`<span class="char-tag">Sub-DPS</span>`);
    }
    
    const tagsHtml = tags.join('');

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
        <div class="char-tags">${tagsHtml}</div>${abilityHtml}${synergyHtml}
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
    const mechanics = unit.mechanics || {};
    
    // Check for non-subdps pseudoRoles
    const pseudoRoles = mechanics.pseudoRole ? mechanics.pseudoRole.split(',').map(r => r.trim()) : [];
    const nonSubDPSRoles = pseudoRoles.filter(r => r !== 'subdps');

    // Pseudo-role line (non-subdps roles only, subdps is shown as a tag)
    if (nonSubDPSRoles.length > 0) {
        const roleText = nonSubDPSRoles.map(r => cap(r)).join(', ');
        parts.push(`<span class="mech-label">Pseudo-role:</span> ${roleText}`);
    }

    // Buffs
    const buffs = [];
    if (mechanics.buffs) {
        if (mechanics.buffs.atk) buffs.push(formatMechanic('Attack', mechanics.buffs.atk));
        if (mechanics.buffs.anomaly) buffs.push(formatMechanic('Anomaly Buildup', mechanics.buffs.anomaly));
        if (mechanics.buffs.ap) buffs.push(formatMechanic('Anomaly Proficiency', mechanics.buffs.ap));
        if (mechanics.buffs.am) buffs.push(formatMechanic('Anomaly Mastery', mechanics.buffs.am));
        if (mechanics.buffs.aftershock) buffs.push(formatMechanic('Aftershock', mechanics.buffs.aftershock));
        if (mechanics.buffs.abloom) buffs.push(formatMechanic('Abloom', mechanics.buffs.abloom));
        if (mechanics.buffs.chain) buffs.push(formatMechanic('Chain Attacks', mechanics.buffs.chain));
        if (mechanics.buffs.sheer) buffs.push(formatMechanic('Sheer Damage', mechanics.buffs.sheer));
        if (mechanics.buffs.pen) buffs.push(formatMechanic('PEN', mechanics.buffs.pen));
        if (mechanics.buffs['stun-multiplier']) buffs.push(formatMechanic('Stun Multiplier', mechanics.buffs['stun-multiplier']));
        if (mechanics.buffs.cr) buffs.push(formatMechanic('Crit Rate', mechanics.buffs.cr));
        if (mechanics.buffs.cd) buffs.push(formatMechanic('Crit Damage', mechanics.buffs.cd));
        if (mechanics.buffs.disorders) buffs.push(formatMechanic('Disorders', mechanics.buffs.disorders));
        
        // Elemental buffs
        if (mechanics.buffs.ice) buffs.push(formatElementalMechanic('Ice Damage', mechanics.buffs.ice, 'ice'));
        if (mechanics.buffs.fire) buffs.push(formatElementalMechanic('Fire Damage', mechanics.buffs.fire, 'fire'));
        if (mechanics.buffs.electric) buffs.push(formatElementalMechanic('Electric Damage', mechanics.buffs.electric, 'electric'));
        if (mechanics.buffs.ether) buffs.push(formatElementalMechanic('Ether Damage', mechanics.buffs.ether, 'ether'));
        if (mechanics.buffs.physical) buffs.push(formatElementalMechanic('Physical Damage', mechanics.buffs.physical, 'physical'));
    }
    if (buffs.length > 0) {
        parts.push(`<span class="mech-label">Buffs:</span> ${buffs.join(', ')}`);
    }

    // Debuffs
    const debuffs = [];
    if (mechanics.debuffs) {
        if (mechanics.debuffs.defense) debuffs.push(formatMechanic('Defense Shred', mechanics.debuffs.defense));
        if (mechanics.debuffs.recovery) debuffs.push(formatMechanic('Delayed Stun Recovery', mechanics.debuffs.recovery));
        
        // Elemental debuffs
        if (mechanics.debuffs.ice) debuffs.push(formatElementalMechanic('Ice Defense Shred', mechanics.debuffs.ice, 'ice'));
        if (mechanics.debuffs.fire) debuffs.push(formatElementalMechanic('Fire Defense Shred', mechanics.debuffs.fire, 'fire'));
        if (mechanics.debuffs.electric) debuffs.push(formatElementalMechanic('Electric Defense Shred', mechanics.debuffs.electric, 'electric'));
        if (mechanics.debuffs.ether) debuffs.push(formatElementalMechanic('Ether Defense Shred', mechanics.debuffs.ether, 'ether'));
        if (mechanics.debuffs.physical) debuffs.push(formatElementalMechanic('Physical Defense Shred', mechanics.debuffs.physical, 'physical'));
    }
    if (debuffs.length > 0) {
        parts.push(`<span class="mech-label">Debuffs:</span> ${debuffs.join(', ')}`);
    }

    // Kit (damage types + utility merged)
    const kitItems = [];
    
    // Damage types
    if (mechanics.damage) {
        if (mechanics.damage.polarity) kitItems.push(formatMechanic('Polarities', mechanics.damage.polarity));
        if (mechanics.damage.abloom) kitItems.push(formatMechanic('Abloom', mechanics.damage.abloom));
        if (mechanics.damage.aftershock) kitItems.push(formatMechanic('Aftershock', mechanics.damage.aftershock));
        if (mechanics.damage.totalize) kitItems.push(formatMechanic('Totalize', mechanics.damage.totalize));
        const chainVal = normalizeValue(mechanics.damage.chain);
        if (chainVal > 1) kitItems.push(formatMechanic('Chain Attacks', mechanics.damage.chain));
    }
    
    // Utility
    if (mechanics.utility) {
        const ultimatesVal = normalizeValue(mechanics.utility.ultimates);
        if (ultimatesVal === 3) {
            kitItems.push(formatMechanic('Generates Ultimates', mechanics.utility.ultimates));
        } else if (ultimatesVal >= 1) {
            kitItems.push(formatMechanic('Generates Decibels', mechanics.utility.ultimates));
        }
        
        const quickAssistsVal = normalizeValue(mechanics.utility['quick-assists']);
        if (quickAssistsVal >= 2) kitItems.push(formatMechanic('Quick-Assists', mechanics.utility['quick-assists']));
        
        const chainsVal = normalizeValue(mechanics.utility.chains);
        if (chainsVal >= 2) kitItems.push(formatMechanic('Chain Attacks', mechanics.utility.chains));
        
        if (mechanics.utility.shields) kitItems.push(formatMechanic('Shields', mechanics.utility.shields));
        if (mechanics.utility['heal:team']) kitItems.push(formatMechanic('Team Healing', mechanics.utility['heal:team']));
        if (mechanics.utility.kaleidoscope) kitItems.push(formatMechanic('Kaleidoscope', mechanics.utility.kaleidoscope));
        if (mechanics.utility.veils) kitItems.push(formatMechanic('Ether Veils', mechanics.utility.veils));
    }
    
    if (kitItems.length > 0) {
        parts.push(`<span class="mech-label">Kit:</span> ${kitItems.join('; ')}`);
    }

    // Scaling
    const scaling = [];
    if (mechanics.scaling) {
        if (mechanics.scaling.disorders) scaling.push('Disorders');
        if (mechanics.scaling.veils) scaling.push('Ether Veils');
    }
    if (scaling.length > 0) {
        parts.push(`<span class="mech-label">Scales with:</span> ${scaling.join(', ')}`);
    }

    // Synergy text (from synergy block)
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
        <div class="char-synergy">${parts.join('<br>')}</div>`;
}

function normalizeValue(val) {
    if (val === true) return 1;
    if (typeof val === 'number') return val;
    return 0;
}

function formatMechanic(name, value) {
    const val = normalizeValue(value);
    if (val === 3) {
        return `<strong>${name}</strong>`;
    }
    return name;
}

function formatElementalMechanic(name, value, element) {
    const val = normalizeValue(value);
    const colorClass = `element-${element}`;
    if (val === 3) {
        return `<strong><span class="${colorClass}">${name}</span></strong>`;
    }
    return `<span class="${colorClass}">${name}</span>`;
}

function cap(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
