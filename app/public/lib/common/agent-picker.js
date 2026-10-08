/**
 * Agent picker: the focus tiles ("slots") plus the popup that fills them.
 *
 * Shared by Agent Teams and the Deadly Assault plan so the two can never drift apart. One
 * picker owns one popup; any number of slot groups (one per boss row on Deadly Assault) mount
 * onto it, and the popup opens beneath whichever group is being edited.
 *
 * `allowUnowned` is the one behavioural switch between the pages: Agent Teams offers the
 * roster only, the Deadly Assault plan also offers agents the player does not own, marked
 * "Not owned", for what-if planning.
 */

import { ELEMENTS } from './constants.js';
import { getInitials, getUnitElement } from './roster-ui.js';

// Enough to scan at a glance; search and the filters reach the rest.
export const DEFAULT_MAX_ICONS = 18;

const DPS_TAGS = ['attack', 'anomaly', 'rupture', 'armorer'];

// Only offered when the picker can list agents the player lacks.
const OWNERSHIP_FILTER = { key: 'owned', options: [['unowned', 'Unowned']] };

const FILTER_GROUPS = [
    { key: 'rank', options: [['S', 'S-Rank'], ['A', 'A-Rank']] },
    { key: 'role', options: [['dps', 'DPS'], ['stun', 'Stun'], ['support', 'Support'], ['defense', 'Defense']] },
    { key: 'element', options: ELEMENTS.map(e => [e, e]) }
];

/**
 * @param {Object} config
 * @param {() => Object[]} config.getUnits - Every agent that could be offered
 * @param {(id: string) => boolean} config.isOwned
 * @param {boolean} [config.allowUnowned] - Offer (and tolerate) agents outside the roster
 * @param {number} [config.maxIcons] - Most icons shown in the popup at once
 * @param {(ctx: Object) => string} [config.title] - Popup title for the open slot
 * @param {(ctx: Object) => {isPickable?: (unit: Object) => boolean, hint?: (shown: Object[]) => string|null}} [config.describe]
 *        Called once per popup render. `isPickable` fades agents that cannot be chosen; `hint` adds a line beneath the grid.
 * @param {(id: string, ctx: Object) => boolean} [config.isConflict] - Marks a filled tile as a problem
 */
export function createAgentPicker({
    getUnits, isOwned, allowUnowned = false, maxIcons = DEFAULT_MAX_ICONS,
    title = null, describe = null, isConflict = null
}) {
    const groups = new Map();            // key -> group
    let active = null;                   // { key, slot } while the popup is open
    const filters = { rank: null, role: null, element: null, owned: null };
    const filterGroups = allowUnowned ? [...FILTER_GROUPS, OWNERSHIP_FILTER] : FILTER_GROUPS;

    const popup = document.createElement('div');
    popup.className = 'ap-picker';
    popup.hidden = true;
    popup.innerHTML = `
        <div class="ap-picker-top">
            <span class="ap-picker-title"></span>
            <input type="search" class="ap-picker-search" placeholder="Search" autocomplete="off">
            <button type="button" class="ap-picker-close" aria-label="Close">✕</button>
        </div>
        <div class="ap-picker-filters"></div>
        <div class="ap-picker-grid"></div>
        <div class="ap-picker-hint" hidden></div>
    `;
    const $ = sel => popup.querySelector(sel);
    const searchEl = $('.ap-picker-search');

    // Helpers

    const unitById = id => getUnits().find(u => u.id === id);

    function contextFor(group, slot) {
        const ids = group.getIds();
        return { key: group.key, slot, ids, others: ids.filter((_, i) => i !== slot) };
    }

    function activeContext() {
        const group = active && groups.get(active.key);
        return group ? { group, ctx: contextFor(group, active.slot) } : null;
    }

    // Slots

    function tileHtml(group, ids, index) {
        const id = ids[index];
        const picking = active && active.key === group.key && active.slot === index ? ' picking' : '';
        if (id === undefined) {
            const first = index === 0 && !group.fixedSlots;
            const label = group.addLabel ? group.addLabel(index) : (first ? 'Choose agent' : 'Add teammate');
            const shape = group.fixedSlots ? ' ap-tile-slot' : (first ? ' primary' : '');
            return `
                <div class="ap-tile ap-tile-add${shape}${picking}${group.disabled ? ' disabled' : ''}" data-slot="${index}" role="button" tabindex="${group.disabled ? -1 : 0}"${group.disabled ? ' aria-disabled="true"' : ''}>
                    <div class="ap-tile-avatar"><span class="ap-tile-plus">+</span></div>
                    <div class="ap-tile-name">${label}</div>
                </div>`;
        }
        const unit = unitById(id);
        if (!unit) return '';
        const element = getUnitElement(unit);
        const conflict = isConflict && isConflict(id, contextFor(group, index)) ? ' conflict' : '';
        const avatar = unit.image
            ? `<img class="ap-tile-img" src="${unit.image}" alt="">`
            : `<span class="ap-tile-initials">${getInitials(unit.name)}</span>`;
        return `
            <div class="ap-tile element-${element}${picking}${conflict}" data-slot="${index}" role="button" tabindex="0" aria-label="Change ${unit.name}">
                <div class="ap-tile-avatar">
                    ${avatar}
                    ${isOwned(id) ? '' : '<span class="ap-tile-badge">Not owned</span>'}
                </div>
                <div class="ap-tile-name">${unit.name}</div>
                <button type="button" class="ap-tile-clear" data-clear="${index}" aria-label="Remove ${unit.name}">✕</button>
            </div>`;
    }

    function renderGroup(group) {
        const ids = group.getIds();
        const count = group.fixedSlots ? group.max : Math.min(ids.length + 1, group.max);
        const tiles = [];
        for (let i = 0; i < count; i++) tiles.push(tileHtml(group, ids, i));
        group.el.innerHTML = tiles.join('');
    }

    function commit(group, ids) {
        group.setIds(ids);
        closePicker();
    }

    function bind(group) {
        if (group.el._apHandler) return;
        const handler = e => {
            if (e.type === 'keydown') {
                if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches('.ap-tile')) return;
                e.preventDefault();
            }
            const live = groups.get(group.key);
            if (!live || live.disabled) return;

            const clear = e.target.closest('[data-clear]');
            if (clear) {
                e.stopPropagation();
                const ids = live.getIds().slice();
                ids.splice(Number(clear.dataset.clear), 1);
                commit(live, ids);
                return;
            }
            const tile = e.target.closest('.ap-tile');
            if (!tile) return;
            const slot = Number(tile.dataset.slot);
            if (active && active.key === live.key && active.slot === slot) {
                closePicker();
                return;
            }
            openPicker(live.key, slot);
        };
        group.el.addEventListener('click', handler);
        group.el.addEventListener('keydown', handler);
        group.el._apHandler = handler;
    }

    // Popup

    function matchesFilters(unit) {
        const { rank, role, element, owned } = filters;
        if (owned === 'unowned' && isOwned(unit.id)) return false;
        if (rank && unit.rank !== rank) return false;
        if (role === 'dps' && !DPS_TAGS.some(t => unit.tags.includes(t))) return false;
        if (role && role !== 'dps' && !unit.tags.includes(role)) return false;
        if (element && !unit.tags.includes(element)) return false;
        return true;
    }

    function pickTileHtml(unit, enabled) {
        const element = getUnitElement(unit);
        const owned = isOwned(unit.id);
        const avatar = unit.image
            ? `<img src="${unit.image}" alt="">`
            : `<span class="ap-pick-initials">${getInitials(unit.name)}</span>`;
        const title = enabled ? (owned ? '' : ' title="Not owned"') : ' title="Can\'t team with your selection"';
        return `
            <button type="button" class="ap-pick element-${element}${owned ? '' : ' unowned'}" data-pick="${unit.id}" ${enabled ? '' : 'disabled'}${title}>
                ${avatar}
                <span class="ap-pick-name">${unit.name}</span>
            </button>`;
    }

    function renderPopup() {
        const current = activeContext();
        popup.hidden = !current;
        if (!current) return;
        const { group, ctx } = current;

        $('.ap-picker-title').textContent = title ? title(ctx) : 'Choose an agent';
        $('.ap-picker-filters').innerHTML = filterGroups.map(g =>
            `<div class="ap-filter-group">${g.options.map(([value, label]) =>
                `<button type="button" class="ap-filter${g.key === 'element' ? ` element-${value}` : ''}${filters[g.key] === value ? ' active' : ''}" data-group="${g.key}" data-value="${value}">${label}</button>`
            ).join('')}</div>`
        ).join('');

        const query = searchEl.value.trim().toLowerCase();
        const matches = getUnits()
            .filter(u => (allowUnowned || isOwned(u.id)) && !ctx.ids.includes(u.id))
            .filter(matchesFilters)
            .filter(u => !query || u.name.toLowerCase().includes(query) ||
                (u.aliases || []).some(a => a.toLowerCase().includes(query)));
        // Roster first, so the default view is the agents the player actually has.
        const ordered = [...matches.filter(u => isOwned(u.id)), ...matches.filter(u => !isOwned(u.id))];
        const shown = ordered.slice(0, maxIcons);

        const described = describe ? describe(ctx) : {};
        const isPickable = described.isPickable ?? (() => true);

        $('.ap-picker-grid').innerHTML = shown.length
            ? shown.map(u => pickTileHtml(u, isPickable(u))).join('')
            : `<div class="ap-picker-empty">${allowUnowned ? 'No matching agents.' : 'No matching agents in your roster.'}</div>`;

        const notes = [];
        const custom = described.hint ? described.hint(shown) : null;
        if (custom) notes.push(custom);
        if (ordered.length > shown.length) {
            notes.push(`Showing ${shown.length} of ${ordered.length} agents. Search or use the filters to find the rest.`);
        }
        if (allowUnowned && shown.some(u => !isOwned(u.id))) {
            notes.push('<strong>Agents with a grey ring</strong> aren\'t in your roster. You can still plan around them.');
        }
        const hint = $('.ap-picker-hint');
        hint.hidden = notes.length === 0;
        hint.innerHTML = notes.join('<br>');

        // The popup sits directly beneath the group being edited.
        const anchor = group.anchorEl ?? group.el;
        if (anchor.nextSibling !== popup) anchor.after(popup);
    }

    function openPicker(key, slot) {
        active = { key, slot };
        searchEl.value = '';
        renderAll();
        searchEl.focus({ preventScroll: true });
    }

    function closePicker() {
        active = null;
        renderAll();
    }

    function renderAll() {
        for (const group of groups.values()) renderGroup(group);
        renderPopup();
    }

    // Popup events

    $('.ap-picker-grid').addEventListener('click', e => {
        const tile = e.target.closest('[data-pick]');
        const current = activeContext();
        if (!tile || tile.disabled || !current) return;
        const ids = current.ctx.ids.slice();
        ids[current.ctx.slot] = tile.dataset.pick;
        commit(current.group, ids.filter(Boolean));
    });
    $('.ap-picker-filters').addEventListener('click', e => {
        const btn = e.target.closest('[data-group]');
        if (!btn) return;
        const { group, value } = btn.dataset;
        filters[group] = filters[group] === value ? null : value;
        renderPopup();
    });
    searchEl.addEventListener('input', renderPopup);
    $('.ap-picker-close').addEventListener('click', closePicker);

    return {
        /**
         * Render a slot group into `el` and keep it in step with `getIds`.
         * @param {HTMLElement} el
         * @param {Object} options
         * @param {string} options.key - Unique per group
         * @param {() => string[]} options.getIds
         * @param {(ids: string[]) => void} options.setIds - Called after every pick or removal
         * @param {number} [options.max]
         * @param {boolean} [options.fixedSlots] - Always show `max` tiles, empty ones included
         * @param {boolean} [options.disabled] - Show the tiles but ignore clicks
         * @param {HTMLElement} [options.anchorEl] - Popup opens after this element (default `el`)
         * @param {(index: number) => string} [options.addLabel]
         */
        mountSlots(el, { key, getIds, setIds, max = 3, fixedSlots = false, disabled = false, anchorEl = null, addLabel = null }) {
            const group = { key, el, getIds, setIds, max, fixedSlots, disabled, anchorEl, addLabel };
            groups.set(key, group);
            bind(group);
            renderGroup(group);
        },
        /** Drop every group (and close the popup) before the page rebuilds the elements they live in. */
        clearGroups() {
            active = null;
            popup.hidden = true;
            popup.remove();
            groups.clear();
        },
        /** Re-render slots and popup in place, e.g. after the roster changed. */
        refresh: renderAll,
        close: closePicker,
        isOpen: () => active !== null
    };
}
