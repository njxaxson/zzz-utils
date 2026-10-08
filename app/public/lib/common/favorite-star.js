/**
 * The star on a team card, and the in-memory favorites list every star reads.
 *
 * Cards are rebuilt as HTML strings on every filter or page change, so a star carries its team
 * in `data-team` and one delegated listener per results container handles the clicks.
 */

import {
    resolveTeam, FAVORITES_CAP, FAVORITES_STORAGE_KEY, loadFavorites, saveFavorites, isFavorite, toggleFavorite
} from './favorites.js';

const CHANGE_EVENT = 'favorites-changed';
const TOAST_MS = 4000;

let favorites = loadFavorites();
let toastTimer = null;

export function getFavorites() {
    return favorites;
}

/** Replaces the list, saves it, and refreshes every star on the page. */
export function setFavorites(teams) {
    favorites = teams;
    saveFavorites(favorites);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

const idsOf = team => team.map(member => member.id ?? member);

// An SVG, not a ★ character: font glyphs sit off-centre in their line box and misalign with labels.
const STAR_PATH = 'M12.00 2.40 L14.53 9.12 L21.70 9.45 L16.09 13.93 L18.00 20.85 L12.00 16.90 L6.00 20.85 L7.91 13.93 L2.30 9.45 L9.47 9.12Z';
const starSvg = on =>
    `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-miterlimit="10"><path d="${STAR_PATH}"/></svg>`;

function starState(ids) {
    return isFavorite(favorites, ids)
        ? { on: true, icon: starSvg(true), label: 'Remove team from favorites' }
        : { on: false, icon: starSvg(false), label: 'Save team to favorites' };
}

/** `team` is units or ids. */
export function favoriteStarHtml(team) {
    const ids = idsOf(team);
    const { on, icon, label } = starState(ids);
    return `<button type="button" class="fav-star" data-team="${ids.join('|')}" aria-pressed="${on}" aria-label="${label}" title="${label}">${icon}</button>`;
}

/**
 * Tiles for a result team, with the star overlaid on the third one. The overlay is what phones
 * show; wider layouts hide it and use the page's own star placement.
 */
export function teamTilesHtml(team, createCard) {
    return team.map((unit, i) => createCard(unit, {
        extraHtml: i === 2 ? `<span class="fav-tile-star">${favoriteStarHtml(team)}</span>` : ''
    })).join('');
}

function refreshStars() {
    for (const star of document.querySelectorAll('.fav-star')) {
        const { on, icon, label } = starState(star.dataset.team.split('|'));
        star.setAttribute('aria-pressed', String(on));
        star.setAttribute('aria-label', label);
        star.title = label;
        star.innerHTML = icon;
    }
}

export function showToast(text, { actionLabel = null, onAction = null } = {}) {
    document.querySelector('.fav-toast')?.remove();
    clearTimeout(toastTimer);

    const toast = document.createElement('div');
    toast.className = 'fav-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    if (actionLabel) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = actionLabel;
        button.addEventListener('click', () => { toast.remove(); onAction?.(); });
        toast.append(button);
    }
    document.body.append(toast);
    toastTimer = setTimeout(() => toast.remove(), TOAST_MS);
}

/** Toggles a team from a star click. Returns false when the list is full. */
export function toggleTeam(ids) {
    const result = toggleFavorite(favorites, ids);
    if (result.full) {
        showToast(`You can keep ${FAVORITES_CAP} favorites. Remove one on the Favorites page first.`);
        return false;
    }
    setFavorites(result.teams);
    return true;
}

/** Saved teams as agent-picker presets; a team with a removed agent cannot fill three slots, so it is left out. */
export function getFavoritePresets(allUnits) {
    return favorites
        .map(ids => ({ ids, ...resolveTeam(ids, allUnits) }))
        .filter(team => team.missing.length === 0)
        .map(team => ({ ids: team.ids, title: team.units.map(u => u.name).join(' / ') }));
}

export function bindFavoriteStars(container) {
    container.addEventListener('click', event => {
        const star = event.target.closest('.fav-star');
        if (star && container.contains(star)) toggleTeam(star.dataset.team.split('|'));
    });
}

window.addEventListener(CHANGE_EVENT, refreshStars);
window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== FAVORITES_STORAGE_KEY) return;
    favorites = loadFavorites();
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
});
