/**
 * Pull Recommendations Engine
 * Shared analysis logic for gap detection and recommendation scoring.
 * Used by both the web UI (pull-recommendations.js) and CLI debug tool (pull-debug.js).
 */

import { ELEMENTS, DPS_ROLES, STAT_KEYS } from './constants.js';
import {
    getElement,
    getElementVariant,
    getEffectiveScaling,
    getEffectiveRoles,
    evaluatePredicate,
    resolveConditionalValue,
    isConditionalSpec,
    isTeamScopedConditional,
    maxConditionalValue,
    getMaxBurstWeight,
    getTeammateBuffs,
    getSelfBuffSpecs
} from './team-scorer.js';
import { getTeams, isValidTeam } from './team-builder.js';

export { ELEMENTS };
export const DPS_ARCHETYPES = DPS_ROLES;

const NATURALLY_AVAILABLE_KEYS = new Set(['chains', 'ultimates']);
// Base stats: a teammate can buff one of these but can never supply the stat itself, so an
// unmet `scaling.ap` is not a missing partner. Sourced from constants.js so this and the
// `mechanics.stats` block cannot drift apart.
const FOUNDATIONAL_STAT_KEYS = new Set(STAT_KEYS);
// `greedy` (wants the stun window to itself) can never be supplied by a teammate, so it's
// skipped rather than producing a nameless "Needs  to reach full potential".
const CODEPENDENT_SKIP_KEYS = new Set([
    ...NATURALLY_AVAILABLE_KEYS, ...FOUNDATIONAL_STAT_KEYS, 'codependent', 'buffs', 'greedy'
]);

// A real team need, handled by anomalyProcSupply() below rather than skipped.
const ANOMALY_SCALING_KEY = 'anomaly';

export function tierToQuality(tier) {
    if (tier <= 0) return 95;
    if (tier <= 0.5) return 75;
    if (tier <= 1.0) return 55;
    if (tier <= 1.5) return 40;
    if (tier <= 2.5) return 25;
    return 10;
}

export function qualityLabel(q) {
    if (q >= 95) return 'Elite';
    if (q >= 75) return 'Strong';
    if (q >= 55) return 'Decent';
    if (q >= 40) return 'Borderline';
    if (q >= 25) return 'Weak';
    if (q >= 10) return 'Marginal';
    return 'None';
}

export function getBestTier(units) {
    if (units.length === 0) return null;
    return Math.min(...units.map(u => u.tier));
}

// Unconditional pseudoRole entries (plain strings) — always active regardless of team context.
function unconditionalPseudo(unit) {
    const pr = unit.mechanics?.pseudoRole;
    if (!Array.isArray(pr)) return [];
    return pr.filter(e => typeof e === 'string');
}

// True if tags include a DPS archetype, or pseudoRole unconditionally contains both `dps`
// and an archetype (e.g. Claret: defense-tagged but built as a primary attack DPS).
export function hasDPSRole(unit) {
    if (DPS_ARCHETYPES.some(a => unit.tags.includes(a))) return true;
    const p = unconditionalPseudo(unit);
    return p.includes('dps') && p.some(r => DPS_ARCHETYPES.includes(r));
}

// The archetype tag for a primary-DPS unit, or null. Tag takes precedence over pseudoRole,
// which requires an unconditional `dps` marker.
export function getPrimaryDPSArchetype(unit) {
    const tagArch = DPS_ARCHETYPES.find(a => unit.tags.includes(a));
    if (tagArch) return tagArch;
    const p = unconditionalPseudo(unit);
    if (!p.includes('dps')) return null;
    return DPS_ARCHETYPES.find(a => p.includes(a)) ?? null;
}

// Delegates to the scorer's `evaluatePredicate` rather than forking it: one vocabulary, one
// implementation, so a new predicate key cannot be understood here and not there. The no-team
// defaults that used to be spelled out inline (Yanagi → primary DPS, Burnice → subdps) are now
// the shared evaluator's documented behaviour for an absent team. [PRED-03]
//
// `team` here is a ROSTER and may or may not already contain `unit`; the shared evaluator counts
// self exactly once, so normalise instead of adding a separate self-count.
export function isSubdps(unit, team = null) {
    const pr = unit.mechanics?.pseudoRole;
    if (!Array.isArray(pr)) return false;
    const ctxTeam = team === null ? undefined : [unit, ...team.filter(u => u.id !== unit.id)];
    return pr.some(entry => {
        const role = typeof entry === 'string' ? entry : entry?.role;
        if (role !== 'subdps') return false;
        if (typeof entry === 'string' || !entry?.when) return true;
        return evaluatePredicate(entry.when, { team: ctxTeam, self: unit, consumer: null });
    });
}

export function isTitled(unit) {
    return unit.tags.includes('title');
}

export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getUnitElement(unit) {
    return getElement(unit) || 'unknown';
}

// Variant-aware (Miyabi's frost disorders with plain ice) — must agree with computeAnomalyReactions.
function getDisorderElement(unit) {
    return getElementVariant(unit) || 'unknown';
}

// Team legality against the owned roster: can two units share a real 3-unit team, with an owned
// unit in the third slot? The third may not belong to another archetype, and no member may
// declare the carry's archetype in `archetypes.avoid`. [PULL-07]
function makeTeamLegality(ownedUnits) {
    const cache = new Map();
    const carryArchetype = (u) => (isSubdps(u) ? null : getPrimaryDPSArchetype(u));
    const avoids = (u, arch) => !!arch && (u.mechanics?.archetypes?.avoid ?? []).includes(arch);

    function canShareTeam(a, b) {
        if (a.id === b.id) return false;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (cache.has(key)) return cache.get(key);
        const arch = carryArchetype(a) ?? carryArchetype(b);
        let ok = false;
        for (const t of (avoids(a, arch) || avoids(b, arch)) ? [] : ownedUnits) {
            if (t.id === a.id || t.id === b.id) continue;
            const tArch = getPrimaryDPSArchetype(t);
            if (arch && tArch && tArch !== arch) continue;
            if (avoids(t, arch)) continue;
            if (isValidTeam(a, b, t)) { ok = true; break; }
        }
        cache.set(key, ok);
        return ok;
    }

    const carriesByArch = {};
    for (const arch of DPS_ARCHETYPES) {
        carriesByArch[arch] = ownedUnits.filter(u => carryArchetype(u) === arch);
    }

    // Can this unit join a legal team with at least one owned carry of `arch`?
    function canFieldWith(unit, arch) {
        return carriesByArch[arch].some(c => canShareTeam(unit, c));
    }

    return { canShareTeam, canFieldWith, carriesByArch };
}

function isLumenElement(unit) {
    return getUnitElement(unit) === 'lumen';
}

// An anomaly agent that reacts with a teammate of another element: disorder, or vortex when wind.
// Any role — two on-field carries react too. Lumen has no anomaly gauge. [GAP-02]
function isReactionPartner(unit) {
    return unit.tags.includes('anomaly') && !isLumenElement(unit);
}

function w(value) {
    if (value === true) return 1;
    if (typeof value === 'number') return value;
    return 0;
}

// Lightweight L4-style pairwise fit: how well supplier's buffs/debuffs/utility serve consumer.
// Exported for test-recommendations.mjs; not part of the page-facing API.
export function mechanicsFitScore(supplier, consumer) {
    let score = 0;
    const cTags = consumer.tags;
    const cMech = consumer.mechanics || {};
    const cScaling = getEffectiveScaling(consumer);
    const cDamage = cMech.damage || {};
    const cElement = getUnitElement(consumer);
    const sElement = getUnitElement(supplier);

    const primaryArch = getPrimaryDPSArchetype(consumer);
    const isAtkDPS = primaryArch === 'attack' || cTags.includes('attack');
    const isAnoDPS = primaryArch === 'anomaly' || cTags.includes('anomaly');
    const isRupDPS = primaryArch === 'rupture' || cTags.includes('rupture');
    const isArmDPS = primaryArch === 'armorer' || cTags.includes('armorer');
    const isDPS = isAtkDPS || isAnoDPS || isRupDPS || isArmDPS;
    if (!isDPS) return 0;

    // Conditional buffs resolve to what THIS consumer would receive (mechanics-fit-score.md).
    const fitCtx = { team: [supplier, consumer], self: supplier, consumer };
    const sBuf = {};
    for (const [key, spec] of Object.entries(getTeammateBuffs(supplier))) {
        sBuf[key] = resolveConditionalValue(spec, fitCtx);
    }
    const sDebuf = {};
    for (const [key, spec] of Object.entries(supplier.mechanics?.debuffs || {})) {
        sDebuf[key] = resolveConditionalValue(spec, fitCtx);
    }
    const sUtil = supplier.mechanics?.utility || {};

    const atkW = w(sBuf.atk);
    if (atkW > 0 && isDPS) {
        score += atkW * (isRupDPS ? 0.33 : isArmDPS ? 0.5 : 1) * 2;
    }
    // DEF buff → DPS units that explicitly scale with DEF (e.g. Claret)
    const defW = w(sBuf.def);
    if (defW > 0 && w(cScaling.def) > 0) {
        score += defW * 2;
    }
    if (w(sBuf.anomaly) > 0 && isAnoDPS) score += w(sBuf.anomaly) * 3;
    if (w(sBuf.sheer) > 0 && isRupDPS) score += w(sBuf.sheer) * 5;
    // Laceration is to armorers what sheer is to rupture (Claret, Koleda, Roxy supply it).
    if (w(sBuf.laceration) > 0 && isArmDPS) score += w(sBuf.laceration) * 5;
    // Armorers value CR highly; CD is worthless for them unless explicit cd scaling is declared.
    const cScalingCd = w(cScaling.cd);
    const critFit = {
        cr: isAnoDPS ? 0.3 : isArmDPS ? 3 : 2,
        cd: isArmDPS ? (cScalingCd > 0 ? Math.min(1, cScalingCd / 2) : 0) : isAnoDPS ? 0.3 : 2,
    };
    for (const key of ['cr', 'cd']) score += w(sBuf[key]) * critFit[key];
    // The consumer's own self-targeted buff, when this supplier is what switches it on. [PULL-04]
    const ownCtx = { team: [supplier, consumer], self: consumer, consumer };
    for (const [key, spec] of Object.entries(getSelfBuffSpecs(consumer))) {
        score += resolveConditionalValue(spec, ownCtx) * (critFit[key] ?? 0);
    }
    // Armorer premium on PEN/defense shred, mirroring the scorer's resolveBaselineWeight.
    if (w(sBuf.pen) > 0 && isDPS && !isRupDPS) score += w(sBuf.pen) * (isArmDPS ? 4 : 2);
    // `dmg` is deliberately not scored — see mechanics-fit-score.md.
    if (w(sDebuf.defense) > 0 && isDPS && !isRupDPS) score += w(sDebuf.defense) * (isArmDPS ? 6 : 3);
    if (w(sDebuf.recovery) > 0 && isDPS) {
        // Mirrors the scorer's recovery branch; greed is left out because it needs a team. [PULL-03]
        const effectiveBurst = getMaxBurstWeight(consumer) + w(cScaling.chains)
            + w(cDamage.totalize) * 2 + w(cScaling.recovery);
        score += w(sDebuf.recovery) * effectiveBurst;
    }
    const isStunless = cMech.utility?.stunless === true;
    if (!isStunless && (isAtkDPS || isRupDPS || isArmDPS)) {
        const sDaze = supplier.tags.includes('stun') ? 1 : w(sUtil.daze) * 0.5;
        const sStunMult = w(sBuf['stun-multiplier']);
        score += (sDaze + sStunMult) * 2;
    }
    if (cElement && cElement !== 'unknown') {
        if (w(sBuf[cElement]) > 0) score += w(sBuf[cElement]) * 4;
        if (w(sDebuf[cElement]) > 0) score += w(sDebuf[cElement]) * 4;
    }

    const NEED_KEYS = [
        'disorders', 'ablooms', 'chains', 'ultimates', 'veils',
        'quick-assists', 'interrupt-resistance', 'vortex'
    ];
    for (const key of NEED_KEYS) {
        const scalingW = w(cScaling[key]);
        if (scalingW === 0) continue;
        const supplyW = Math.max(w(sBuf[key]), w(sDebuf[key]), w(sUtil[key]));
        if (supplyW > 0) {
            const fulfillment = Math.min(1, supplyW / scalingW);
            score += supplyW * scalingW * fulfillment * 3;
        }
    }

    // Damage types one unit can produce for another — excludes kit descriptors like ultimate:strong.
    // Damage classes, matched by classifier base so a subclass such as `abloom:free` is included.
// See [CLS-01] in team-scorer.js.
const MECHANIC_DAMAGE_TYPES = new Set(['aftershock', 'abloom', 'chain', 'chains', 'polarity', 'totalize']);
const mechanicDamageClass = (key) => {
    const i = key.indexOf(':');
    const base = i < 0 || key.slice(0, i) === 'ultimate' ? key : key.slice(0, i);
    return MECHANIC_DAMAGE_TYPES.has(base) ? base : null;
};
    const sDamage = supplier.mechanics?.damage || {};
    for (const [dmgType, dmgVal] of Object.entries(cDamage)) {
        const dw = w(dmgVal);
        if (dw === 0) continue;
        let buffW = w(sBuf[dmgType]);
        const dmgClass = mechanicDamageClass(dmgType);
        // A buff on the general class satisfies any subclass of it. [CLS-01]
        if (dmgClass && dmgClass !== dmgType) buffW = Math.max(buffW, w(sBuf[dmgClass]));
        if (dmgType === 'polarity') buffW = Math.max(buffW, w(sBuf.disorders));
        if (buffW > 0) score += buffW * dw * 2;
        const supplyDmg = w(sDamage[dmgType]);
        if (supplyDmg > 0 && dmgClass) score += supplyDmg * dw * 2;
    }

    // No reactions context here, so gate vortex on consumer being anomaly as a proxy.
    if (w(sBuf.vortex) > 0 && isAnoDPS) {
        score += w(sBuf.vortex) * 2;
    }

    if (isAnoDPS && w(cScaling.disorders) > 0) {
        const sRoles = getEffectiveRoles(supplier);
        const sIsAno = supplier.tags.includes('anomaly') || sRoles.includes('anomaly');
        if (sIsAno && sElement !== cElement) {
            score += w(cScaling.disorders) * 4;
        }
        if (w(sUtil.disorders) > 0) {
            score += w(sUtil.disorders) * w(cScaling.disorders) * 3;
        }
    }

    // Conditional-buff anti-synergy: heavy discount for a supplier occupying a slot that
    // should go to a teammate who actually activates the consumer's need. See
    // mechanics-fit-score.md.
    if (score > 0) {
        const condBuffTags = new Set();
        for (const spec of Object.values(getTeammateBuffs(consumer))) {
            if (!isConditionalSpec(spec)) continue;
            for (const c of spec.cases) {
                if (c.when?.countTag) condBuffTags.add(c.when.countTag);
            }
        }
        for (const tag of condBuffTags) {
            if (!supplier.tags.includes(tag)) {
                score = Math.round(score * 0.2);
                break;
            }
        }
    }

    return score;
}

// Weighted supply for a `scaling.anomaly` need, mirroring team-scorer.js's anomaly-quantity
// rule rather than searching for a `buffs.buildup` that means something else. [CODEP-02]
const ANOMALY_PROC_SUPPLY_WEIGHT = 0.5;   // matches ANOMALY_PROC_SUPPLY in team-scorer.js

function anomalyProcSupply(unit) {
    let supply = 0;
    if (!isLumenElement(unit) && getEffectiveRoles(unit).includes('anomaly')) supply += 1;
    for (const [key, val] of Object.entries(unit.mechanics?.utility || {})) {
        if (key.startsWith('anomaly:')) supply += ANOMALY_PROC_SUPPLY_WEIGHT * w(val);
    }
    return supply;
}

/**
 * Checks whether a codependent candidate's specialist scaling needs can be met by the roster.
 * @returns {{ hasUnmetDependency, cannotFormTeam, notes: [{ text, providers }] }}
 */
export function checkTeamDependencies(candidate, ownedUnits, allUnits) {
    const empty = { hasUnmetDependency: false, cannotFormTeam: false, notes: [] };

    if (!candidate.mechanics?.scaling?.codependent) return empty;

    if (!hasDPSRole(candidate) && !isSubdps(candidate)) return empty;

    const scaling = getEffectiveScaling(candidate);
    const notes = [];
    let hasUnmetDependency = false;
    let cannotActivateBuffs = false;

    const selfBuffs = getTeammateBuffs(candidate);
    const selfUtil = candidate.mechanics?.utility || {};

    // Step 1: specialist scaling provider check
    for (const [key, level] of Object.entries(scaling)) {
        if (CODEPENDENT_SKIP_KEYS.has(key)) continue;
        const scalingW = w(level);
        if (scalingW === 0) continue;

        // Self-provided needs (e.g. Banyue's own interrupt-resistance) have no team dependency.
        const selfSupply = Math.max(w(selfBuffs[key]), w(selfUtil[key]));
        if (selfSupply >= scalingW) continue;

        // `anomaly` sums additively across bodies rather than one unit clearing a threshold.
        const isAnomalyQuantity = key === ANOMALY_SCALING_KEY;
        const supplies = isAnomalyQuantity
            ? (u => anomalyProcSupply(u) > 0)
            : (u => {
                const buf = getTeammateBuffs(u);
                const debuf = u.mechanics?.debuffs || {};
                const util = u.mechanics?.utility || {};
                return Math.max(w(buf[key]), w(debuf[key]), w(util[key])) >= scalingW;
            });

        const met = isAnomalyQuantity
            ? ownedUnits.reduce((sum, u) => sum + anomalyProcSupply(u), 0) >= scalingW
            : ownedUnits.some(supplies);

        if (!met) {
            hasUnmetDependency = true;
            const providers = allUnits
                .filter(u => {
                    if (u.id === candidate.id) return false;
                    if (!u.limited || u.rank !== 'S') return false;
                    return supplies(u);
                })
                .sort((a, b) => a.tier - b.tier)
                .map(u => ({ id: u.id, name: u.name }));
            // Cap names — an anomaly-quantity need can match a dozen agents.
            notes.push({
                text: `Needs ${providers.slice(0, 3).map(p => p.name).join(' or ')} to reach full potential`,
                providers
            });
        }
    }

    // Step 1b: conditional buff feasibility (codependency-gating.md check 2). At or below
    // half max activation the unit can't function; partial still flags for a 1-level drop.
    const candBuffs = getTeammateBuffs(candidate);
    for (const [buffKey, spec] of Object.entries(candBuffs)) {
        if (isTeamScopedConditional(spec)) {
            const maxLevel = maxConditionalValue(spec);
            if (maxLevel <= 0) continue;
            const neededTag = spec.cases.map(c => c.when?.countTag).find(Boolean);
            // hasUnit/notPresent/hasRole conditionals: no tag-based feasibility. This READS the
            // predicate rather than evaluating it, so it cannot use evaluatePredicate. [PRED-03]
            if (!neededTag) continue;
            const selfCount = candidate.tags.includes(neededTag) ? 1 : 0;
            const rosterCount = selfCount + ownedUnits.filter(u => u.tags.includes(neededTag)).length;
            // Best achievable value: resolve the spec against a pseudo-team of that many tagged units.
            const pseudoTeam = Array.from({ length: rosterCount }, () => ({ tags: [neededTag] }));
            const bestAchievable = resolveConditionalValue(spec, { team: pseudoTeam, self: candidate, consumer: null });
            const providers = allUnits
                .filter(u => u.id !== candidate.id && u.limited && u.rank === 'S'
                    && u.tags.includes(neededTag))
                .sort((a, b) => a.tier - b.tier)
                .map(u => ({ id: u.id, name: u.name }));
            if (bestAchievable * 2 <= maxLevel) {
                // At or below half max — unit can't function as designed
                hasUnmetDependency = true;
                cannotActivateBuffs = true;
                const verb = bestAchievable <= 0 ? 'activate' : 'meaningfully activate';
                notes.push({
                    text: `Needs ${neededTag} teammates to ${verb} ${buffKey} buff — pull ${providers.slice(0, 3).map(p => p.name).join(' or ')} first`,
                    providers
                });
            } else if (bestAchievable < maxLevel) {
                hasUnmetDependency = true;
                notes.push({
                    text: `Needs more ${neededTag} teammates to fully activate ${buffKey} buff — pull ${providers.slice(0, 3).map(p => p.name).join(' or ')}`,
                    providers
                });
            }
        }
    }

    // Step 2: disorder feasibility (for units with scaling.disorders)
    const disorderScaling = w(scaling.disorders);
    if (disorderScaling > 0 && !CODEPENDENT_SKIP_KEYS.has('disorders')) {
        const candidateEl = getDisorderElement(candidate);
        const hasDisorderPartner = ownedUnits.some(u => {
            const uEl = getDisorderElement(u);
            if (uEl === candidateEl || getUnitElement(u) === 'wind' || uEl === 'unknown') return false;
            const isAno = u.tags.includes('anomaly');
            const pseudoRoles = u.mechanics?.pseudoRole;
            const isPseudoAno = Array.isArray(pseudoRoles) &&
                pseudoRoles.some(e => (typeof e === 'string' ? e : e?.role) === 'anomaly');
            return isAno || isPseudoAno;
        });

        if (!hasDisorderPartner) {
            hasUnmetDependency = true;
            const partners = allUnits
                .filter(u => {
                    if (u.id === candidate.id) return false;
                    if (!u.limited || u.rank !== 'S') return false;
                    const uEl = getDisorderElement(u);
                    if (uEl === candidateEl || getUnitElement(u) === 'wind' || uEl === 'unknown') return false;
                    const isAno = u.tags.includes('anomaly');
                    const pr = u.mechanics?.pseudoRole;
                    const isPseudoAno = Array.isArray(pr) &&
                        pr.some(e => (typeof e === 'string' ? e : e?.role) === 'anomaly');
                    return isAno || isPseudoAno;
                })
                .sort((a, b) => a.tier - b.tier)
                .map(u => ({ id: u.id, name: u.name }));
            notes.push({
                text: `Needs ${partners.slice(0, 3).map(p => p.name).join(' or ')} for disorder generation`,
                providers: partners
            });
        }
    }

    // Step 3: team formation feasibility via getTeams()
    let cannotFormTeam = false;
    const teamPool = [candidate, ...ownedUnits.filter(u => u.id !== candidate.id)];
    const allTeams = getTeams(teamPool);
    const validTeams = Object.values(allTeams).filter(
        team => team.length === 3 && team.some(u => u.id === candidate.id)
    );

    if (validTeams.length === 0) {
        cannotFormTeam = true;
        hasUnmetDependency = true;
        notes.push({
            text: 'Cannot form a valid team with your current roster',
            providers: []
        });
    } else if (disorderScaling > 0 && !CODEPENDENT_SKIP_KEYS.has('disorders')) {
        // Verify at least one valid team includes a disorder partner
        const candidateEl = getDisorderElement(candidate);
        const hasTeamWithDisorder = validTeams.some(team =>
            team.some(u => {
                if (u.id === candidate.id) return false;
                const uEl = getDisorderElement(u);
                if (uEl === candidateEl || getUnitElement(u) === 'wind' || uEl === 'unknown') return false;
                const isAno = u.tags.includes('anomaly');
                const pr = u.mechanics?.pseudoRole;
                const isPseudoAno = Array.isArray(pr) &&
                    pr.some(e => (typeof e === 'string' ? e : e?.role) === 'anomaly');
                return isAno || isPseudoAno;
            })
        );
        if (!hasTeamWithDisorder && !notes.some(n => n.text.includes('disorder'))) {
            hasUnmetDependency = true;
            notes.push({
                text: 'No valid team can generate disorders with your current roster',
                providers: []
            });
        }
    }

    return { hasUnmetDependency, cannotFormTeam, cannotActivateBuffs, notes };
}

// Rates whether the roster can assemble the full team a count-tag codependent needs, from the
// owner's stated table rather than fitted cutoffs. [PULL-01]

const LADDER_RUNGS = ['High', 'Medium', 'Low'];
// A ceiling partner: a T0 unconditional sub-DPS of the needed kind (today, Velina).
const LADDER_TOP_PARTNER = 100;
const LADDER_MUTUAL_SYNERGY = 25;         // both units name each other in synergy.units
const LADDER_UNCONDITIONAL_SUBDPS = 10;   // partner's subdps pseudoRole is unconditional

// `synergy.units` entries can be conjunctive groups ("Remielle+Velina"), so split before matching.
function synergyNames(unit) {
    return (unit.synergy?.units || []).flatMap(e => String(e).split('+').map(s => s.trim()));
}

function isMutualSynergyPair(a, b) {
    return synergyNames(a).includes(b.name) && synergyNames(b).includes(a.name);
}

function hasUnconditionalSubdps(unit) {
    return unconditionalPseudo(unit).includes('subdps');
}

function declaresSubdps(unit) {
    const pr = unit.mechanics?.pseudoRole;
    if (!Array.isArray(pr)) return false;
    return pr.some(e => (typeof e === 'string' ? e : e?.role) === 'subdps');
}

// The tag this candidate needs N of, and N (self included), or null if it declares no such
// conditional buff.
function ladderCountTag(candidate) {
    if (!candidate.mechanics?.scaling?.codependent) return null;
    for (const spec of Object.values(getTeammateBuffs(candidate))) {
        if (!isTeamScopedConditional(spec)) continue;
        if (maxConditionalValue(spec) <= 0) continue;
        const counted = spec.cases.filter(c => c.when?.countTag);
        if (counted.length === 0) continue;
        const minCount = Math.max(...counted.map(c => c.when.minCount ?? 1));
        return { tag: counted[0].when.countTag, minCount };
    }
    return null;
}

/**
 * Can the owned roster fill this candidate's team? (Remielle: two other anomaly agents.)
 *   fewer than the needed bodies          → null (don't recommend)
 *   ceiling partner + another S-rank      → High
 *   enough S-rank bodies                  → Medium
 *   only reachable through an A-rank      → Low
 * The team's other bodies must bring two different elements, or nothing reacts; a roster
 * whose bodies all share one element is demoted to Low.
 * @returns {{ rung, partner, second, better, blocked }} or null if the unit has no ladder.
 */
export function getPartnerLadder(candidate, ownedUnits, allUnits = []) {
    const need = ladderCountTag(candidate);
    if (!need) return null;
    const { tag, minCount } = need;
    const othersNeeded = Math.max(1, minCount - 1);

    const partnerScore = (partner) =>
        tierToQuality(partner.tier)
        + (isMutualSynergyPair(candidate, partner) ? LADDER_MUTUAL_SYNERGY : 0)
        + (hasUnconditionalSubdps(partner) ? LADDER_UNCONDITIONAL_SUBDPS : 0);
    const isTopPartner = (u) => declaresSubdps(u) && partnerScore(u) >= LADDER_TOP_PARTNER;
    const byTier = (a, b) => a.tier - b.tier;
    const differ = (a, b) => getDisorderElement(a) !== getDisorderElement(b);

    const others = ownedUnits.filter(u => u.id !== candidate.id && u.tags.includes(tag)).sort(byTier);
    const sRank = others.filter(u => u.rank === 'S');
    const tops = sRank.filter(isTopPartner);

    // Ceiling partners the roster lacks, for the "reaches full potential with" note.
    const better = allUnits
        .filter(u => u.id !== candidate.id && u.tags.includes(tag) && isTopPartner(u) &&
            !ownedUnits.some(o => o.id === u.id))
        .map(u => ({ id: u.id, name: u.name }));

    if (others.length < othersNeeded) {
        return { rung: null, partner: null, second: null, better, blocked: false, have: others.length, need: othersNeeded };
    }

    // The best pair at each rung, requiring two different elements.
    const pairFrom = (firsts, seconds) => {
        for (const a of firsts) {
            const b = seconds.find(x => x.id !== a.id && differ(a, x));
            if (b) return [a, b];
        }
        return null;
    };
    const high = pairFrom(tops, sRank);
    const medium = pairFrom(sRank, sRank);
    const low = pairFrom(others, others);

    if (high) return { rung: 'High', partner: high[0], second: high[1], better: [], blocked: false };
    if (medium) return { rung: 'Medium', partner: medium[0], second: medium[1], better, blocked: false };
    if (low) return { rung: 'Low', partner: low[0], second: low[1], better, blocked: false };
    return { rung: 'Low', partner: others[0], second: others[1], better, blocked: true };
}

function sortCandidates(units, ownedDPSUnits = []) {
    const fitScores = new Map();
    for (const candidate of units) {
        let totalFit = 0;
        for (const dps of ownedDPSUnits) {
            totalFit += mechanicsFitScore(candidate, dps);
        }
        fitScores.set(candidate.id, totalFit);
    }

    return [...units].sort((a, b) => {
        if (isTitled(a) !== isTitled(b)) return isTitled(a) ? -1 : 1;
        if (a.tier !== b.tier) return a.tier - b.tier;
        const aFit = fitScores.get(a.id) || 0;
        const bFit = fitScores.get(b.id) || 0;
        return bFit - aFit;
    });
}

const SUPPORT_GOOD_FIT = 15;

/**
 * Run the full pull recommendation analysis.
 * @returns {{ assessment, recommendations, coverage, allGaps, compositeScore, calibration }}
 */
export function analyze(allUnits, unitStates, ownedUnits, { maxRecommendations = 5, opportunityIds = [] } = {}) {
    const ownedDPS = { attack: [], anomaly: [], rupture: [], armorer: [] };
    // TODO(armorer subdps): no armorer sub-DPS units exist yet; when one ships, add an
    // 'armorer' bucket here and a corresponding gap detector (cf. detectSubdpsGap).
    const ownedSubdps = { anomaly: [], attack: [] };
    const ownedSupports = [];
    const ownedStunners = [];
    const ownedByElement = {};
    for (const el of ELEMENTS) ownedByElement[el] = [];

    for (const unit of ownedUnits) {
        const primaryArch = getPrimaryDPSArchetype(unit);
        if (primaryArch) {
            ownedDPS[primaryArch].push(unit);
            const el = getUnitElement(unit);
            if (el !== 'unknown' && !ownedByElement[el].some(u => u.id === unit.id)) {
                ownedByElement[el].push(unit);
            }
        }
        if (isSubdps(unit, ownedUnits)) {
            if (unit.tags.includes('anomaly')) ownedSubdps.anomaly.push(unit);
            if (unit.tags.includes('attack')) ownedSubdps.attack.push(unit);
        }
        if ((unit.tags.includes('support') || unit.tags.includes('defense')) && !primaryArch) {
            ownedSupports.push(unit);
        }
        if (unit.tags.includes('stun')) {
            ownedStunners.push(unit);
        }
    }

    const allOwnedDPS = [
        ...new Set([...ownedDPS.attack, ...ownedDPS.anomaly, ...ownedDPS.rupture, ...ownedDPS.armorer])
    ];

    const dpsQuality = {};
    for (const arch of DPS_ARCHETYPES) {
        const primaryUnits = ownedDPS[arch].filter(u => !isSubdps(u));
        const best = getBestTier(primaryUnits);
        dpsQuality[arch] = best !== null ? tierToQuality(best) : 0;
    }
    const supportBest = getBestTier(ownedSupports);
    const supportQuality = supportBest !== null ? tierToQuality(supportBest) : 0;
    const stunnerBest = getBestTier(ownedStunners);
    const stunnerQuality = stunnerBest !== null ? tierToQuality(stunnerBest) : 0;
    const elementQuality = {};
    for (const el of ELEMENTS) {
        const primaryElUnits = ownedByElement[el].filter(u => !isSubdps(u));
        const best = getBestTier(primaryElUnits);
        elementQuality[el] = best !== null ? tierToQuality(best) : 0;
    }

    const qualities = [
        dpsQuality.attack, dpsQuality.anomaly, dpsQuality.rupture, dpsQuality.armorer,
        supportQuality, stunnerQuality
    ];
    const compositeScore = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
    const calibration = compositeScore > 80 ? 0.70 + (95 - Math.min(compositeScore, 95)) * 0.005 :
                        compositeScore > 55 ? 0.85 + (80 - compositeScore) * 0.003 :
                        1.0;

    const gaps = [];
    const unownedLimitedS = allUnits.filter(u =>
        u.rank === 'S' && u.limited && !unitStates[u.id]?.owned
    );

    const unitByName = {};
    for (const u of allUnits) unitByName[u.name] = u;
    const ownedByName = {};
    for (const u of ownedUnits) ownedByName[u.name] = u;

    const sortWithDPS = (units) => sortCandidates(units, allOwnedDPS);
    const legality = makeTeamLegality(ownedUnits);
    const opportunitySet = new Set(opportunityIds);

    detectDPSGaps(gaps, dpsQuality, ownedDPS, unownedLimitedS, sortWithDPS);
    detectSupportGaps(gaps, ownedSupports, ownedDPS, dpsQuality, unownedLimitedS, legality);
    detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortWithDPS, legality);
    detectStunnerElementGap(gaps, ownedStunners, ownedByElement, elementQuality, unownedLimitedS, sortWithDPS, legality);
    detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortWithDPS, ownedUnits);
    detectAnomalyPartnerGap(gaps, ownedUnits, ownedDPS, ownedSubdps, unownedLimitedS, dpsQuality);
    detectElementGaps(gaps, elementQuality, ownedByElement, unownedLimitedS, sortWithDPS);
    detectSynergies(gaps, ownedUnits, unownedLimitedS, unitByName, ownedByName, dpsQuality, elementQuality);
    const unitGapScoreOverrides = new Map(); // individual unit scores for mech-synergy gaps
    detectMechanicalSynergies(gaps, ownedUnits, unownedLimitedS, dpsQuality, elementQuality, unitGapScoreOverrides, legality);
    detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortWithDPS);
    detectBannerT0s(gaps, unownedLimitedS, opportunitySet);

    // Remove (not just deprioritize) codependent units that can't form a team or activate
    // their buffs, and laddered units with no rung — see codependency-gating.md and
    // partner-ladder.md. Only the affected unit is dropped; the rest of its gap card survives.
    const excludedIds = new Set();
    const ladders = new Map(); // unitId → partner-ladder verdict, for units that have one
    for (const candidate of unownedLimitedS) {
        if (!candidate.mechanics?.scaling?.codependent) continue;
        const dep = checkTeamDependencies(candidate, ownedUnits, allUnits);
        if (dep.cannotFormTeam || dep.cannotActivateBuffs) excludedIds.add(candidate.id);
        const ladder = getPartnerLadder(candidate, ownedUnits, allUnits);
        if (ladder) {
            ladders.set(candidate.id, ladder);
            if (ladder.rung === null) excludedIds.add(candidate.id);
            else detectLadderTeam(gaps, candidate, ladder);
        }
    }
    if (excludedIds.size > 0) {
        for (const gap of gaps) {
            if (gap.units) gap.units = gap.units.filter(u => !excludedIds.has(u.id));
        }
    }

    for (const gap of gaps) {
        gap.rawScore = gap.score;
        gap.score = Math.max(
            Math.round(gap.score * calibration),
            compositeScore > 70 ? Math.round(gap.rawScore * 0.35) : 0
        );
    }

    gaps.sort((a, b) => b.score - a.score);

    // Relative priority for a loaded roster (see cards-and-priority.md#priority). Stored on
    // gap.priority so external consumers reuse this logic rather than re-deriving it.
    const maxCalScore = gaps.length > 0 ? gaps[0].score : 0;
    const useRelativePriority = compositeScore > 75 && maxCalScore > 0 && maxCalScore < 70;

    function assignPriority(calScore, rawScore) {
        if (!useRelativePriority) {
            return calScore >= 70 ? 'High' : calScore >= 40 ? 'Medium' : 'Low';
        }
        if (rawScore < 15) return 'Low';
        if (calScore >= maxCalScore * 0.75) return 'High';
        if (calScore >= maxCalScore * 0.45) return 'Medium';
        return 'Low';
    }

    for (const gap of gaps) {
        gap.priority = assignPriority(gap.score, gap.rawScore);
    }

    // Invert gaps into unit-centric cards: each candidate's highest-scoring (primary) gap
    // decides its one display card, and the rest surface as "Also:" reasons. See
    // cards-and-priority.md#the-inversion.
    const GAP_PRIORITY_RANK = { 'High': 2, 'Medium': 1, 'Low': 0 };
    const PRIORITY_VALS = { High: 2, Medium: 1, Low: 0 };

    const unitProfiles = new Map(); // unitId → { unit, contributions: [{gap, unitScore}] }
    for (const gap of gaps) {
        for (const unit of gap.units) {
            if (!unitProfiles.has(unit.id)) {
                unitProfiles.set(unit.id, { unit, contributions: [] });
            }
            const rawOverride = unitGapScoreOverrides.get(`${unit.id}:${gap.id}`);
            const unitScore = rawOverride !== undefined
                ? Math.max(
                    Math.round(rawOverride * calibration),
                    compositeScore > 70 ? Math.round(rawOverride * 0.35) : 0
                  )
                : gap.score;
            unitProfiles.get(unit.id).contributions.push({ gap, unitScore });
        }
    }
    // Sort each unit's contributions highest-first → contributions[0] is the primary gap
    for (const profile of unitProfiles.values()) {
        profile.contributions.sort((a, b) => b.unitScore - a.unitScore);
    }

    // Group units by their primary gap — one display card per primary gap
    const cardsByGapId = new Map(); // gapId → { gap, profiles: [] }
    for (const profile of unitProfiles.values()) {
        const { gap } = profile.contributions[0];
        if (!cardsByGapId.has(gap.id)) {
            cardsByGapId.set(gap.id, { gap, profiles: [] });
        }
        cardsByGapId.get(gap.id).profiles.push(profile);
    }
    for (const card of cardsByGapId.values()) {
        card.profiles.sort((a, b) => b.contributions[0].unitScore - a.contributions[0].unitScore);
        card.cardScore = card.profiles[0].contributions[0].unitScore;
    }

    // Refresh reasons to the units that ended up in each card, not the full detection group.
    for (const card of cardsByGapId.values()) {
        if (card.gap.id.startsWith('mech-synergy-') && card.gap.bestPairName) {
            const cardUnits = card.profiles.map(p => p.unit);
            card.gap.reason = buildMechSynergyReason(cardUnits, card.gap.bestPairName);
        }
    }

    const sortedCards = [...cardsByGapId.values()].sort((a, b) => b.cardScore - a.cardScore);

    // Composite priority: ≥3 Medium contributions → High; ≥3 Low → Medium
    function getCompositePriority(profile) {
        let highCount = 0, medCount = 0, lowCount = 0;
        for (const { gap } of profile.contributions) {
            if (gap.priority === 'High') highCount++;
            else if (gap.priority === 'Medium') medCount++;
            else lowCount++;
        }
        let pri = profile.contributions[0].gap.priority;
        if (medCount >= 3 && pri !== 'High') pri = 'High';
        else if (lowCount >= 3 && pri === 'Low') pri = 'Medium';
        return pri;
    }

    // Codependency/ladder penalty is computed per unit, not per card, then the card is split
    // below. [PULL-02]
    const PRIORITY_ORDER = ['High', 'Medium', 'Low', null];
    function dropPriority(current, levels) {
        const idx = PRIORITY_ORDER.indexOf(current);
        return PRIORITY_ORDER[Math.min(idx + levels, PRIORITY_ORDER.length - 1)];
    }
    function capPriority(current, ceiling) {
        // A ceiling never raises a priority — a great partner does not manufacture a need.
        return PRIORITY_ORDER.indexOf(ceiling) > PRIORITY_ORDER.indexOf(current) ? ceiling : current;
    }

    function ladderNotes(ladder) {
        const notes = [];
        if (ladder.rung === null) {
            notes.push({
                text: `Needs ${ladder.need} other agents of her kind on your roster — you have ${ladder.have}`,
                providers: []
            });
        } else {
            if (ladder.blocked) {
                // No providers, deliberately: formatDependencyReason substitutes a "more
                // valuable pull with X" sentence whenever providers are present, which
                // cannot express an element clash.
                notes.push({
                    text: `Your ${ladder.partner.name} and ${ladder.second.name} share an element — nothing for them to react with`,
                    providers: []
                });
            }
            if (ladder.better.length > 0) {
                notes.push({
                    text: `Works with your ${ladder.partner.name}, but reaches full potential with ${ladder.better.slice(0, 2).map(p => p.name).join(' or ')}`,
                    providers: ladder.better
                });
            }
        }
        return notes.length > 0 ? notes : null;
    }

    const penaltyCache = new Map();
    function unitPenalty(unit, basePriority) {
        const key = `${unit.id}:${basePriority}`;
        if (penaltyCache.has(key)) return penaltyCache.get(key);

        let result = { priority: basePriority, notes: null };
        const ladder = ladders.get(unit.id) ?? getPartnerLadder(unit, ownedUnits, allUnits);
        if (ladder) {
            // Ladder replaces the generic codependency drop rather than stacking with it —
            // see partner-ladder.md#it-replaces-codependency-gating-it-does-not-stack.
            result = { priority: capPriority(basePriority, ladder.rung), notes: ladderNotes(ladder) };
        } else {
            const dep = checkTeamDependencies(unit, ownedUnits, allUnits);
            if (dep.hasUnmetDependency || dep.cannotFormTeam) {
                const severe = dep.cannotFormTeam || dep.cannotActivateBuffs;
                result = { priority: dropPriority(basePriority, severe ? 2 : 1), notes: dep.notes };
            }
        }
        penaltyCache.set(key, result);
        return result;
    }

    // Banner T0s floor at High; a support or stunner no owned carry can field floors a level
    // lower. Applied before the codependency/ladder penalty so that still discounts. [PULL-06]
    function bannerFloor(unit) {
        if (!isBannerT0(unit, opportunitySet)) return null;
        if (hasDPSRole(unit)) return 'High';
        return DPS_ARCHETYPES.some(a => legality.canFieldWith(unit, a)) ? 'High' : 'Medium';
    }
    function raiseTo(current, floor) {
        return floor && PRIORITY_VALS[floor] > PRIORITY_VALS[current] ? floor : current;
    }
    // A laddered unit's rung is its verdict: raised to it here, capped at it by the penalty. [PULL-01]
    function unitVerdict(unit, basePriority) {
        const floored = raiseTo(raiseTo(basePriority, bannerFloor(unit)), ladders.get(unit.id)?.rung ?? null);
        return unitPenalty(unit, floored);
    }

    // Card priority = highest composite priority among its first five units
    function cardPriorityOf(card) {
        return card.profiles.slice(0, 5)
            .map(p => getCompositePriority(p))
            .reduce((best, p) => PRIORITY_VALS[p] > PRIORITY_VALS[best] ? p : best, 'Low');
    }

    // Each unit judged on its own, from the same steps the cards use, for every card — not just
    // the ones that make the list. The budget below turns these into relative verdicts. [PULL-05]
    const absoluteVerdicts = new Map();
    for (const card of sortedCards) {
        const cardPriority = cardPriorityOf(card);
        card.profiles.forEach((profile, i) => {
            const base = i < 5 ? cardPriority : getCompositePriority(profile);
            const { priority } = unitVerdict(profile.unit, base);
            if (priority) absoluteVerdicts.set(profile.unit.id, priority);
        });
    }

    const teamCoverage = buildTeamCoverage(dpsQuality, ownedStunners, ownedSupports, legality);
    const narrowArch = findNarrowArchetype(dpsQuality, teamCoverage);
    const fieldedArchs = DPS_ARCHETYPES.filter(a => dpsQuality[a] > 0);
    const ownedById = new Map(ownedUnits.map(u => [u.id, u]));

    // The archetypes whose teams a unit improves, from the gaps it answers. A support or stunner
    // must actually fit an owned carry of that archetype — joining is not activating. [PULL-08]
    function roleServes(unit) {
        const arch = getPrimaryDPSArchetype(unit);
        if (arch) return [arch];
        return fieldedArchs.filter(a => legality.carriesByArch[a].some(c =>
            legality.canShareTeam(unit, c) && mechanicsFitScore(unit, c) >= SUPPORT_GOOD_FIT));
    }
    function gapServes(gap, unit) {
        const m = gap.id.match(/^(?:dps|depth|support)-(\w+)$/);
        if (m && DPS_ARCHETYPES.includes(m[1])) return [m[1]];
        if (gap.id === 'stunner' || gap.id === 'stunner-depth' || gap.id.startsWith('stunner-element-')) {
            const own = roleServes(unit);
            return gap.serves ? own.filter(a => gap.serves.includes(a)) : own;
        }
        if (gap.id === 'subdps-anomaly' || gap.id === 'anomaly-partner') return ['anomaly'];
        if (gap.id.startsWith('ladder-')) return [ladderCountTag(unit)?.tag].filter(a => DPS_ARCHETYPES.includes(a));
        if (gap.id.startsWith('mech-synergy-')) {
            const partner = ownedById.get(gap.id.slice('mech-synergy-'.length));
            const partnerArch = partner && !isSubdps(partner) ? getPrimaryDPSArchetype(partner) : null;
            if (partnerArch) return [partnerArch];
        }
        return roleServes(unit);
    }
    const unitServes = new Map();
    for (const profile of unitProfiles.values()) {
        const set = new Set();
        for (const { gap } of profile.contributions) for (const a of gapServes(gap, profile.unit)) set.add(a);
        unitServes.set(profile.unit.id, set);
    }

    const recommendations = [];
    for (const card of sortedCards) {
        const cardProfiles = card.profiles.slice(0, 5);
        const cardUnits = cardProfiles.map(p => p.unit);

        const cardPriority = cardPriorityOf(card);
        const cardPriorityRank = GAP_PRIORITY_RANK[cardPriority] ?? 0;

        const isMechSynergyCard = card.gap.id.startsWith('mech-synergy-') && card.gap.bestPairName;

        // Mech-synergy cards title on the recommended name(s) — "Lighter, Norma" over "Synergy with Evelyn".
        const displayTitle = isMechSynergyCard
            ? cardUnits.map(u => u.name).join(', ')
            : card.gap.title;

        let displayReason = card.gap.reason;
        if (isMechSynergyCard) {
            displayReason = buildMechSynergyReason(cardUnits, card.gap.bestPairName);
        }

        // mechSynergyByUnit collapses multiple pairs per unit into one sentence; structuralReasons dedupes by gap ID.
        const mechSynergyByUnit = new Map(); // unitName → { pairs: Set, priority }
        const structuralReasons  = new Map(); // gapId    → { reason, priority }

        for (const profile of cardProfiles) {
            for (const { gap: secGap, unitScore } of profile.contributions.slice(1)) {
                const gRank = GAP_PRIORITY_RANK[secGap.priority] ?? 0;
                if (gRank < cardPriorityRank - 1) continue;
                if (unitScore < 20) continue;

                if (secGap.id.startsWith('mech-synergy-') && secGap.bestPairName) {
                    const key = profile.unit.name;
                    if (!mechSynergyByUnit.has(key)) {
                        mechSynergyByUnit.set(key, { pairs: new Set(), priority: secGap.priority });
                    }
                    mechSynergyByUnit.get(key).pairs.add(secGap.bestPairName);
                } else if (!structuralReasons.has(secGap.id)) {
                    structuralReasons.set(secGap.id, { reason: secGap.reason, priority: secGap.priority });
                }
            }
        }

        // Format mech-synergy entries: one sentence per unit, listing all pairs
        const additionalReasons = [];
        for (const [unitName, { pairs, priority }] of mechSynergyByUnit) {
            const pairList = [...pairs];
            const reason = pairList.length === 1
                ? `${unitName} has mechanical synergy with your ${pairList[0]}`
                : `${unitName} has mechanical synergy with some of your existing units: ${pairList.join(', ')}`;
            additionalReasons.push({ reason, priority });
        }
        for (const entry of structuralReasons.values()) {
            additionalReasons.push(entry);
        }
        additionalReasons
            .sort((a, b) => (GAP_PRIORITY_RANK[b.priority] ?? 0) - (GAP_PRIORITY_RANK[a.priority] ?? 0));
        additionalReasons.splice(3); // cap at 3 entries per card

        // Each penalized group splits off as its own unit-titled recommendation.
        const groups = new Map(); // priority (or 'null') → { priority, profiles, notes }
        for (const profile of cardProfiles) {
            const { priority, notes } = unitVerdict(profile.unit, cardPriority);
            const key = String(priority);
            if (!groups.has(key)) groups.set(key, { priority, profiles: [], notes: null });
            const g = groups.get(key);
            g.profiles.push(profile);
            if (notes && !g.notes) g.notes = notes;
        }

        for (const group of groups.values()) {
            if (group.priority === null) continue;   // dropped out of the list entirely
            const groupUnits = group.profiles.map(p => p.unit);
            const split = group.priority !== cardPriority;
            const rec = {
                priority: group.priority,
                title: split ? groupUnits.map(u => u.name).join(', ') : displayTitle,
                reason: displayReason,
                additionalReasons: split ? [] : additionalReasons,
                score: group.profiles[0].contributions[0].unitScore,
                rawScore: card.gap.rawScore ?? card.gap.score,
                units: groupUnits
            };
            if (group.notes) rec.teamDependencyNotes = group.notes;
            Object.defineProperty(rec, '_card', { value: card, enumerable: false });
            recommendations.push(rec);
        }
    }

    // Priority budget: rank every entry the way a player would choose pulls, then let only the
    // first few keep High or Medium. Demotes, never promotes. [PULL-08]
    const picked = new Set();
    const freshOf = (serves) => [...serves].filter(a => !picked.has(a) && a !== narrowArch);
    const isPullable = (u) => opportunitySet.has(u.id);
    const servesOf = (u) => [...(unitServes.get(u.id) ?? [])];
    const compareKeys = (a, b) => {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
        return 0;
    };
    // An entry is a set of alternatives you'd pull one of, so it ranks as its best unit.
    const unitRankKey = (u, rec) => {
        const serves = servesOf(u);
        const fresh = freshOf(serves);
        const narrowOnly = !!narrowArch && serves.length > 0 && serves.every(a => a === narrowArch);
        const bannerT0 = isBannerT0(u, opportunitySet) && absoluteVerdicts.get(u.id) === 'High';
        return [bannerT0 ? 1 : 0, narrowOnly ? 0 : 1, fresh.length > 0 ? 1 : 0, isPullable(u) ? 1 : 0,
            fresh.length, rec.score, -u.tier];
    };
    const rankKey = (rec) => rec.units.map(u => unitRankKey(u, rec)).sort(compareKeys)[0];

    // How a unit compares with its entry's lead: same fresh coverage, same availability. [PULL-08]
    const unitStanding = (u) => {
        const fresh = freshOf(unitServes.get(u.id) ?? []);
        return { fresh: fresh.sort().join(','), pullable: isPullable(u), count: fresh.length };
    };
    const sameStanding = (a, b) => a.fresh === b.fresh && a.pullable === b.pullable && a.count === b.count;

    const ordered = [];
    const remaining = [...recommendations];
    const budgetUsed = { High: 0, Medium: 0 };
    const unitVerdicts = new Map();
    const capAt = (priority, ceiling) => PRIORITY_ORDER.indexOf(priority) < PRIORITY_ORDER.indexOf(ceiling) ? ceiling : priority;
    while (remaining.length > 0) {
        let bestIdx = 0;
        for (let i = 1; i < remaining.length; i++) {
            if (compareKeys(rankKey(remaining[i]), rankKey(remaining[bestIdx])) < 0) bestIdx = i;
        }
        const rec = remaining.splice(bestIdx, 1)[0];

        // Alternatives that match the lead keep the entry's priority; the rest sit one level lower.
        const standings = new Map(rec.units.map(u => [u.id, unitStanding(u)]));
        const lead = [...rec.units].sort((a, b) => compareKeys(unitRankKey(a, rec), unitRankKey(b, rec)))[0];
        rec.serves = servesOf(lead);
        const leadStanding = standings.get(lead.id);
        const matchesLead = (u) => sameStanding(standings.get(u.id), leadStanding);
        rec.units = [...rec.units.filter(matchesLead), ...rec.units.filter(u => !matchesLead(u))];

        const before = rec.priority;
        if (before === 'High' && budgetUsed.High < PRIORITY_BUDGET.High) {
            budgetUsed.High++;
        } else if ((before === 'High' || before === 'Medium') && budgetUsed.Medium < PRIORITY_BUDGET.Medium) {
            rec.priority = 'Medium';
            budgetUsed.Medium++;
        } else {
            rec.priority = 'Low';
        }
        if (rec.priority !== before) rec.budgetedFrom = before;

        const verdictFor = (u) => {
            const own = absoluteVerdicts.get(u.id) ?? rec.priority;
            const entryLevel = matchesLead(u) ? rec.priority : dropPriority(rec.priority, 1) ?? 'Low';
            return capAt(own, entryLevel);
        };
        for (const u of rec.units) {
            if (!unitVerdicts.has(u.id)) unitVerdicts.set(u.id, verdictFor(u));
        }
        // Profiles past a card's first five are not shown; they follow the card's first entry.
        if (!rec._card._budgeted) {
            Object.defineProperty(rec._card, '_budgeted', { value: true });
            for (const profile of rec._card.profiles.slice(5)) {
                const u = profile.unit;
                if (!absoluteVerdicts.has(u.id) || unitVerdicts.has(u.id)) continue;
                standings.set(u.id, unitStanding(u));
                unitVerdicts.set(u.id, verdictFor(u));
            }
        }

        rec.serves.forEach(a => picked.add(a));
        ordered.push(rec);
    }

    const filteredRecommendations = ordered
        .map((rec, i) => ({ rec, i }))
        .sort((a, b) => ((PRIORITY_VALS[b.rec.priority] ?? 0) - (PRIORITY_VALS[a.rec.priority] ?? 0)) || (a.i - b.i))
        .map(x => x.rec)
        .slice(0, maxRecommendations);

    const limitedSCount = ownedUnits.filter(u => u.rank === 'S' && u.limited).length;
    const highPriorityGapCount = gaps.filter(g => g.priority === 'High').length;
    const assessment = buildAssessment(
        dpsQuality, supportQuality, stunnerQuality, elementQuality,
        compositeScore, limitedSCount,
        { ownedDPS, ownedSupports, ownedStunners },
        highPriorityGapCount, gaps, teamCoverage
    );

    return {
        assessment,
        recommendations: filteredRecommendations,
        unitVerdicts,
        absoluteVerdicts,
        coverage: {
            dpsQuality, supportQuality, stunnerQuality, elementQuality,
            ownedDPS, ownedSubdps, ownedSupports, ownedStunners, ownedByElement,
            teamCoverage
        },
        allGaps: gaps,
        compositeScore,
        calibration
    };
}

function detectDPSGaps(gaps, dpsQuality, ownedDPS, unownedLimitedS, sortCandidatesFn) {
    for (const arch of DPS_ARCHETYPES) {
        const quality = dpsQuality[arch];
        if (quality >= 75) continue;

        let score = quality === 0 ? 100 :
                    quality <= 25 ? 80 :
                    quality <= 40 ? 50 : 30;

        const hasAnySRank = ownedDPS[arch].some(u => u.rank === 'S');
        if (!hasAnySRank && score < 50) score = 50;

        const hasSubdpsOnly = quality === 0 && ownedDPS[arch].some(u => isSubdps(u));
        const primaryCount = ownedDPS[arch].filter(u => !isSubdps(u)).length;
        const reason = hasSubdpsOnly
            ? `You have ${arch} sub-DPS agents but no primary ${arch} DPS to lead your teams`
            : quality === 0
            ? `You have no ${arch} DPS at all`
            : quality <= 25
            ? `Your ${arch} DPS coverage is very weak — a premium ${arch} DPS would be a major upgrade`
            : !hasAnySRank
            ? `Your ${arch} coverage relies entirely on A-rank options — a premium DPS would be a significant upgrade`
            : quality <= 40
            ? `Your best ${arch} option is borderline — a premium DPS would be a major improvement`
            : primaryCount <= 1
            ? `Your ${arch} options are limited to a single primary DPS — more options would give team-building flexibility`
            : `You have decent ${arch} coverage, but a premium option would strengthen your roster`;

        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => getPrimaryDPSArchetype(u) === arch && !isSubdps(u))
        );

        if (candidates.length > 0) {
            gaps.push({ id: `dps-${arch}`, title: `${capitalize(arch)} DPS`, reason, score, units: candidates });
        }
    }
}

function detectSupportGaps(gaps, ownedSupports, ownedDPS, dpsQuality, unownedLimitedS, legality) {
    const ownedLimitedSupports = ownedSupports.filter(u => u.rank === 'S' && u.limited);
    const supportCandidates = unownedLimitedS.filter(u =>
        !hasDPSRole(u) && (u.tags.includes('support') || u.tags.includes('defense'))
    );
    if (supportCandidates.length === 0) return;

    // General gap: no premium support at all
    if (ownedLimitedSupports.length === 0) {
        gaps.push({
            id: 'support', title: 'Premium Support',
            reason: 'Your roster has no premium supports — a strong support multiplies your existing DPS significantly',
            score: 80,
            units: [...supportCandidates].sort((a, b) => a.tier - b.tier)
        });
        return;
    }

    // Per-archetype: only premium (limited S) supports count toward coverage — A-ranks are
    // stopgaps and shouldn't mask the need for a real one.
    const hasFewPremiumSupports = ownedLimitedSupports.length <= 1;

    for (const arch of DPS_ARCHETYPES) {
        if (dpsQuality[arch] <= 0) continue;

        const primaryUnits = ownedDPS[arch].filter(u => !isSubdps(u));
        if (primaryUnits.length === 0) continue;
        const bestDPS = primaryUnits.reduce((best, u) => u.tier < best.tier ? u : best);
        // Legal teams with this carry, not join tags alone — Sunna reaches anomaly through Nangong. [PULL-07]
        const canJoinArchetype = (unit) => legality.canShareTeam(unit, bestDPS);

        const archCompatibleOwned = ownedLimitedSupports.filter(s => canJoinArchetype(s));
        const bestOwnedFit = archCompatibleOwned.reduce(
            (max, s) => Math.max(max, mechanicsFitScore(s, bestDPS)), 0
        );
        if (bestOwnedFit >= SUPPORT_GOOD_FIT) continue;

        const MIN_CANDIDATE_FIT = SUPPORT_GOOD_FIT / 3;
        const ranked = supportCandidates
            .filter(c => canJoinArchetype(c))
            .map(c => ({ unit: c, fit: mechanicsFitScore(c, bestDPS) }))
            .filter(c => c.fit > bestOwnedFit && c.fit >= MIN_CANDIDATE_FIT)
            .sort((a, b) => {
                if (a.unit.tier !== b.unit.tier) return a.unit.tier - b.unit.tier;
                return b.fit - a.fit;
            })
            .map(x => x.unit);
        if (ranked.length === 0) continue;

        // Fit below a minimum threshold counts as zero — a tiny incidental
        // contribution is not real coverage.
        const effectiveFit = bestOwnedFit < 5 ? 0 : bestOwnedFit;
        const coverage = effectiveFit / SUPPORT_GOOD_FIT;
        // High base when DPS is strong OR when the player has very few premium
        // supports — a single specialist support leaves other archetypes exposed.
        const baseScore = (dpsQuality[arch] >= 75 || hasFewPremiumSupports) ? 80 : 65;
        const score = Math.round(baseScore * (1 - coverage));

        const reason = bestOwnedFit < 5
            ? `Your ${arch} teams have no well-fitted support — a strong ${arch}-compatible support would be a major upgrade`
            : `Your best support for ${arch} teams is a weak fit — a better ${arch}-compatible support would significantly improve your teams`;

        gaps.push({
            id: `support-${arch}`,
            title: `${capitalize(arch)} Support`,
            reason,
            score,
            units: ranked
        });
    }
}

function detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortCandidatesFn, legality) {
    const ownedLimitedStunners = ownedStunners.filter(u => u.rank === 'S' && u.limited);
    const limitedStunnerCount = ownedLimitedStunners.length;

    // A limited stunner only covers the team types it can legally join. [PULL-07]
    const PLAYED_QUALITY = 40;
    const played = DPS_ARCHETYPES.filter(a => dpsQuality[a] >= PLAYED_QUALITY);
    const uncovered = played.filter(a => !ownedLimitedStunners.some(s => legality.canFieldWith(s, a)));

    if (limitedStunnerCount > 0 && uncovered.length > 0) {
        const fallback = ownedStunners.filter(s => uncovered.some(a => legality.canFieldWith(s, a)));
        const fallbackBest = getBestTier(fallback);
        const fallbackQuality = fallbackBest !== null ? tierToQuality(fallbackBest) : 0;
        const score = fallbackQuality <= 10 ? 70 :
                      fallbackQuality <= 25 ? 55 :
                      fallbackQuality <= 40 ? 45 : 35;
        const names = ownedLimitedStunners.map(u => u.name);
        const nameList = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
        const archList = uncovered.length === 1 ? uncovered[0] : `${uncovered.slice(0, -1).join(', ')} or ${uncovered.at(-1)}`;
        const reason = `Your limited stunner${names.length === 1 ? '' : 's'} ${nameList} can't join your ${archList} teams — a premium stunner for those would greatly strengthen them`;
        const candidates = sortCandidatesFn(unownedLimitedS.filter(u =>
            u.tags.includes('stun') && uncovered.some(a => legality.canFieldWith(u, a))
        ));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner', title: 'Premium Stunner', reason, score, units: candidates, serves: uncovered });
        }
        return;
    }

    if (limitedStunnerCount === 0) {
        const score = stunnerQuality <= 10 ? 70 :
                      stunnerQuality <= 25 ? 55 :
                      stunnerQuality <= 40 ? 45 : 35;

        const reason = stunnerQuality <= 10
            ? 'You have no premium stunners — only A-rank options'
            : stunnerQuality <= 25
            ? 'Your best stunner is a lower-tier standard S-rank — an upgrade would greatly strengthen your teams'
            : stunnerQuality <= 40
            ? 'Your stunner options are limited — a premium stunner would improve team flexibility'
            : 'You have standard stunner options but no limited S-rank — a premium stunner would add flexibility for tougher content';

        const candidates = sortCandidatesFn(unownedLimitedS.filter(u => u.tags.includes('stun')));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner', title: 'Premium Stunner', reason, score, units: candidates });
        }
    } else if (limitedStunnerCount === 1) {
        let score = 40;
        if (dpsQuality.attack >= 75 || dpsQuality.rupture >= 75 || dpsQuality.armorer >= 75) score = 50;
        if (dpsQuality.attack >= 75 && (dpsQuality.rupture >= 75 || dpsQuality.armorer >= 75)) score = 60;

        const reason = 'You only have one limited stunner — a second option would give flexibility across different team compositions';
        const candidates = sortCandidatesFn(unownedLimitedS.filter(u => u.tags.includes('stun')));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner-depth', title: 'Stunner Coverage', reason, score, units: candidates });
        }
    }
}

function detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortCandidatesFn, ownedUnits) {
    const anomBest = getBestTier(ownedSubdps.anomaly.filter(u => isReactionPartner(u)));
    const anomSubdpsQuality = anomBest !== null ? tierToQuality(anomBest) : 0;
    if (dpsQuality.anomaly >= 50 && anomSubdpsQuality < 40) {
        const score = anomSubdpsQuality === 0 ? 45 : 35;
        // Two on-field carries of different elements already react; the sub-DPS is the upgrade. [GAP-02]
        const carries = ownedUnits.filter(u => isReactionPartner(u) && !isSubdps(u, ownedUnits));
        const carriesReact = carries.some(a => carries.some(b => getDisorderElement(a) !== getDisorderElement(b)));
        const reason = carriesReact && anomSubdpsQuality === 0
            ? 'Your anomaly carries can react with each other, but an off-field sub-DPS partner is the stronger setup'
            : anomSubdpsQuality === 0
            ? 'Anomaly teams perform best with two anomaly agents — you need a sub-DPS partner'
            : 'Anomaly teams perform best with two anomaly agents — your current sub-DPS is too weak to reliably fill this role';
        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => isSubdps(u, ownedUnits) && isReactionPartner(u))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: 'subdps-anomaly',
                title: 'Anomaly Sub-DPS',
                reason,
                score,
                units: candidates
            });
        }
    }

    const atkBest = getBestTier(ownedSubdps.attack);
    const atkSubdpsQuality = atkBest !== null ? tierToQuality(atkBest) : 0;
    if (dpsQuality.attack >= 75 && atkSubdpsQuality < 50) {
        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes('attack') && isSubdps(u, ownedUnits))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: 'subdps-attack',
                title: 'Attack Sub-DPS',
                reason: 'You have strong attack DPS but no attack sub-DPS partner — niche, but adds flexibility',
                score: 20,
                units: candidates
            });
        }
    }
}

function detectAnomalyPartnerGap(gaps, ownedUnits, ownedDPS, ownedSubdps, unownedLimitedS, dpsQuality) {
    const primaryAnomalyOwned = ownedDPS.anomaly.filter(u => !isSubdps(u));
    if (primaryAnomalyOwned.length === 0) return;

    // Lumen units have no anomaly gauge — they neither need nor supply reactions. [GAP-02]
    const nonLumenPrimary = primaryAnomalyOwned.filter(u => !isLumenElement(u));

    const ownedPseudoAnomaly = ownedUnits.filter(u => {
        if (isSubdps(u)) return false;
        const pr = u.mechanics?.pseudoRole;
        return Array.isArray(pr) && pr.some(entry => (typeof entry === 'string' ? entry : entry?.role) === 'anomaly');
    });
    // Any anomaly agent of another element is a partner, carries included; wind reacts through
    // vortex. A carry never partners itself — same element. [GAP-02]
    const disorderPartners = [
        ...ownedUnits.filter(u => isReactionPartner(u)),
        ...ownedPseudoAnomaly.filter(u => !isLumenElement(u))
    ].filter(p => nonLumenPrimary.some(dps => dps.id !== p.id));

    const PARTNER_QUALITY_THRESHOLD = 40;

    // Only check disorder coverage for non-lumen primary anomaly DPS
    if (nonLumenPrimary.length > 0) {
        const hasSufficientCoverage = disorderPartners.some(partner => {
            const partnerEl = getDisorderElement(partner);
            const partnerQuality = partner.tier != null ? tierToQuality(partner.tier) : 0;
            const coversAtLeastOneDPS = nonLumenPrimary.some(dps => getDisorderElement(dps) !== partnerEl);
            return coversAtLeastOneDPS && partnerQuality >= PARTNER_QUALITY_THRESHOLD;
        });

        if (!hasSufficientCoverage) {
            const uncoveredDPS = nonLumenPrimary.filter(dps => {
                const dpsEl = getDisorderElement(dps);
                return !disorderPartners.some(p =>
                    getDisorderElement(p) !== dpsEl &&
                    (p.tier != null ? tierToQuality(p.tier) : 0) >= PARTNER_QUALITY_THRESHOLD
                );
            });

            const candidates = unownedLimitedS
                .filter(u => {
                    if (isLumenElement(u)) return false;
                    const isAnoSubdps = isSubdps(u) && isReactionPartner(u);
                    const pr = u.mechanics?.pseudoRole;
                    const isPseudoAnomaly = Array.isArray(pr) && pr.some(entry => (typeof entry === 'string' ? entry : entry?.role) === 'anomaly') && !isSubdps(u);
                    return isAnoSubdps || isPseudoAnomaly;
                })
                .sort((a, b) => {
                    const aEl = getDisorderElement(a);
                    const bEl = getDisorderElement(b);
                    const aDiffers = nonLumenPrimary.some(dps => getDisorderElement(dps) !== aEl) ? 1 : 0;
                    const bDiffers = nonLumenPrimary.some(dps => getDisorderElement(dps) !== bEl) ? 1 : 0;
                    if (aDiffers !== bDiffers) return bDiffers - aDiffers;
                    return a.tier - b.tier;
                });

            if (candidates.length > 0) {
                const scoringDPS = uncoveredDPS.length > 0 ? uncoveredDPS : nonLumenPrimary;
                const bestTier = getBestTier(scoringDPS);
                const bestQuality = bestTier != null ? tierToQuality(bestTier) : 0;
                const score = bestQuality >= 75 ? 55 :
                              bestQuality >= 55 ? 45 : 35;

                const hasWeakPartner = disorderPartners.length > 0 &&
                    disorderPartners.every(p => (p.tier != null ? tierToQuality(p.tier) : 0) < PARTNER_QUALITY_THRESHOLD);

                const reason = disorderPartners.length === 0
                    ? `Your anomaly DPS have no anomaly partner — a different-element anomaly unit is needed to trigger disorders, or a wind unit to trigger vortexes`
                    : hasWeakPartner
                    ? `Your anomaly partner is too low-tier to reliably trigger reactions — a stronger different-element or wind anomaly partner is recommended`
                    : `Your anomaly partners share an element with your primary DPS — a different-element anomaly partner would unlock disorders, or a wind partner vortexes`;

                gaps.push({
                    id: 'anomaly-partner',
                    title: 'Anomaly Reaction Partner',
                    reason,
                    score,
                    units: candidates
                });
            }
        }
    }

    // Lumen anomaly partner needs (Refringe, conditional buffs) are handled generically:
    // conditional buff activation is checked in checkTeamDependencies Step 1b, and
    // Refringe benefits are emergent from scoring. No lumen-specific gap needed.
}

function detectElementGaps(gaps, elementQuality, ownedByElement, unownedLimitedS, sortCandidatesFn) {
    for (const el of ELEMENTS) {
        // Lumen agents deal a teammate's element via Attribute Mutation — there is no
        // "lumen elemental damage" and no boss has lumen weakness, so the gap is meaningless.
        if (el === 'lumen') continue;

        const quality = elementQuality[el];
        if (quality >= 55) continue; // Decent or better — not a meaningful gap

        const score = quality === 0 ? 60 : 50;

        // Primary DPS candidates first
        let candidates = sortCandidatesFn(
            unownedLimitedS.filter(u =>
                getUnitElement(u) === el && hasDPSRole(u) && !isSubdps(u)
            )
        );

        // If no primary DPS exist for this element (e.g. wind only has Velina as sub-DPS),
        // fall back to sub-DPS candidates — they still cover the element in content
        if (candidates.length === 0) {
            candidates = sortCandidatesFn(
                unownedLimitedS.filter(u =>
                    getUnitElement(u) === el && hasDPSRole(u)
                )
            );
        }

        // Element quality counts primary carries only, so say which kind of zero this is. [GAP-01]
        const hasSubdpsOnly = quality === 0 && (ownedByElement[el] || []).some(u => isSubdps(u));
        const reason = hasSubdpsOnly
            ? `You have ${capitalize(el)} sub-DPS agents but no primary ${capitalize(el)} DPS to lead your teams`
            : quality === 0
            ? `You have no DPS options for ${capitalize(el)} content`
            : `Your ${capitalize(el)} DPS is borderline — a premium option would significantly improve coverage`;

        if (candidates.length > 0) {
            gaps.push({
                id: `element-${el}`,
                title: `${capitalize(el)} DPS`,
                reason,
                score,
                units: candidates
            });
        }
    }
}

function detectStunnerElementGap(gaps, ownedStunners, ownedByElement, elementQuality, unownedLimitedS, sortCandidatesFn, legality) {
    const ownedLimitedStunners = ownedStunners.filter(u => u.rank === 'S' && u.limited);

    for (const el of ELEMENTS) {
        if (el === 'lumen') continue;
        if (elementQuality[el] < 55) continue;

        // Only a stunner who can join one of your carries of this element counts. [PULL-07]
        const elCarries = ownedByElement[el].filter(u => !isSubdps(u));
        const joinsElCarry = (s) => elCarries.some(c => legality.canShareTeam(s, c));
        if (ownedLimitedStunners.some(s => getUnitElement(s) === el && joinsElCarry(s))) continue;

        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes('stun') && getUnitElement(u) === el && joinsElCarry(u))
        );
        if (candidates.length === 0) continue;

        const score = elementQuality[el] >= 95 ? 50 : 40;
        gaps.push({
            id: `stunner-element-${el}`,
            title: `${capitalize(el)} Stunner`,
            reason: `You have no limited ${capitalize(el)} stunner — a premium option would strengthen your ${capitalize(el)} team flexibility`,
            score,
            units: candidates
        });
    }
}

function detectSynergies(gaps, ownedUnits, unownedLimitedS, unitByName, ownedByName, dpsQuality, elementQuality) {
    const rawSynergies = [];

    for (const unit of ownedUnits) {
        if (unit.rank !== 'S') continue;
        if (!unit.synergy?.units?.length) continue;
        for (const partnerName of unit.synergy.units) {
            const partner = unitByName[partnerName];
            if (!partner || !partner.limited || partner.rank !== 'S') continue;
            if (ownedByName[partner.name]) continue;
            rawSynergies.push({
                recommended: partner,
                ownedPartner: unit,
                type: 'named',
                score: 15
            });
        }
    }

    for (const unit of unownedLimitedS) {
        if (!unit.synergy?.units?.length) continue;
        for (const partnerName of unit.synergy.units) {
            const partner = ownedByName[partnerName];
            if (!partner || partner.rank !== 'S') continue;
            rawSynergies.push({
                recommended: unit,
                ownedPartner: partner,
                type: 'named',
                score: 15
            });
        }
    }

    for (const unit of unownedLimitedS) {
        if (!unit.synergy?.tags?.length) continue;
        const matchingTags = unit.synergy.tags.filter(tag => {
            if (DPS_ARCHETYPES.includes(tag)) return dpsQuality[tag] >= 75;
            if (ELEMENTS.includes(tag)) return elementQuality[tag] >= 75;
            return false;
        });
        if (matchingTags.length > 0) {
            rawSynergies.push({
                recommended: unit,
                ownedPartner: null,
                type: 'tag',
                score: 10,
                tags: matchingTags
            });
        }
    }

    const groups = {};
    for (const entry of rawSynergies) {
        const id = entry.recommended.id;
        if (!groups[id]) {
            groups[id] = { recommended: entry.recommended, pairs: new Set(), tagLabels: [], entries: [] };
        }
        const group = groups[id];
        group.entries.push(entry);
        if (entry.type === 'named') {
            const pairKey = [entry.ownedPartner.id, entry.recommended.id].sort().join(':');
            group.pairs.add(pairKey);
        } else if (entry.type === 'tag') {
            group.tagLabels.push(...entry.tags);
        }
    }

    for (const group of Object.values(groups)) {
        const rec = group.recommended;

        const recDPSArch = getPrimaryDPSArchetype(rec);
        if (recDPSArch && !isSubdps(rec)) {
            const recEl = getUnitElement(rec);
            if (dpsQuality[recDPSArch] >= 75 && recEl !== 'unknown' && elementQuality[recEl] >= 55) {
                continue;
            }
        }

        const pairCount = group.pairs.size;
        let score, reason;

        if (pairCount === 0) {
            score = 10;
            const tagStr = [...new Set(group.tagLabels)].map(capitalize).join('/');
            reason = `${group.recommended.name} has affinity with your strong ${tagStr} roster`;
        } else {
            const ownedNames = [...new Set(
                group.entries.filter(e => e.ownedPartner).map(e => e.ownedPartner.name)
            )];
            score = 15 + Math.max(0, pairCount - 1) * 5;
            reason = `${group.recommended.name} synergizes with your ${ownedNames.join(' and ')}`;
        }

        gaps.push({
            id: `synergy-${group.recommended.id}`,
            title: `Synergy: ${group.recommended.name}`,
            reason,
            score,
            units: [group.recommended]
        });
    }
}

function buildMechSynergyReason(units, pairName) {
    if (units.length === 1) {
        return `${units[0].name} has strong mechanical synergy with your ${pairName} and fits your roster well`;
    }
    const names = units.map(u => u.name);
    const last = names.pop();
    const qualifier = units.length === 2 ? 'both' : 'all';
    return `${names.join(', ')} and ${last} ${qualifier} have strong mechanical synergy with your ${pairName}`;
}

function detectMechanicalSynergies(gaps, ownedUnits, unownedLimitedS, dpsQuality, elementQuality, scoreOverrides, legality) {
    // Only pair against S-rank units with meaningful quality — A-ranks and garbage tiers
    // produce misleading recommendations ("synergizes with Anton" / "pairs with Harumasa").
    const MIN_PAIR_QUALITY = 40; // tier ≤ 1.5; excludes T2+ S-ranks like Harumasa
    const ownedSRankDPS = ownedUnits.filter(u =>
        u.rank === 'S' &&
        hasDPSRole(u) &&
        tierToQuality(u.tier ?? 4) >= MIN_PAIR_QUALITY
    );
    const ownedSRankNonDPS = ownedUnits.filter(u =>
        u.rank === 'S' && !hasDPSRole(u) &&
        (u.tags.includes('support') || u.tags.includes('defense') || u.tags.includes('stun'))
    );

    // Best existing fit an owned non-DPS provides per (DPS id, slot) — suppresses candidates
    // already covered by an owned unit. Slot is 'stun' or 'support'.
    const ownedStunUnits = ownedUnits.filter(u => u.tags.includes('stun'));
    const ownedSupportDefUnits = ownedUnits.filter(u =>
        !hasDPSRole(u) && (u.tags.includes('support') || u.tags.includes('defense'))
    );
    const bestOwnedFitForDPS = new Map();
    for (const dps of ownedSRankDPS) {
        const stunFits = ownedStunUnits
            .filter(u => u.id !== dps.id)
            .map(u => mechanicsFitScore(u, dps));
        const supportFits = ownedSupportDefUnits
            .filter(u => u.id !== dps.id)
            .map(u => mechanicsFitScore(u, dps));
        bestOwnedFitForDPS.set(dps.id, {
            stun: stunFits.length > 0 ? Math.max(...stunFits) : 0,
            support: supportFits.length > 0 ? Math.max(...supportFits) : 0
        });
    }

    // Score every candidate against ALL owned pairings, not just the best — a stunner like
    // Dialyn can register synergy with both YSG and Yixuan independently.
    const scoredCandidates = [];
    for (const candidate of unownedLimitedS) {
        const isDPSCandidate = hasDPSRole(candidate) && !isSubdps(candidate);
        const el = getUnitElement(candidate);

        // Hybrid units like Remielle both consume owned non-DPS support AND supply buffs
        // to owned DPS, so they're evaluated as both consumer and supplier.
        const isHybridSupplier = isDPSCandidate && (
            Object.values(getTeammateBuffs(candidate)).some(isConditionalSpec) ||
            (Array.isArray(candidate.mechanics?.pseudoRole) &&
             candidate.mechanics.pseudoRole.some(e => (typeof e === 'string' ? e : e?.role) === 'support'))
        );
        const targets = isDPSCandidate ? ownedSRankNonDPS : ownedSRankDPS;

        // Quality gate: skip DPS candidates whose archetype+element are already well-covered
        // Lumen DPS skip the element quality check — they don't deal lumen damage
        if (isDPSCandidate) {
            const arch = getPrimaryDPSArchetype(candidate);
            const skipElementCheck = el === 'lumen';
            if (arch && dpsQuality[arch] >= 75 && !skipElementCheck && el !== 'unknown' && elementQuality[el] >= 55) {
                continue;
            }
        }

        // Collect all pairs above the meaningful-synergy threshold
        const qualifyingPairs = [];
        for (const owned of targets) {
            // Join-compatibility gate: skip pairs where the two units can't coexist on a team
            if (!legality.canShareTeam(candidate, owned)) continue;

            const fit = isDPSCandidate
                ? mechanicsFitScore(owned, candidate)
                : mechanicsFitScore(candidate, owned);
            if (fit < 15) continue; // generic ATK+CD alone scores ~14; real mechanics (stun+defense, aftershock, ultimates) score 15+
            const pairScore = Math.min(45, Math.round(fit * 2.5));
            if (pairScore < 15) continue;

            // Redundancy check for non-DPS candidates: if an already-owned unit in the same
            // team slot provides equal or better fit with this DPS, the synergy is covered.
            if (!isDPSCandidate) {
                const slot = candidate.tags.includes('stun') ? 'stun' : 'support';
                const bestExisting = bestOwnedFitForDPS.get(owned.id)?.[slot] ?? 0;
                if (bestExisting >= fit) continue;
            }

            qualifyingPairs.push({ name: owned.name, id: owned.id, fit, score: pairScore });
        }

        // Also check this candidate as a supplier to owned DPS, over a broader pool (no
        // MIN_PAIR_QUALITY gate) — a hybrid supplier like Remielle benefits every anomaly
        // teammate equally, however low-tier.
        if (isHybridSupplier) {
            const hybridTargets = ownedUnits.filter(u =>
                u.rank === 'S' && hasDPSRole(u)
            );
            for (const owned of hybridTargets) {
                if (!legality.canShareTeam(candidate, owned)) continue;
                const fit = mechanicsFitScore(candidate, owned);
                if (fit < 15) continue;
                const pairScore = Math.min(45, Math.round(fit * 2.5));
                if (pairScore < 15) continue;
                if (qualifyingPairs.some(p => p.id === owned.id)) continue;
                qualifyingPairs.push({ name: owned.name, id: owned.id, fit, score: pairScore });
            }
        }

        if (qualifyingPairs.length === 0) continue;

        // Sort pairs by descending fit so [0] is the best
        qualifyingPairs.sort((a, b) => b.fit - a.fit);
        const bestFit = qualifyingPairs[0].fit;

        // Keep pairs within 75% of the best — drops generic pairings (ATK+CD alone scores
        // ~14) while keeping close runners-up like Dialyn→Yixuan beside Dialyn→YSG.
        const PAIR_PROXIMITY = 0.75;
        for (const pair of qualifyingPairs) {
            if (pair.fit < bestFit * PAIR_PROXIMITY) break; // sorted, so we can break early
            scoredCandidates.push({
                candidate,
                score: pair.score,
                bestPairName: pair.name,
                bestPairId: pair.id
            });
        }
    }

    // Group candidates by their best mechanical pair so related units appear in one card
    // (e.g. Lighter and Norma both synergize with Evelyn → one "Synergy with Evelyn" card)
    const groups = new Map();
    for (const entry of scoredCandidates) {
        const key = entry.bestPairId;
        if (!groups.has(key)) {
            groups.set(key, { bestPairName: entry.bestPairName, entries: [], maxScore: 0 });
        }
        const g = groups.get(key);
        g.entries.push(entry);
        g.maxScore = Math.max(g.maxScore, entry.score);
    }

    for (const [key, group] of groups.entries()) {
        // Sort units within group by tier, then alphabetically for stability
        group.entries.sort((a, b) => {
            if (a.candidate.tier !== b.candidate.tier) return a.candidate.tier - b.candidate.tier;
            return a.candidate.id.localeCompare(b.candidate.id);
        });

        const units = group.entries.map(e => e.candidate);
        // Key on the OWNED pair, not the first candidate — prevents ID collision when the
        // same candidate (e.g. Dialyn) is the best-tiered unit in multiple pair groups.
        const groupId = `mech-synergy-${key}`;

        // Store individual contribution scores so the unit-centric phase can assign each
        // unit to whichever gap it fits best — not just the group max.
        if (scoreOverrides) {
            for (const entry of group.entries) {
                scoreOverrides.set(`${entry.candidate.id}:${groupId}`, entry.score);
            }
        }

        const title = units.length === 1
            ? `Synergy: ${units[0].name}`
            : `Synergy with ${group.bestPairName}`;
        const reason = buildMechSynergyReason(units, group.bestPairName);

        gaps.push({
            id: groupId,
            title,
            reason,
            score: group.maxScore,
            units,
            bestPairName: group.bestPairName
        });
    }
}

// At most this many entries keep each priority once every entry is ranked. [PULL-08]
const PRIORITY_BUDGET = { High: 2, Medium: 4 };

// The team a laddered codependent completes, so the unit has a card whether or not it is on a
// banner. Its rung sets the priority. [PULL-01]
const LADDER_GAP_SCORE = { High: 70, Medium: 50, Low: 30 };

function detectLadderTeam(gaps, candidate, ladder) {
    const { tag, minCount } = ladderCountTag(candidate);
    const size = { 2: 'double', 3: 'triple' }[minCount] ?? `${minCount}-unit`;
    gaps.push({
        id: `ladder-${candidate.id}`,
        title: `${candidate.name}: ${capitalize(size)}-${capitalize(tag)} Team`,
        reason: `${candidate.name} completes a ${size}-${tag} team with your ${ladder.partner.name} and ${ladder.second.name}`,
        score: LADDER_GAP_SCORE[ladder.rung],
        units: [candidate]
    });
}

// Unowned limited T0s on the current or upcoming banners. Their High floor is applied per unit
// at card time, before codependency penalties. [PULL-06]
const BANNER_T0_GAP_ID = 'banner-t0';

function isBannerT0(unit, opportunitySet) {
    return unit.tier === 0 && opportunitySet.has(unit.id);
}

function detectBannerT0s(gaps, unownedLimitedS, opportunitySet) {
    const candidates = unownedLimitedS.filter(u => isBannerT0(u, opportunitySet));
    if (candidates.length === 0) return;
    gaps.push({
        id: BANNER_T0_GAP_ID,
        title: 'Top-Tier Banner Agent',
        reason: 'A T0 agent on a current or upcoming banner — a strong pull for almost any roster that can field them',
        score: 70,
        units: candidates
    });
}

function detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortCandidatesFn) {
    for (const arch of DPS_ARCHETYPES) {
        const primaryOwned = ownedDPS[arch].filter(u => u.rank === 'S' && u.limited && !isSubdps(u));

        // Carries only — a titled sub-DPS (Remielle) does not add carry depth. [GAP-03]
        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => getPrimaryDPSArchetype(u) === arch && !isSubdps(u))
        );
        if (candidates.length === 0) continue;

        // Titled T0s bypass the quality/count gates — see coverage-and-gaps.md#gap-detectors.
        const hasTitledT0 = candidates.some(u => isTitled(u) && u.tier === 0);

        if (!hasTitledT0) {
            if (dpsQuality[arch] < 75) continue;
            if (primaryOwned.length !== 1) continue;
        }

        const score = hasTitledT0 ? 70 : 30;
        const reason = hasTitledT0
            ? `A titled ${arch} unit would unlock entirely new team compositions and fundamentally expand your ${arch} options`
            : `You only have one premium ${arch} DPS — a second option would give flexibility across different team compositions`;

        gaps.push({
            id: `depth-${arch}`,
            title: `${capitalize(arch)} Depth`,
            reason,
            score,
            units: candidates
        });
    }
}

// The one team type you play with premium stun and support, or null when there are none or
// several. [GAP-04]
function findNarrowArchetype(dpsQuality, teamCoverage) {
    const PLAYED_QUALITY = 40;
    const PREMIUM_QUALITY = 75;
    const premiumTeams = DPS_ARCHETYPES.filter(a => dpsQuality[a] >= PLAYED_QUALITY &&
        teamCoverage[a].stunnerQuality >= PREMIUM_QUALITY && teamCoverage[a].supportQuality >= PREMIUM_QUALITY);
    return premiumTeams.length === 1 ? premiumTeams[0] : null;
}

// Per team type: the carry, plus the best stunner and support that can legally join it. Tier
// lookups only — never a scored team. [GAP-04]
function buildTeamCoverage(dpsQuality, ownedStunners, ownedSupports, legality) {
    const bestOf = (units) => units.reduce((best, u) => (!best || u.tier < best.tier ? u : best), null);
    const quality = (u) => (u ? tierToQuality(u.tier) : 0);
    const teamCoverage = {};
    for (const arch of DPS_ARCHETYPES) {
        const carryQuality = dpsQuality[arch];
        const stunner = bestOf(ownedStunners.filter(s => legality.canFieldWith(s, arch)));
        const support = bestOf(ownedSupports.filter(s => legality.canFieldWith(s, arch)));
        teamCoverage[arch] = { carryQuality, stunner, stunnerQuality: quality(stunner), support, supportQuality: quality(support) };
    }
    return teamCoverage;
}

function buildAssessment(dpsQuality, supportQuality, stunnerQuality, elementQuality, compositeScore, limitedSCount, coverage, highPriorityGapCount = 0, gaps = [], teamCoverage = null) {
    const totalSCount = coverage.ownedDPS.attack.concat(
        coverage.ownedDPS.anomaly, coverage.ownedDPS.rupture, coverage.ownedDPS.armorer,
        coverage.ownedSupports, coverage.ownedStunners
    ).filter(u => u.rank === 'S').length;
    const investmentFactor = totalSCount === 0 ? 0.3
        : Math.min(1.0, 0.5 + limitedSCount * 0.05);
    // Support and stunner are averaged over the team types you have a carry for, counting only units that
    // can join each — an anomaly-only support doesn't staff an armorer team. [GAP-04]
    const PLAYED_QUALITY = 40;
    const PREMIUM_QUALITY = 75;
    const played = DPS_ARCHETYPES.filter(a => dpsQuality[a] >= PLAYED_QUALITY);
    const fielded = DPS_ARCHETYPES.filter(a => dpsQuality[a] > 0);
    const perTeam = (key, fallback) => teamCoverage && fielded.length > 0
        ? fielded.reduce((sum, a) => sum + teamCoverage[a][key], 0) / fielded.length
        : fallback;
    const ratingTerms = [
        ...DPS_ARCHETYPES.map(a => dpsQuality[a]),
        perTeam('supportQuality', supportQuality),
        perTeam('stunnerQuality', stunnerQuality)
    ];
    const ratingBase = ratingTerms.reduce((sum, q) => sum + q, 0) / ratingTerms.length;
    const ratingScore = ratingBase * investmentFactor;
    const narrowArch = teamCoverage ? findNarrowArchetype(dpsQuality, teamCoverage) : null;

    let ratingTier, ratingColor;
    if (ratingScore <= 20) {
        ratingTier = 'Significant Gaps';
        ratingColor = '#e74c3c';
    } else if (ratingScore <= 40) {
        ratingTier = 'Partial Coverage';
        ratingColor = '#e67e22';
    } else if (ratingScore <= 55) {
        ratingTier = 'Solid Foundation';
        ratingColor = '#f1c40f';
    } else if (ratingScore <= 68) {
        ratingTier = 'Well-Rounded';
        ratingColor = '#2ecc71';
    } else if (ratingScore <= 82) {
        ratingTier = 'Strong Coverage';
        ratingColor = '#27ae60';
    } else {
        ratingTier = 'Fully Loaded';
        ratingColor = '#3498db';
    }

    // Cap the tier downward when high-priority gaps exist — a roster with notable
    // remaining gaps cannot be "Fully Loaded" or even "Strong Coverage".
    if (highPriorityGapCount >= 2) {
        // 2+ High gaps → at most Well-Rounded
        if (ratingTier === 'Fully Loaded' || ratingTier === 'Strong Coverage') {
            ratingTier = 'Well-Rounded';
            ratingColor = '#2ecc71';
        }
    } else if (highPriorityGapCount === 1) {
        // 1 High gap → at most Strong Coverage
        if (ratingTier === 'Fully Loaded') {
            ratingTier = 'Strong Coverage';
            ratingColor = '#27ae60';
        }
    }

    // Only one team type with premium stun and support is a narrow roster, whatever its average. [GAP-04]
    const RATING_ORDER = ['Significant Gaps', 'Partial Coverage', 'Solid Foundation', 'Well-Rounded', 'Strong Coverage', 'Fully Loaded'];
    const RATING_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60', '#3498db'];
    const capRating = (ceiling) => {
        const idx = Math.min(RATING_ORDER.indexOf(ratingTier), RATING_ORDER.indexOf(ceiling));
        ratingTier = RATING_ORDER[idx];
        ratingColor = RATING_COLORS[idx];
    };
    if (highPriorityGapCount >= 3) capRating('Solid Foundation');
    if (narrowArch) capRating('Partial Coverage');

    const strengths = [];
    const weaknesses = [];

    for (const arch of DPS_ARCHETYPES) {
        const hasSRank = coverage.ownedDPS[arch].some(u => u.rank === 'S');
        if (dpsQuality[arch] >= 75 && hasSRank) strengths.push(`strong ${arch} DPS`);
        else if (dpsQuality[arch] <= 25) weaknesses.push(`${arch} DPS`);
    }
    const hasSRankSupport = coverage.ownedSupports.some(u => u.rank === 'S');
    const hasArchetypeSupportGap = gaps.some(g => g.id.startsWith('support-'));
    const staffed = (key) => teamCoverage && played.length > 0
        ? played.filter(a => teamCoverage[a][key] >= PREMIUM_QUALITY).length
        : null;
    const supportStaffed = staffed('supportQuality');
    const supportEverywhere = supportStaffed === null ? true : supportStaffed === played.length;
    if (supportQuality >= 75 && hasSRankSupport && !hasArchetypeSupportGap && supportEverywhere) {
        strengths.push('premium supports');
    } else if (supportQuality >= 75 && hasSRankSupport) {
        // A narrow roster says this once, in its own sentence below.
        if (!narrowArch) strengths.push('a premium support, though coverage is narrow');
    } else if (supportQuality <= 25) {
        weaknesses.push('support options');
    }
    const hasSRankStunner = coverage.ownedStunners.some(u => u.rank === 'S');
    const stunnerStaffed = staffed('stunnerQuality');
    const stunnerEverywhere = stunnerStaffed === null ? true : stunnerStaffed === played.length;
    if (stunnerQuality >= 75 && hasSRankStunner && stunnerEverywhere) strengths.push('solid stunners');
    else if (stunnerQuality >= 75 && hasSRankStunner) {
        if (!narrowArch) strengths.push('a premium stunner, though coverage is narrow');
    }
    else if (stunnerQuality <= 10) weaknesses.push('stunner coverage');

    const weakElements = ELEMENTS.filter(el => el !== 'lumen' && elementQuality[el] < 55);
    if (weakElements.length === 0) strengths.push('full element coverage');
    else if (weakElements.length >= 2) weaknesses.push(`${weakElements.map(capitalize).join('/')} element coverage`);

    let summary;
    const joinList = arr =>
        arr.length <= 1 ? arr[0] ?? '' :
        arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];

    if (strengths.length > 0 && weaknesses.length > 0) {
        summary = `Your roster has ${joinList(strengths)}, but lacks ${joinList(weaknesses)}.`;
    } else if (strengths.length > 0) {
        summary = `Your roster has ${joinList(strengths)}, with well-rounded coverage across the board.`;
    } else if (weaknesses.length > 0) {
        summary = `Your roster needs investment in ${joinList(weaknesses)}.`;
    } else {
        summary = 'Your roster has moderate coverage across most roles.';
    }

    let shapeLabel = null;
    if (narrowArch) {
        shapeLabel = `Narrow: ${capitalize(narrowArch)}`;
        const others = DPS_ARCHETYPES.filter(a => a !== narrowArch && teamCoverage[a].carryQuality > 0);
        const bestAcross = (key) => others.map(a => teamCoverage[a][key]).filter(Boolean)
            .reduce((best, u) => (!best || u.tier < best.tier ? u : best), null);
        const stun = bestAcross('stunner');
        const sup = bestAcross('support');
        const parts = [stun && `stunner is ${stun.name}`, sup && `support is ${sup.name}`].filter(Boolean);
        summary += ` Only your ${narrowArch} teams have premium stun and support` +
            (parts.length ? ` — elsewhere your best ${parts.join(' and best ')}.` : '.');
    }

    return { ratingTier, ratingColor, compositeScore, ratingScore, shapeLabel, summary };
}
