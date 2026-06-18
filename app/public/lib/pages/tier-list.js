/**
 * Tier List Page
 * Renders agents in a grid: columns = DPS / Stun / Support, rows = tier levels.
 */

import { ELEMENTS, DPS_ROLES } from '../common/constants.js';

const TIERS = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4'];

const COLUMNS = [
    { id: 'dps', label: 'DPS', matchFn: unit => hasRole(unit, DPS_ROLES) },
    { id: 'stun', label: 'Stun', matchFn: unit => hasRole(unit, ['stun']) },
    { id: 'support', label: 'Support', matchFn: unit => hasRole(unit, ['support', 'defense']) }
];

function hasRole(unit, roles) {
    return unit.tags.some(tag => roles.includes(tag));
}

function getUnitElement(unit) {
    return unit.tags.find(tag => ELEMENTS.includes(tag)) || 'unknown';
}

function getInitials(name) {
    return name.split(/[\s-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function createTierCard(unit) {
    const element = getUnitElement(unit);
    const imageUrl = unit.image || null;
    const initials = getInitials(unit.name);

    const avatarHtml = imageUrl
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;

    return `
        <div class="unit-card element-${element}" title="${unit.name}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
        </div>
    `;
}

function renderTierList(units) {
    const available = units.filter(u => u.available !== false);
    const grid = document.getElementById('tier-list-grid');

    const headerRow = `
        <div class="tier-list-header tier-label-cell"></div>
        ${COLUMNS.map(col => `<div class="tier-list-header">${col.label}</div>`).join('')}
    `;

    const rows = TIERS.map(tier => {
        const tierUnits = available.filter(u => String(u.tier) === tier);
        if (tierUnits.length === 0) return '';

        const tierLabel = `<div class="tier-label-cell"><span class="tier-label" data-tier="${tier}">T${tier}</span></div>`;

        const cells = COLUMNS.map((col, idx) => {
            const cellUnits = tierUnits
                .filter(col.matchFn)
                .sort((a, b) => a.name.localeCompare(b.name));
            return `<div class="tier-cell" data-col="${idx}">${cellUnits.map(createTierCard).join('')}</div>`;
        }).join('');

        return `<div class="tier-row" data-tier="${tier}">${tierLabel}${cells}</div>`;
    }).join('');

    grid.innerHTML = headerRow + rows;
}

async function init() {
    const response = await fetch('./data/units.json');
    const units = await response.json();
    renderTierList(units);
}

init();
