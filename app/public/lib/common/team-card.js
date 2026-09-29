/**
 * Shared unit-card markup for team results.
 */

import { getInitials, getUnitElement, getCharacterImageUrl } from './roster-ui.js';

/**
 * One unit portrait with name. `className` picks the page's card style
 * (`result-unit-card`, `team-unit`, ...).
 */
export function createUnitCard(unit, { className = 'result-unit-card' } = {}) {
    const element = getUnitElement(unit);
    const initials = getInitials(unit.name);
    const imageUrl = getCharacterImageUrl(unit.id);

    // Use image if available, fallback to initials
    const avatarHtml = imageUrl
        ? `<img class="unit-avatar" src="${imageUrl}" alt="${unit.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="unit-initials" style="display:none">${initials}</span>`
        : `<span class="unit-initials">${initials}</span>`;

    return `
        <div class="${className} element-${element}" title="${unit.name}">
            ${avatarHtml}
            <span class="unit-name">${unit.name}</span>
        </div>
    `;
}

// CSS class for a boss tile's weakness colouring, e.g. `weakness-ether-ice`.
export function getWeaknessGradientClass(weaknesses) {
    // Element variants ('ice:frost') colour as their base element.
    weaknesses = [...new Set((weaknesses || []).map(w => w.split(':')[0]))];
    if (weaknesses.length === 0) {
        return 'weakness-physical'; // default fallback
    }
    
    if (weaknesses.length === 1) {
        return `weakness-${weaknesses[0]}`;
    }
    
    // For two weaknesses, sort alphabetically to match CSS class naming
    const sorted = [...weaknesses].sort();
    return `weakness-${sorted[0]}-${sorted[1]}`;
}
