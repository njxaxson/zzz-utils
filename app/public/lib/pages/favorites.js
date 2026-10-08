/**
 * Favorites page: the player's saved teams, or a shared list (`?teams=`) shown read-only.
 * A shared list is never written to storage on load; "Add all" or its stars are the only way in.
 */

import { initRoster, getUnitStates, getAllUnits } from '../common/roster-ui.js';
import { createUnitCard } from '../common/team-card.js';
import { getTeamDpsBuckets, getPrimaryDpsNames } from '../common/dps-buckets.js';
import { copyToClipboard } from '../common/roster-share.js';
import { createAgentPicker } from '../common/agent-picker.js';
import {
    FAVORITES_CAP, TEAM_SIZE, teamKey, isFavorite, addMany, encodeFavorites, decodeFavorites, resolveTeam
} from '../common/favorites.js';
import { getFavorites, setFavorites, showToast, favoriteStarHtml, toggleTeam } from '../common/favorite-star.js';

const params = new URLSearchParams(window.location.search);
const sharedTeams = params.has('teams') ? decodeFavorites(params.get('teams')) : null;

const isOwned = id => !!getUnitStates()[id]?.owned;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ARCHETYPES = { attack: 'Attack', anomaly: 'Anomaly', rupture: 'Rupture', armorer: 'Armorer' };

function tileHtml(unit, extraHtml) {
    return createUnitCard(unit, { className: `result-unit-card${isOwned(unit.id) ? '' : ' fav-unowned'}`, extraHtml });
}

const missingTileHtml = extraHtml => `
    <div class="result-unit-card fav-missing" title="This agent no longer exists">
        <span class="unit-initials">?</span>
        <span class="unit-name">Removed agent</span>
        ${extraHtml}
    </div>`;

// The DPS roles a team is built around, in team order, e.g. ['anomaly'] or ['attack', 'anomaly'].
function archetypesOf(units) {
    return [...new Set(getTeamDpsBuckets(units).map(bucket => bucket.split(':')[0]))];
}

function cardHtml(ids) {
    const { units, missing } = resolveTeam(ids, getAllUnits());
    const star = favoriteStarHtml(ids);
    // Phones show the star over the third tile (see FAVORITE TEAMS in style.css).
    const tileStar = `<span class="fav-tile-star">${star}</span>`;
    const tiles = ids.map((id, i) => {
        const unit = units.find(u => u.id === id);
        const extra = i === 2 ? tileStar : '';
        return unit ? tileHtml(unit, extra) : missingTileHtml(extra);
    }).join('');

    const roles = archetypesOf(units);
    const leaders = getPrimaryDpsNames(units);
    const unowned = units.filter(u => !isOwned(u.id));
    const chips = [];
    if (missing.length === 0 && unowned.length === 0) chips.push('<span class="fav-chip fav-chip--ok">All owned</span>');
    if (unowned.length) chips.push(`<span class="fav-chip fav-chip--warn">Not owned: ${unowned.map(u => u.name).join(', ')}</span>`);
    if (missing.length) chips.push(`<span class="fav-chip fav-chip--warn">${plural(missing.length, 'agent')} no longer in the game data</span>`);

    const validIds = ids.filter(id => units.some(u => u.id === id));
    const open = validIds.length
        ? `<a class="fav-open" href="agent-detail.html?agents=${validIds.join(',')}" title="See which bosses this team is best against">Bosses →</a>`
        : '';

    return `
        <div class="fav-row result-card arch-${roles[0] ?? 'none'}" data-team="${ids.join('|')}">
            <div class="recommendation-team">${tiles}</div>
            <div class="fav-side">
                <div class="fav-main">
                    <div class="fav-arch">${roles.map(r => ARCHETYPES[r]).join(' / ') || 'Flex team'}</div>
                    ${leaders.length ? `<div class="fav-lead">Led by ${leaders.join(' &amp; ')}</div>` : ''}
                    <div class="fav-chips">${chips.join('')}</div>
                </div>
                ${open}
                ${star}
            </div>
        </div>`;
}

// Which archetypes the list contains, doubling as the key to the card colours.
function legendHtml(teams) {
    const counts = {};
    for (const ids of teams) {
        const role = archetypesOf(resolveTeam(ids, getAllUnits()).units)[0];
        if (role) counts[role] = (counts[role] ?? 0) + 1;
    }
    return Object.keys(ARCHETYPES).filter(role => counts[role]).map(role =>
        `<span class="fav-legend-item"><i class="fav-dot arch-${role}"></i>${ARCHETYPES[role]} ${counts[role]}</span>`
    ).join('');
}

const SHARE_ICON = `<svg class="share-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;

function render() {
    const teams = sharedTeams ?? getFavorites();
    const body = document.getElementById('fav-body');

    document.getElementById('fav-banner').innerHTML = sharedTeams
        ? `<div class="shared-roster-banner">
               <span class="shared-icon">🔗</span>
               <span class="shared-text">Viewing a shared list of ${plural(sharedTeams.length, 'team')}. It isn't saved unless you add it.</span>
               <a href="favorites.html" class="shared-reset-link">My favorites</a>
           </div>`
        : '';

    document.getElementById('fav-count').textContent = `${teams.length} of ${FAVORITES_CAP}`;
    document.getElementById('fav-actions').innerHTML = teams.length === 0 ? ''
        : sharedTeams
            ? '<button type="button" class="filter-btn" data-add-all>Add all</button>'
            : `<button type="button" class="share-btn" data-share title="Copy a link to this list">${SHARE_ICON}<span class="share-text">Share</span></button>`;

    if (teams.length === 0) {
        body.innerHTML = sharedTeams
            ? '<div class="no-results">This link has no valid teams.</div>'
            : `<div class="no-results">
                   <p>No favorite teams yet.</p>
                   <p>Build one below, or tap the ☆ on a team in Team Builder, Team Recommendations, Deadly Assault Matchups or Agent Teams.</p>
               </div>`;
    } else {
        body.innerHTML = `<div class="fav-legend">${legendHtml(teams)}</div><div class="fav-list">${teams.map(cardHtml).join('')}</div>`;
    }
    document.getElementById('fav-note').innerHTML = sharedTeams ? '' : storageNote();
}

function storageNote() {
    return `<p class="fav-note">Favorites are stored in this browser only and are lost if you clear site data. Use Share to keep a copy.</p>`;
}

function removeTeam(ids) {
    const before = getFavorites();
    const index = before.findIndex(team => teamKey(team) === teamKey(ids));
    if (index < 0) return;
    setFavorites(before.filter((_, i) => i !== index));
    showToast('Team removed.', {
        actionLabel: 'Undo',
        onAction: () => {
            const now = getFavorites();
            if (isFavorite(now, ids) || now.length >= FAVORITES_CAP) return;
            setFavorites([...now.slice(0, index), before[index], ...now.slice(index)]);
        }
    });
}

function addTeams(incoming) {
    const { teams, added, skipped } = addMany(getFavorites(), incoming);
    if (added) setFavorites(teams);
    const parts = [`Added ${added} of ${plural(incoming.length, 'team')}.`];
    if (skipped) parts.push(`${skipped} would exceed the limit of ${FAVORITES_CAP}.`);
    showToast(parts.join(' '));
}

async function shareLink() {
    const base = `${window.location.origin}${window.location.pathname}`;
    const ok = await copyToClipboard(`${base}?teams=${encodeFavorites(getFavorites())}`);
    showToast(ok ? 'Link copied.' : 'Could not copy the link.');
}

// On your own list the star removes (with Undo); on a shared list it saves or unsaves that team.
function bindActions() {
    document.addEventListener('click', event => {
        const row = event.target.closest('.fav-row');
        const ids = row?.dataset.team.split('|');
        if (event.target.closest('.fav-star') && ids) (sharedTeams ? toggleTeam(ids) : removeTeam(ids));
        else if (event.target.closest('[data-add-all]')) addTeams(sharedTeams);
        else if (event.target.closest('[data-share]')) shareLink();
    });
    window.addEventListener('favorites-changed', () => { render(); updateAddRow(); });
}


// Add a team (below the list): three picker slots build a draft that is only saved when Save is pressed.
// Saved favorites are never edited; delete one and add a new one.
let picker = null;
let draft = [];

function setupAddRow() {
    const el = document.getElementById('fav-add');
    el.hidden = false;
    el.className = 'fav-add result-card';
    el.innerHTML = `
        <div class="ap-slots fav-add-slots"></div>
        <div class="fav-side">
            <div class="fav-main">
                <div class="fav-arch">Add a team</div>
                <div class="fav-lead" id="fav-add-hint"></div>
            </div>
            <button type="button" class="filter-btn" id="fav-add-clear">Clear</button>
            <button type="button" class="fav-save" id="fav-add-save">Save</button>
        </div>`;

    picker = createAgentPicker({
        getUnits: getAllUnits,
        isOwned,
        allowUnowned: true,
        title: () => 'Choose an agent'
    });
    picker.mountSlots(el.querySelector('.fav-add-slots'), {
        key: 'new-favorite',
        getIds: () => draft,
        setIds: ids => { draft = ids; updateAddRow(); },
        max: TEAM_SIZE,
        fixedSlots: true,
        anchorEl: el,
        addLabel: () => 'Select agent'
    });

    document.getElementById('fav-add-clear').addEventListener('click', () => {
        draft = [];
        picker.close();
        updateAddRow();
    });
    document.getElementById('fav-add-save').addEventListener('click', saveDraft);
    updateAddRow();
}

function addRowProblem() {
    if (draft.length < TEAM_SIZE) return `Pick ${TEAM_SIZE - draft.length} more ${draft.length === TEAM_SIZE - 1 ? 'agent' : 'agents'}.`;
    if (isFavorite(getFavorites(), draft)) return 'Already in your favorites.';
    if (getFavorites().length >= FAVORITES_CAP) return `Favorites are full (${FAVORITES_CAP}). Remove one first.`;
    return null;
}

function updateAddRow() {
    if (!picker) return;
    const problem = addRowProblem();
    document.getElementById('fav-add-hint').textContent = problem ?? 'Ready to save.';
    document.getElementById('fav-add-save').disabled = problem !== null;
    document.getElementById('fav-add-clear').hidden = draft.length === 0;
    picker.refresh();
}

function saveDraft() {
    if (addRowProblem() !== null || !toggleTeam(draft)) return;
    draft = [];
    showToast('Team saved.');
    updateAddRow();
}

async function init() {
    try {
        await initRoster({
            containerSelector: '#roster-container',
            pageUrl: 'favorites.html',
            onStateChange: () => { render(); picker?.refresh(); },
            collapseKnownRoster: true
        });
        bindActions();
        if (!sharedTeams) setupAddRow();
        render();
    } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('fav-body').innerHTML = '<div class="no-results">Failed to load game data. Refresh the page to try again.</div>';
    }
}

document.addEventListener('DOMContentLoaded', init);
