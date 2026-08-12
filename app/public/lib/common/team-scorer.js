/**
 * Shared team scoring logic for Zenless Zone Zero
 * Used by both matchups.js and deadly-assault.js
 * 
 * Mechanics-driven scoring engine (5-layer architecture)
 * Browser-compatible ES module version
 */

import { ELEMENTS, DPS_ROLES } from './constants.js';
import { isValidTeam } from './team-builder.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export { ELEMENTS, DPS_ROLES };
export const SUPPORT_ROLE = "support";
export const NON_DPS_ROLES = ["defense", "stun", "support"];

const MULT = {
    NEED_FULFILLMENT: 7,
    DAMAGE_NEED: 3,
    TOTALIZE_QTY: 5,
    STUN_EMERGENCE: 1.0,
    ELEMENT_BUFF: 2,
    ELEMENT_DEBUFF: 2,
    ANOMALY_BUFF: 1.6,
    SHEER_BUFF: 9,
    PEN_BUFF: 2,
    ATK_BUFF: 0.7,
    CR_BUFF: 0.7,
    CD_BUFF: 0.7,
    DEFENSE_DEBUFF: 1.5,
    RECOVERY_DEBUFF: 2,
    STUN_INFRA: 1,
    ULTIMATES_PROVISION: 1.5,
    STUN_MULT_BUFF: 2,
    TOTALIZE_PENALTY: 38,
    DISORDER_BONUS: 6,
    DIAMETRIC: 3,
    VORTEX_BUFF: 4,
    REPLACEMENT_COST: 0.5,
    // DEF buff → DEF-scaling consumers (armorer's primary stat, and generic
    // defense-DPS builds). Higher than ATK_BUFF because DEF is the defining stat
    // for these units, analogous to SHEER_BUFF for rupture. Tunable — this is the
    // key lever for making DEF-buffers (e.g. Rina) best-in-slot for armorers.
    DEF_BUFF: 2.5,
    // Generic damage buff/debuff (`dmg`): a universal multiplier on ALL damage — the
    // last term in the formula, so it lifts attack/anomaly/vortex/totalize/Sharp/etc.
    // Never misses (every DPS benefits). A debuff is worth slightly less than a buff:
    // a buff helps the team against every enemy/wave, a debuff only marks one enemy —
    // irrelevant on single-target Deadly Assault, but real on multi-enemy Shiyu Defense.
    // Both are primary calibration dials (bounded by the Caesar diametric guard test).
    DMG_BUFF: 1.5,
    DMG_DEBUFF: 1.2,
};

const RUPTURE_ATK_EFFICIENCY = 0.33;
// Armorers do NOT scale off ATK at all (0%) — ATK buffs are worthless to them. Their only
// stat levers are crit rate and defense.
const ARMORER_ATK_EFFICIENCY = 0;

// Maim: only armorers open Gash meters; all meters share one pool of marks (max 3). Only
// stun/armorer agents build that pool (+ units Claret grants gash-build to via
// utility["gash-build"]), and only stun/armorer agents detonate it into a Maim burst
// (parallel to a disorder). More gash builders → the shared pool fills faster → more/bigger
// maims — which is why armorers favour dual-DPS (Stun/Armorer/Armorer, Armorer/Armorer/Support).
const MAIM_BASE = 8;
const MAIM_ENABLER_BONUS = 6;
// Element-scoped anomaly scaling (e.g. Roxy/Pyrois `scaling["anomaly:wind"]`): bonus per
// same-element anomaly source on the team. Linear — oversupply always helps. A wind
// pseudo-anomaly (Roxy) counts herself; a non-anomaly consumer (Pyrois) needs teammates.
const ANOMALY_ELEMENT_MULT = 4;

const BOSS_WEAK = {
    DISORDER_PER_UNIT: 4,
    VEIL_PER_UNIT: 8,
    STUN_BONUS: 15,
    ABLOOM_PER_UNIT: 5,
    FREEZE_BONUS: 15,
    CD_DEBUFF_PER_UNIT: 16,
    DAZE_DEBUFF_PER_UNIT: 10,
};

const BURST_DAMAGE_TYPES = ['enhanced', 'ultimate:strong', 'ultimate:double', 'chain', 'totalize', 'maim'];
const NEED_FULFILLMENT_KEYS = [
    'disorders', 'ablooms', 'chains', 'ultimates', 'veils',
    'quick-assists', 'interrupt-resistance', 'vortex'
];

const VORTEX_TIERS = { 
    //Base elements
    "ice": 4.5, "fire": 2, "physical": 2, "ether": 2, "electric": 1, "lumen": 0,
    //Variants
    "ice:frost" : 0.001, 
    "ether:auricInk" : 0.8, 
    "physical:honedEdge" : 0.8
};
const VORTEX_DEFAULT_TIER = 0.001;
const VORTEX_BASE = 15;
// Normalisation base for tier scaling in vortex buff affinity (ice=4).
const MAX_VORTEX_TIER = 4;
// Minimum primary DPS vortex tier for full team vortex bonuses. Below this threshold,
// vortex bonuses are proportionally discounted — the team lacks a vortex-focused carry.
const VORTEX_PRIMARY_MIN = 1.0;
// Refringe: bonus applied to each non-lumen anomaly teammate when a lumen agent is on
// the team with Lumiflux Buildup. Large by design — comparable to vortex/disorder bonuses.
// Deliberately tunable: allocation (to teammates, to lumen agent, or both) may shift after testing.
const REFRINGE_BONUS = 8;
// Refringe cascades: Attribute Mutation boosts anomaly proc damage, which in turn increases
// disorder/vortex damage derived from those procs. Partners generating reactions get extra credit.
const REFRINGE_DISORDER_CASCADE = 4;
const REFRINGE_VORTEX_CASCADE = 3;
// Conditional buff underutilization: squared-gap penalty per buff key.
// gap² × MULT punishes large missed buffs disproportionately (duo-anomaly Rem: 140, solo: 560).
const CONDITIONAL_BUFF_PENALTY_MULT = 35;
const L4_SOFT_CAP = 250;
const POLARITY_VORTEX_DISCOUNT = 0.35;
const NATURALLY_AVAILABLE_NEEDS = new Set(['ultimates', 'chains']);
const STAT_SCALING_KEYS = ['am', 'ap', 'cr', 'cd', 'hp', 'def', 'pen', 'sheer'];

// ============================================================================
// ROLE CLASSIFICATION HELPERS
// ============================================================================

export function isDPS(unit) {
    if (unit._activatedRoles) return DPS_ROLES.some(r => unit._activatedRoles.includes(r));
    return DPS_ROLES.some(role => unit.tags.includes(role));
}

export function isAttacker(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('attack');
    return unit.tags.includes("attack");
}

export function isAnomaly(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('anomaly');
    return unit.tags.includes("anomaly");
}

export function isRupture(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('rupture');
    return unit.tags.includes("rupture");
}

export function isArmorer(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('armorer');
    return unit.tags.includes("armorer");
}

export function isSupport(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('support');
    return unit.tags.includes(SUPPORT_ROLE);
}

export function isDefense(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('defense');
    return unit.tags.includes("defense");
}

export function isStun(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('stun');
    return unit.tags.includes("stun");
}

function isEffectiveSupport(unit) {
    if (unit._activatedRoles?.includes('dps')) return false;
    return isSupport(unit) || unit._activatedRoles?.includes('support');
}

function isEffectiveDefense(unit) {
    if (unit._activatedRoles?.includes('dps')) return false;
    return isDefense(unit) || unit._activatedRoles?.includes('defense');
}

export function isNonDPS(unit) {
    return NON_DPS_ROLES.some(role => unit.tags.includes(role));
}

export function isTitled(unit) {
    return unit.tags.includes("title");
}

export function isLimited(unit) {
    return unit.limited === true;
}

export function isSRank(unit) {
    return unit.rank === "S";
}

export function isARank(unit) {
    return unit.rank === "A";
}

export function getElement(unit) {
    // _morphedElement is set transiently during try-all morph scoring for lumen units
    return unit._morphedElement ?? unit.tags.find(tag => ELEMENTS.includes(tag));
}

export function hasDefensiveAssist(unit) {
    return unit.tags.includes("assist:defensive");
}

export function isOnField(unit) {
    const explicit = unit.mechanics?.onfield;
    if (explicit !== undefined) return explicit === true || explicit === 'shared';
    if (isDPS(unit) || isStun(unit)) return true;
    const activated = unit._activatedRoles || [];
    return activated.some(r => DPS_ROLES.includes(r) || r === 'stun');
}

function isSharedField(unit) {
    return unit.mechanics?.onfield === 'shared';
}

function hasLimitedRotations(unit) {
    return unit.mechanics?.utility?.rotations === 'limited';
}

function getEffectiveAssists(boss, team) {
    const bossAssists = getBossAssists(boss);
    if (bossAssists === 0) return 0;
    if (getBossChainParry(boss)) return bossAssists;
    const limitedCount = team.filter(hasLimitedRotations).length;
    return Math.max(0, bossAssists - limitedCount);
}

function isLumenUnit(unit) {
    return getElement(unit) === 'lumen';
}

// Returns the list of teammate elements that a lumen unit could morph to via Attribute Mutation.
// Lumen agents deal damage as the next agent's element in team order — effectively any teammate
// element. The caller should score with each option and take the best result.
function getPossibleMorphElements(unit, team) {
    if (!isLumenUnit(unit)) return null;
    return [...new Set(
        team
            .filter(u => u.id !== unit.id)
            .map(u => getElement(u))
            .filter(e => e !== 'lumen')
    )];
}

// ============================================================================
// BOSS VARIATION RESOLUTION
// ============================================================================

/**
 * Resolve a boss variation by merging the override object onto the base boss.
 * Merge semantics:
 *   - Omitted keys in the variation inherit the base value.
 *   - Explicit `null` in the variation erases the corresponding base key.
 *   - The `mechanics` sub-object is merged key-by-key with the same semantics.
 *   - All other properties (name, shortName, favored, …) are merged at the
 *     top level.  Arrays are treated atomically (replaced, not concatenated).
 *
 * @param {object} boss - The base boss object from bosses.json.
 * @param {string|null} variationId - The variation key to resolve (e.g. "raging").
 *   Pass null/undefined to get the base (default) boss back unchanged.
 * @returns {object} A new boss object with the variation merged in.
 */
export function resolveBossVariation(boss, variationId) {
    if (!variationId || !boss.variations?.[variationId]) {
        return boss;
    }
    const override = boss.variations[variationId];
    const resolved = { ...boss };

    for (const [key, value] of Object.entries(override)) {
        if (key === 'mechanics') continue;
        if (value === null) {
            delete resolved[key];
        } else {
            resolved[key] = value;
        }
    }

    if (override.mechanics) {
        resolved.mechanics = { ...boss.mechanics };
        for (const [key, value] of Object.entries(override.mechanics)) {
            if (value === null) {
                delete resolved.mechanics[key];
            } else {
                resolved.mechanics[key] = value;
            }
        }
    }

    resolved._variationId = variationId;
    return resolved;
}

// ============================================================================
// BOSS ACCESSORS
// These functions centralize access to boss properties that were moved into
// the mechanics block. Using accessors here allows variation resolution to be
// applied transparently without touching call sites.
// ============================================================================

export function getBossWeaknesses(boss) { return boss.mechanics?.weaknesses ?? []; }
export function getBossResistances(boss) { return boss.mechanics?.resistances ?? []; }
export function getBossShill(boss) { return boss.mechanics?.shill ?? null; }
export function getBossAnti(boss) { return boss.mechanics?.anti ?? []; }
export function getBossAssists(boss) { return boss.mechanics?.assists ?? 0; }
export function getBossChainParry(boss) { return boss.mechanics?.chainParry === true; }
export function getBossShillIntensity(boss) { return boss.mechanics?.shillIntensity ?? 1; }

// ============================================================================
// MECHANICS HELPERS
// ============================================================================

function w(value) {
    if (value === true) return 1;
    if (typeof value === 'number') return value;
    return 0;
}

// ============================================================================
// UNIFIED CONDITIONAL FRAMEWORK
// A single predicate vocabulary and value form shared by pseudoRole activation
// and by conditional-valued buffs/debuffs/damage/scaling/utility.
//
// Predicate (`when`) primitives:
//   { countTag, minCount }  team (incl. self) has >= minCount units with the tag
//   { hasUnit }             a unit is on the team — a plain id ("velina"), OR a colon-qualified
//                           "<role>:<element>" type ("anomaly:wind" = any effective wind-anomaly unit)
//   { notPresent }          same identifier forms, negated
//   { role }                the RECIPIENT's (consumer's) effective roles include role
//
// A mechanic value is either a scalar (number/true) or { cases: [{ when?, value }, …] };
// the first case whose predicate passes wins (a case with no `when` always passes).
// ============================================================================

// Match a unit against a `hasUnit`/`notPresent` identifier: a colon-qualified "role:element"
// (e.g. "anomaly:wind") matches by effective role + element; a plain string matches by id.
function unitMatchesIdentifier(u, ident) {
    if (typeof ident === 'string' && ident.includes(':')) {
        const [role, element] = ident.split(':');
        return getEffectiveRoles(u).includes(role) && getElement(u) === element;
    }
    return u.id === ident;
}

function evaluatePredicate(when, ctx) {
    if (!when) return true;
    if (when.hasUnit !== undefined) return (ctx.team || []).some(u => unitMatchesIdentifier(u, when.hasUnit));
    if (when.notPresent !== undefined) return !(ctx.team || []).some(u => unitMatchesIdentifier(u, when.notPresent));
    if (when.role !== undefined) {
        // Recipient-scoped: needs a consumer. Team-global reads (no consumer) fall through
        // to the default case by treating role predicates as unmet.
        return ctx.consumer ? getEffectiveRoles(ctx.consumer).includes(when.role) : false;
    }
    if (when.countTag !== undefined) {
        const count = (ctx.team || []).filter(u => u.tags.includes(when.countTag)).length;
        return count >= (when.minCount ?? 1);
    }
    return true;
}

export function isConditionalSpec(spec) {
    return spec !== null && typeof spec === 'object' && Array.isArray(spec.cases);
}

// True when a conditional's cases depend on team composition (not purely recipient role).
// Team-scoped conditionals are subject to the under-activation penalty; recipient-scoped
// ones (role-only) are not — a per-recipient buff is never "under-activated".
export function isTeamScopedConditional(spec) {
    if (!isConditionalSpec(spec)) return false;
    return spec.cases.some(c => c.when && (
        c.when.countTag !== undefined || c.when.hasUnit !== undefined || c.when.notPresent !== undefined
    ));
}

export function maxConditionalValue(spec) {
    if (!isConditionalSpec(spec)) return w(spec);
    return Math.max(0, ...spec.cases.map(c => w(c.value)));
}

// Resolve a mechanic value spec (scalar or { cases }) to a numeric weight given a context.
export function resolveConditionalValue(spec, ctx) {
    if (isConditionalSpec(spec)) {
        for (const c of spec.cases) {
            if (evaluatePredicate(c.when, ctx)) return w(c.value);
        }
        return 0;
    }
    return w(spec);
}

// Back-compat helper: resolve a supplier's buff key against a team (+ optional consumer).
function getEffectiveBuffValue(supplier, team, buffKey, consumer = null) {
    return resolveConditionalValue(supplier.mechanics?.buffs?.[buffKey], { team, self: supplier, consumer });
}

// Resolve every value in a mechanics sub-map (buffs/debuffs/…) to numbers for a context.
function resolveValueMap(map, ctx) {
    if (!map) return {};
    const out = {};
    for (const [k, spec] of Object.entries(map)) out[k] = resolveConditionalValue(spec, ctx);
    return out;
}

// Resolve a supplier's buff/debuff map for utilization/cohesion. Recipient-scoped
// conditionals (role predicates) resolve to the best value that actually reaches a DPS
// consumer — so a narrow buff correctly routed to a different key (e.g. Koleda giving an
// armorer CR instead of CD) is not charged as an unlanded CD. Team-scoped/scalar values
// resolve once (consumer-independent), preserving existing behaviour (e.g. Remielle).
function resolveMapForUtil(map, supplier, team) {
    if (!map) return {};
    const dpsConsumers = team.filter(t => t !== supplier && (isDPS(t) || hasSubDPSRole(t)));
    const out = {};
    for (const [key, spec] of Object.entries(map)) {
        if (isConditionalSpec(spec) && !isTeamScopedConditional(spec)) {
            let best = 0;
            for (const c of dpsConsumers) {
                best = Math.max(best, resolveConditionalValue(spec, { team, self: supplier, consumer: c }));
            }
            if (dpsConsumers.length === 0) best = resolveConditionalValue(spec, { team, self: supplier, consumer: null });
            out[key] = best;
        } else {
            out[key] = resolveConditionalValue(spec, { team, self: supplier, consumer: null });
        }
    }
    return out;
}

// Under-activation penalty for team-scoped conditional buffs (e.g. Remielle's ATK curve).
// Recipient-scoped conditionals are exempt.
function computeConditionalBuffPenalty(supplier, team) {
    const buffs = supplier.mechanics?.buffs;
    if (!buffs) return 0;
    let totalPenalty = 0;
    for (const [buffKey, spec] of Object.entries(buffs)) {
        if (!isTeamScopedConditional(spec)) continue;
        const maxLevel = maxConditionalValue(spec);
        if (maxLevel <= 0) continue;
        const resolved = resolveConditionalValue(spec, { team, self: supplier, consumer: null });
        if (resolved >= maxLevel) continue;
        // Squared-gap: large drops are disproportionately punished.
        const gap = maxLevel - resolved;
        totalPenalty += gap * gap * CONDITIONAL_BUFF_PENALTY_MULT;
    }
    return totalPenalty;
}

function pseudoRoleName(entry) {
    return typeof entry === 'string' ? entry : entry?.role;
}

function isPseudoRoleActive(entry, team) {
    if (typeof entry === 'string') return true;
    return evaluatePredicate(entry.when, { team, self: null, consumer: null });
}

export function getEffectiveRoles(unit) {
    if (unit._activatedRoles) return unit._activatedRoles;
    const roles = [];
    for (const role of ['attack', 'anomaly', 'rupture', 'armorer', 'stun', 'support', 'defense']) {
        if (unit.tags.includes(role)) roles.push(role);
    }
    const pseudoRole = unit.mechanics?.pseudoRole;
    if (Array.isArray(pseudoRole)) {
        for (const entry of pseudoRole) {
            const name = pseudoRoleName(entry);
            if (name && !roles.includes(name)) roles.push(name);
        }
    }
    return roles;
}

function computeActivatedRoles(unit, team) {
    const roles = [];
    for (const role of ['attack', 'anomaly', 'rupture', 'armorer', 'stun', 'support', 'defense']) {
        if (unit.tags.includes(role)) roles.push(role);
    }
    const pseudoRole = unit.mechanics?.pseudoRole;
    if (Array.isArray(pseudoRole)) {
        for (const entry of pseudoRole) {
            const name = pseudoRoleName(entry);
            if (!name || roles.includes(name)) continue;
            if (!isPseudoRoleActive(entry, team)) continue;
            roles.push(name);
        }
    }
    return roles;
}

function isDPSByRoles(roles) {
    return roles.some(r => DPS_ROLES.includes(r));
}

function isStunnerByRoles(roles) {
    return roles.includes('stun');
}

function isStunlessUnit(unit) {
    return unit.mechanics?.utility?.stunless === true;
}

function getElementVariant(unit) {
    const base = getElement(unit);
    return unit.mechanics?.elementalVariant 
        ? base + ':' + unit.mechanics?.elementalVariant 
        : base;
}

function teamHasImplicitDisorders(team) {
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    if (anomalyAgents.length < 2) return false;
    // Lumen doesn't open its own anomaly gauge, so it doesn't contribute to elemental
    // diversity for disorder purposes. Only count non-lumen anomaly elements.
    const elements = anomalyAgents.map(u => getElementVariant(u)).filter(e => e !== 'lumen');
    return new Set(elements).size >= 2;
}

function teamHasDisorderGeneration(team) {
    if (teamHasImplicitDisorders(team)) return true;
    return team.some(u => w(u.mechanics?.utility?.disorders) > 0);
}

// --- Boss Anomaly State helpers ---

function getBossAnomalyState(boss) {
    return boss?.mechanics?.['anomaly:state'] || null;
}

function isVortexBoss(boss) {
    const state = getBossAnomalyState(boss);
    return state === 'wind';
}

function getVortexTierForElement(unit, bossAnomaly) {
    const base = getElement(unit);
    if (base === 'wind' && bossAnomaly && bossAnomaly !== 'wind') {
        return VORTEX_TIERS[bossAnomaly] ?? VORTEX_DEFAULT_TIER;
    }
    //otherwise:
    const element = getElementVariant(unit)
    return VORTEX_TIERS[element] ?? VORTEX_DEFAULT_TIER;
}

function computeAnomalyReactions(team, boss) {
    const bossAnomaly = getBossAnomalyState(boss);
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    const reactions = new Map();

    for (const unit of anomalyAgents) {
        const element = getElement(unit);
        let bestVortexTier = 0;
        let hasDisorder = false;

        // Lumen agents don't build anomaly gauges via Attribute Mutation — their damage
        // morphs to a teammate's element but does not fill the corresponding anomaly gauge.
        // Therefore lumen units produce no anomaly reactions (no disorder, no vortex).
        if (element === 'lumen') {
            reactions.set(unit, { bestVortexTier: 0, hasDisorder: false });
            continue;
        }

        if (bossAnomaly) {
            if (element !== bossAnomaly && bossAnomaly !== 'lumen') {
                if (bossAnomaly === 'wind' || element === 'wind') {
                    bestVortexTier = getVortexTierForElement(unit, bossAnomaly);
                } else {
                    hasDisorder = true;
                }
            }
        } else {
            for (const partner of anomalyAgents) {
                if (partner === unit) continue;
                const partnerEl = getElement(partner);
                if (element === partnerEl) continue;
                // Skip lumen pairings — lumen doesn't open its own gauge
                if (partnerEl === 'lumen') continue;

                if (element === 'wind' || partnerEl === 'wind') {
                    const nonWindUnit = (element === 'wind') ? partner : unit;
                    bestVortexTier = Math.max(bestVortexTier,
                        getVortexTierForElement(nonWindUnit, null));
                } else {
                    hasDisorder = true;
                }
            }
        }

        reactions.set(unit, { bestVortexTier, hasDisorder });
    }

    return reactions;
}

function teamHasAnyDisorder(reactions) {
    for (const [, r] of reactions) { if (r.hasDisorder) return true; }
    return false;
}

function teamHasAnyVortex(reactions) {
    for (const [, r] of reactions) { if (r.bestVortexTier > 0) return true; }
    return false;
}

function teamHasAnyReaction(reactions) {
    return teamHasAnyDisorder(reactions) || teamHasAnyVortex(reactions);
}

function teamHasPolarity(team) {
    return team.some(u => w(u.mechanics?.utility?.disorders) > 0);
}

function teamHasDisorderGenerationFromReactions(team, reactions) {
    return teamHasAnyDisorder(reactions) || teamHasPolarity(team);
}

export function hasSubDPSRole(unit) {
    if (unit._activatedRoles) return unit._activatedRoles.includes('subdps');
    const pr = unit.mechanics?.pseudoRole;
    if (!Array.isArray(pr)) return false;
    return pr.some(entry => pseudoRoleName(entry) === 'subdps');
}

function isForcedSecondaryDPS(unit, sameTypeUnits) {
    if (sameTypeUnits.length <= 1) return false;
    if (sameTypeUnits.some(hasSubDPSRole)) return false;
    const sorted = [...sameTypeUnits].sort((a, b) => {
        const ta = a.tier ?? 2.5, tb = b.tier ?? 2.5;
        if (ta !== tb) return ta - tb;
        if (isTitled(a) !== isTitled(b)) return isTitled(a) ? -1 : 1;
        if (isSRank(a) !== isSRank(b)) return isSRank(a) ? -1 : 1;
        return 0;
    });
    return unit !== sorted[0];
}

export function getEffectiveScaling(unit) {
    const roles = getEffectiveRoles(unit);
    const baseline = {};
    if (roles.includes('attack'))  Object.assign(baseline, { cr: 2, cd: 2 });
    if (roles.includes('anomaly')) Object.assign(baseline, { am: 2, ap: 1 });
    if (roles.includes('rupture')) Object.assign(baseline, { sheer: 3, hp: 2, cr: 2, cd: 2 });
    // Armorer: DEF primary, elevated CR (overcritical, useful to 200%), NO cd (fixed crit damage).
    if (roles.includes('armorer')) Object.assign(baseline, { def: 3, cr: 2 });
    if (roles.includes('stun'))    Object.assign(baseline, { daze: 1 });
    if (isDPSByRoles(roles)) {
        const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
        if (!hasSubDPSRole(unit)) {
            let implicitUlt = 1;
            if (w(damage['ultimate:strong']) >= 2) implicitUlt = Math.max(implicitUlt, 2);
            if (w(damage['ultimate:double']) >= 2) implicitUlt = Math.max(implicitUlt, 3);
            // A (possibly conditional) ultimate:strong OVERRIDES ultimate:weak — e.g. Pyrois's
            // ultimate becomes a real burst under wind anomaly, lifting the weak-ultimate penalty.
            if (w(damage['ultimate:weak']) > 0 && w(damage['ultimate:strong']) === 0) implicitUlt = 0;
            baseline.ultimates = implicitUlt;
        }
        baseline['quick-assists'] = 0.25;
        const totalizeWeight = w(damage.totalize);
        if (totalizeWeight > 0) {
            baseline.recovery = totalizeWeight * 2;
        }
    }
    const explicit = unit.mechanics?.scaling || {};
    return { ...baseline, ...explicit };
}

function resolveBaselineWeight(consumer, category) {
    const scaling = consumer.mechanics?.scaling;
    const roles = getEffectiveRoles(consumer);

    switch (category) {
        case 'atk':
            if (scaling?.atk) return w(scaling.atk);
            return isDPSByRoles(roles) ? 1 : 0;
        case 'anomaly-affinity': {
            const am = scaling?.am;
            const ap = scaling?.ap;
            if (am || ap) return Math.max(w(am || 0), w(ap || 0));
            return roles.includes('anomaly') ? 2 : 0;
        }
        case 'sheer':
            if (scaling?.sheer) return w(scaling.sheer);
            return roles.includes('rupture') ? 3 : 0;
        case 'pen':
            if (scaling?.pen) return w(scaling.pen);
            return (isDPSByRoles(roles) && !roles.includes('rupture')) ? 1 : 0;
        case 'cr':
            if (scaling?.cr) return w(scaling.cr);
            // Armorer values CR above attackers: the overcritical second check keeps CR
            // useful all the way to 200% (beyond that it's dead, like 100%+ for everyone else).
            if (roles.includes('armorer')) return 3;
            if (roles.includes('attack') || roles.includes('rupture')) return 2;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'cd':
            if (scaling?.cd) return w(scaling.cd);
            // Armorer crit damage is FIXED — CD is worthless to them (no armorer branch).
            if (roles.includes('attack') || roles.includes('rupture')) return 2;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'def':
            if (scaling?.def) return w(scaling.def);
            return roles.includes('armorer') ? 3 : 0;
        case 'stun-infra':
            if (isStunlessUnit(consumer)) return 0;
            if (roles.includes('attack') || roles.includes('rupture') || roles.includes('armorer')) return 1;
            if (roles.includes('anomaly')) return 0.5;
            if (roles.includes('stun')) {
                const pseudo = consumer.mechanics?.pseudoRole;
                if (Array.isArray(pseudo) && pseudo.some(entry => DPS_ROLES.includes(pseudoRoleName(entry)))) return 0.5;
            }
            return 0;
        case 'defense':
            return ((isDPSByRoles(roles) || isStunnerByRoles(roles)) && !roles.includes('rupture')) ? 1 : 0;
        case 'element':
            return (isDPSByRoles(roles) || isStunnerByRoles(roles)) ? 1 : 0;
        default:
            return 0;
    }
}

function getSupplierDaze(supplier) {
    const daze = supplier.mechanics?.utility?.daze;
    if (daze) return w(daze);
    return getEffectiveRoles(supplier).includes('stun') ? 1 : 0;
}

function getStunInfraWeight(supplier) {
    const buffs = supplier.mechanics?.buffs || {};
    const raw = w(buffs['stun-multiplier']) + getSupplierDaze(supplier);
    if (raw === 0) return 0;
    const isStunRole = getEffectiveRoles(supplier).includes('stun');
    return isStunRole ? raw : raw * 0.5;
}

function getMaxBurstWeight(unit) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    const explicit = Math.max(0, ...BURST_DAMAGE_TYPES.map(type => w(damage[type])));
    if (explicit > 0) return explicit;
    const roles = getEffectiveRoles(unit);
    // Maim is the armorer's inherent burst (parallel to a disorder), so armorers carry a
    // role-default burst weight without needing an explicit damage.maim in their kit.
    if (roles.includes('armorer')) return 2;
    return isDPSByRoles(roles) ? 1 : 0;
}

const BUFF_UTIL_FLOOR = 0;
// Cohesion multiplier applied (per key) when a support's directional stat buff whiffs —
// i.e. NO consumer can use it. `sheer` whiffs with no rupture consumer; `cd` whiffs when
// every DPS is an armorer (fixed crit damage) or otherwise crit-damage-agnostic. Until the
// armorer class, CD always landed, so the engine never treated it as missable.
const WHIFF_COHESION_PENALTY = 0.8;
const WHIFF_PENALTY_BUFFS = ['sheer', 'cd'];
// Armorer crit-rate dependency: an armorer with no CR-supplying teammate takes this cohesion
// hit (weighted like a hard need). Strong, because CR is an armorer's defining stat.
const ARMORER_CR_MISS_UTIL = 0.55;
const ARMORER_CR_WEIGHT = 0.6;
// Undersupply is worse than linear: when a provider supplies less of a need than the
// consumer scales for, the partial credit is further discounted (0.6 → ~30% at half).
const UNDERSUPPLY_FACTOR = 0.6;

function getBuffRelevance(key, consumer) {
    const roles = getEffectiveRoles(consumer);
    const element = getElement(consumer);
    const dps = isDPSByRoles(roles);

    switch (key) {
        case 'atk':
            if (!dps) return 0;
            if (roles.includes('rupture')) return RUPTURE_ATK_EFFICIENCY;
            if (roles.includes('armorer')) return ARMORER_ATK_EFFICIENCY;
            return 1;
        case 'anomaly':
            return roles.includes('anomaly') ? 1 : 0;
        case 'sheer':
            if (consumer.mechanics?.scaling?.sheer) return 1;
            return roles.includes('rupture') ? 1 : 0;
        case 'pen':
            return (dps && !roles.includes('rupture')) ? 1 : 0;
        case 'cr':
            if (consumer.mechanics?.scaling?.cr) return 1;
            if (roles.includes('armorer')) return 1;
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'cd':
            if (consumer.mechanics?.scaling?.cd) return 1;
            // Armorer: no cd relevance (fixed crit damage) — CD-buffing supports earn no credit.
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'def':
            return (consumer.mechanics?.scaling?.def || roles.includes('armorer')) ? 1 : 0;
        case 'stun-multiplier':
            return dps ? 1 : 0;
        case 'dmg':
            return dps ? 1 : 0; // generic damage: never misses on any DPS
        case 'chains':
            return 1;
        case 'abloom':
            if (roles.includes('anomaly')) return 1;
            if (consumer.mechanics?.damage?.abloom) return 1;
            return 0;
        case 'disorders':
            if (roles.includes('anomaly')) return 1;
            if (consumer.mechanics?.damage?.polarity || consumer.mechanics?.damage?.disorders) return 1;
            return 0;
        default:
            const dmgVal = consumer.mechanics?.damage?.[key];
            if (dmgVal) return w(dmgVal) >= 2 ? 1 : 0.5;
            if (ELEMENTS.includes(key) && element === key && (dps || roles.includes('stun'))) return 1;
            return 0;
    }
}

function getDebuffRelevance(key, consumer) {
    const roles = getEffectiveRoles(consumer);
    const element = getElement(consumer);
    const dps = isDPSByRoles(roles);

    switch (key) {
        case 'defense':
            return ((dps || roles.includes('stun')) && !roles.includes('rupture')) ? 1 : 0;
        case 'recovery':
            return (dps && !isStunlessUnit(consumer)) ? 1 : 0;
        case 'dmg':
            return dps ? 1 : 0; // generic damage debuff: never misses on any DPS
        default:
            if (ELEMENTS.includes(key) && element === key && (dps || roles.includes('stun'))) return 1;
            return 0;
    }
}

const STAT_BUFF_KEYS = new Set(['atk', 'anomaly', 'sheer', 'pen', 'cr', 'cd', 'stun-multiplier', ...ELEMENTS]);

const BUFF_IMPACT = {
    atk: MULT.ATK_BUFF, cr: MULT.CR_BUFF, cd: MULT.CD_BUFF,
    sheer: MULT.SHEER_BUFF, anomaly: MULT.ANOMALY_BUFF, pen: MULT.PEN_BUFF,
    'stun-multiplier': MULT.STUN_MULT_BUFF,
};

// Generic damage is a flat, always-on damage term scored in baseline affinity. It is
// EXCLUDED from cohesion/utilization: it must not rescue a support whose designed buffs
// are mismatched (e.g. Pan's sheer on an attack team), nor inflate diametric/core stacking.
const COHESION_EXCLUDED_BUFFS = new Set(['dmg', 'vortex']);

function getScalingBuffs(unit) {
    const explicit = unit.mechanics?.scaling?.buffs;
    if (explicit !== undefined) return w(explicit);
    if (unit.tags.includes('support') || unit.tags.includes('defense')) return 3;
    if (unit.tags.includes('stun')) return 2;
    return 0;
}

function computeBuffUtilization(supplier, team) {
    const scalingBuffs = getScalingBuffs(supplier);
    if (scalingBuffs === 0) return 1.0;

    const consumers = team.filter(t => t !== supplier);
    const nConsumers = consumers.length;

    if (isDPS(supplier)) {
        const buffs = resolveMapForUtil(supplier.mechanics?.buffs, supplier, team);
        const debuffs = resolveMapForUtil(supplier.mechanics?.debuffs, supplier, team);
        // vortex is a contextual situational bonus, not a must-use designed mechanic.
        // Exclude it from cohesion evaluation; the positive signal comes from L4 baseline affinity.
        const GENERIC_DPS_BUFFS = new Set(['atk', 'cr', 'cd', 'pen', 'stun-multiplier', 'vortex', 'dmg']);
        const evaluatableBuffs = Object.entries(buffs).filter(
            ([key, value]) => !GENERIC_DPS_BUFFS.has(key) && w(value) >= 2
        );
        const evaluatableDebuffs = Object.entries(debuffs).filter(
            ([key, value]) => !COHESION_EXCLUDED_BUFFS.has(key) && w(value) >= 2
        );
        if (evaluatableBuffs.length === 0 && evaluatableDebuffs.length === 0) return 1.0;
        let totalWeight = 0;
        let effectiveWeight = 0;
        for (const [key, value] of evaluatableBuffs) {
            const bw = w(value);
            totalWeight += bw;
            let totalRelevance = 0;
            for (const consumer of consumers) {
                totalRelevance += getBuffRelevance(key, consumer);
            }
            effectiveWeight += bw * (nConsumers > 0 ? totalRelevance / nConsumers : 0);
        }
        for (const [key, value] of evaluatableDebuffs) {
            const dw = w(value);
            totalWeight += dw;
            let maxRelevance = 0;
            for (const consumer of consumers) {
                if (isDPS(consumer) || hasSubDPSRole(consumer)) {
                    maxRelevance = Math.max(maxRelevance, getDebuffRelevance(key, consumer));
                }
            }
            effectiveWeight += dw * maxRelevance;
        }
        if (totalWeight === 0) return 1.0;
        const rawUtil = effectiveWeight / totalWeight;
        const baseUtil = 0.65 + 0.35 * rawUtil;
        return 1 - (1 - baseUtil) * (scalingBuffs / 3);
    }

    const buffs = resolveMapForUtil(supplier.mechanics?.buffs, supplier, team);
    const debuffs = resolveMapForUtil(supplier.mechanics?.debuffs, supplier, team);
    const utility = resolveMapForUtil(supplier.mechanics?.utility, supplier, team);
    let totalWeight = 0;
    let effectiveWeight = 0;
    let coreWeight = 0;
    let coreEffective = 0;
    let coreImpact = 0;

    for (const [key, value] of Object.entries(buffs)) {
        if (COHESION_EXCLUDED_BUFFS.has(key)) continue; // dmg/vortex: flat L4 only, not cohesion
        const bw = w(value);
        if (bw <= 0) continue;
        totalWeight += bw;
        if (bw < 2) {
            effectiveWeight += bw;
            continue;
        }

        if (STAT_BUFF_KEYS.has(key)) {
            let dpsRelevance = 0;
            let otherRelevance = 0;
            for (const consumer of consumers) {
                const rel = getBuffRelevance(key, consumer);
                if (isDPS(consumer)) dpsRelevance = Math.max(dpsRelevance, rel);
                else otherRelevance = Math.max(otherRelevance, rel);
            }
            const hasDPS = consumers.some(c => isDPS(c));
            const maxRelevance = Math.max(dpsRelevance, otherRelevance * (hasDPS ? 0.5 : 1.0));
            effectiveWeight += bw * maxRelevance;
            coreWeight += bw;
            coreEffective += bw * maxRelevance;
            coreImpact += bw * maxRelevance * (BUFF_IMPACT[key] || MULT.ELEMENT_BUFF);
        } else {
            let totalRelevance = 0;
            for (const consumer of consumers) {
                totalRelevance += getBuffRelevance(key, consumer);
            }
            effectiveWeight += bw * (nConsumers > 0 ? totalRelevance / nConsumers : 0);
        }
    }

    for (const [key, value] of Object.entries(debuffs)) {
        if (COHESION_EXCLUDED_BUFFS.has(key)) continue; // dmg: flat L4 only, not cohesion
        const dw = w(value);
        if (dw <= 0) continue;
        totalWeight += dw;
        if (dw < 2) {
            effectiveWeight += dw;
            continue;
        }
        let maxRelevance = 0;
        for (const consumer of consumers) {
            maxRelevance = Math.max(maxRelevance, getDebuffRelevance(key, consumer));
        }
        effectiveWeight += dw * maxRelevance;
    }

    if (!isDPS(supplier)) {
        for (const key of NEED_FULFILLMENT_KEYS) {
            const uv = w(utility[key]);
            if (uv <= 0) continue;
            totalWeight += uv;
            let maxRelevance = 0;
            for (const consumer of consumers) {
                const scaling = getEffectiveScaling(consumer);
                maxRelevance = Math.max(maxRelevance, Math.min(1, w(scaling[key])));
            }
            effectiveWeight += uv * maxRelevance;
        }
    }

    if (isStun(supplier) && !isDPS(supplier)) {
        const dazeContribution = 3 + w(utility.daze);
        totalWeight += dazeContribution;
        const hasBeneficiary = consumers.some(c => isDPS(c) && !isStunlessUnit(c));
        effectiveWeight += dazeContribution * (hasBeneficiary ? 1 : 0);
    }

    if (totalWeight === 0) return 0.0;
    const BUFF_UTIL_BASELINE = 4;
    const ratio = effectiveWeight / totalWeight;
    const threshold = effectiveWeight / BUFF_UTIL_BASELINE;
    const adjustedRatio = ratio * Math.min(1.0, totalWeight / BUFF_UTIL_BASELINE);
    const CORE_IMPACT_BASELINE = 4;
    const rawCoreRatio = coreWeight > 0 ? coreEffective / coreWeight : 0;
    const coreActivation = Math.min(1.0, coreImpact / CORE_IMPACT_BASELINE);
    const coreRatio = rawCoreRatio * coreActivation;
    let baseUtil = Math.min(1.0, Math.max(adjustedRatio, threshold, coreRatio));
    // A whiffed directional stat buff (no consumer can use it) is a strong signal the support
    // is on the wrong team — it wastes a defining buff. Apply a direct cohesion hit beyond the
    // ratio effect (which the absolute-supply threshold masks). Covers sheer (no rupture
    // consumer) and cd (all-armorer / crit-damage-agnostic teams).
    for (const wk of WHIFF_PENALTY_BUFFS) {
        if (w(buffs[wk]) >= 2 && !consumers.some(c => getBuffRelevance(wk, c) > 0)) {
            baseUtil *= WHIFF_COHESION_PENALTY;
        }
    }
    return 1 - (1 - baseUtil) * (scalingBuffs / 3);
}

// ============================================================================
// LAYER 1: DISQUALIFICATIONS
// ============================================================================

// Sanity check: teams fed to the scorer should normally already be legal
// (produced by getTeams or extendTeamsWithUniversalUnits), but command-line
// and test usage can pass arbitrary compositions. This guard prevents
// illegal teams from receiving a score.
function checkDisqualifications(team, boss, debug) {
    const [a, b, c] = team;
    // A trio is legal if all three joins are mutually satisfied, OR if any
    // pair forms a mutual join — the odd unit out is treated as a flex slot.
    const isLegal = c
        ? isValidTeam(a, b, c) || isValidTeam(a, b) || isValidTeam(a, c) || isValidTeam(b, c)
        : isValidTeam(a, b);
    if (!isLegal) {
        if (debug) console.log('  DISQUALIFIED: Illegal team — no valid join arrangement');
        return -1;
    }

    const dpsUnits = team.filter(isDPS);

    if (dpsUnits.length === 0) {
        if (debug) console.log('  DISQUALIFIED: No DPS unit');
        return -1;
    }

    const pureDpsCount = dpsUnits.filter(u => !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u)).length;
    if (pureDpsCount >= 3) {
        if (debug) console.log('  DISQUALIFIED: Triple DPS');
        return -1;
    }

    const bossAnti = getBossAnti(boss);
    if (bossAnti.length > 0) {
        for (const antiType of bossAnti) {
            if (dpsUnits.some(u => u.tags.includes(antiType))) {
                if (debug) console.log(`  DISQUALIFIED: DPS matches boss anti-type ${antiType}`);
                return -1;
            }
        }
    }

    const bossResistances = getBossResistances(boss);
    for (const unit of dpsUnits) {
        if (isEffectiveSupport(unit) || isEffectiveDefense(unit)) continue;
        const morphOptions = getPossibleMorphElements(unit, team);
        if (morphOptions !== null) {
            // Lumen unit: DQ only if ALL morph targets are resisted — if any target is
            // unresisted the player will morph to it instead.
            const hasValidMorph = morphOptions.length === 0 ||
                morphOptions.some(e => !bossResistances.includes(e));
            if (!hasValidMorph) {
                if (debug) console.log(`  DISQUALIFIED: ${unit.name} (lumen) — all morph targets resisted`);
                return -1;
            }
        } else {
            if (bossResistances.includes(getElement(unit))) {
                if (debug) console.log(`  DISQUALIFIED: ${unit.name} element resisted by boss`);
                return -1;
            }
        }
    }

    const bossAssists = getBossAssists(boss);
    const effectiveAssists = getEffectiveAssists(boss, team);
    const reliableDefAssists = team.filter(u => {
        if (!hasDefensiveAssist(u)) return false;
        if (isSharedField(u)) {
            return bossAssists >= team.length;
        }
        return true;
    }).length;
    if (reliableDefAssists < effectiveAssists) {
        if (debug) console.log(`  DISQUALIFIED: ${reliableDefAssists}/${effectiveAssists} reliable defensive assists`);
        return -1;
    }

    return 0;
}

// ============================================================================
// LAYER 1.5: TEAM STRUCTURE
// ============================================================================

const STRUCTURE = {
    CONVENTIONAL_BONUS: 35,
    UNCONVENTIONAL_VIABLE: 0,
    UNCONVENTIONAL_NO_INTERACTION: -50,
    WILDLY_UNCONVENTIONAL: -150,
};

const FIELD_TIME = {
    SOLO_CARRY_BONUS: 15,
    TRIPLE_ONFIELD_PENALTY: -25,
    ZERO_ONFIELD_PENALTY: -30,
};

function scoreTeamStructure(team, debug) {
    const attackers = team.filter(u => isAttacker(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const anomalyUnits = team.filter(u => isAnomaly(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const ruptureUnits = team.filter(u => isRupture(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const armorerUnits = team.filter(u => isArmorer(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const stunUnits = team.filter(isStun);
    const supportLike = team.filter(u => isEffectiveSupport(u) || isEffectiveDefense(u));
    const dpsUnits = team.filter(isDPS);

    const nAtk = attackers.length;
    const nAno = anomalyUnits.length;
    const nRup = ruptureUnits.length;
    const nArm = armorerUnits.length;
    const nStun = stunUnits.length;
    const nSup = supportLike.length;

    // --- CONVENTIONAL COMPOSITIONS ---

    // Attacker + Stunner + Support/Defense
    if (nAtk === 1 && nStun >= 1 && nSup >= 1 && nAno === 0 && nRup === 0 && nArm === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (attacker + stunner + support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // Armorer hypercarry: Armorer + Stunner + Support/Defense
    if (nArm === 1 && nStun >= 1 && nSup >= 1 && nAtk === 0 && nAno === 0 && nRup === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (armorer + stunner + support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // 2x Armorer + Support/Defense or 2x Armorer + Stunner (dual gash meters, Maim-driven).
    // Unlike double anomaly, no subdps is required — Maim is the shared-resource payoff.
    if (nArm >= 2 && (nSup >= 1 || nStun >= 1)) {
        if (debug) console.log('    Structure: CONVENTIONAL (double armorer + support/stunner)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // Lone armorer + 2x Support/Defense (wheelchair — no strong Maim enabler beyond self)
    if (nArm === 1 && nSup >= 2 && nAtk === 0 && nAno === 0 && nRup === 0) {
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (armorer wheelchair)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // 2x Anomaly + Support/Defense
    if (nAno >= 2 && nSup >= 1) {
        const hasAnoSubDPS = anomalyUnits.some(hasSubDPSRole);
        if (hasAnoSubDPS) {
            if (debug) console.log('    Structure: CONVENTIONAL (double anomaly + support, has subdps)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (double anomaly + support, no subdps)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // 2x Anomaly + Stunner
    if (nAno >= 2 && nStun >= 1) {
        const hasAnoSubDPS = anomalyUnits.some(hasSubDPSRole);
        if (hasAnoSubDPS) {
            if (debug) console.log('    Structure: CONVENTIONAL (double anomaly + stunner, has subdps)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (double anomaly + stunner, no subdps)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // Anomaly hypercarry: Anomaly + Stunner + Support/Defense
    if (nAno === 1 && nStun >= 1 && nSup >= 1 && nAtk === 0 && nRup === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (anomaly hypercarry)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // Rupture + Stunner + Support/Defense
    if (nRup >= 1 && nStun >= 1 && nSup >= 1 && nAtk === 0 && nAno === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (rupture + stunner + support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // Rupture + 2x Support/Defense
    if (nRup >= 1 && nSup >= 2 && nAtk === 0 && nAno === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (rupture + double support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // --- UNCONVENTIONAL BUT VIABLE ---

    // DPS + 2x Stunner: conventional for totalize units (stun uptime IS their damage),
    // unconventional-viable for others
    if (dpsUnits.length >= 1 && nStun >= 2) {
        const hasTotalize = dpsUnits.some(u => w(u.mechanics?.damage?.totalize) > 0);
        if (hasTotalize) {
            if (debug) console.log('    Structure: CONVENTIONAL (totalize + double stun)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (DPS + double stun)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // Solo Anomaly + 2x Support/Defense (wheelchair)
    if (nAno === 1 && nSup >= 2 && nAtk === 0 && nRup === 0) {
        if (anomalyUnits.some(u => isTitled(u))) {
            if (debug) console.log('    Structure: CONVENTIONAL (titled anomaly wheelchair)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (anomaly wheelchair)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // Stunless attacker + 2x Support/Defense (YSG-type compositions)
    if (nAtk === 1 && nSup >= 2) {
        const stunlessAttacker = attackers.some(u => u.mechanics?.utility?.stunless);
        if (stunlessAttacker) {
            if (debug) console.log('    Structure: CONVENTIONAL (stunless attacker + double support)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL viable (attacker + double support)');
        return STRUCTURE.UNCONVENTIONAL_VIABLE;
    }

    // Anomaly + Attacker + (Stun|Support) — Monoshock variant
    // Valid if the attacker has anomaly scaling; boss matchup (Layer 3) handles
    // whether both DPS agents align with weaknesses
    if (nAno >= 1 && nAtk >= 1 && (nStun >= 1 || nSup >= 1) && nRup === 0) {
        const attackerHasAnomalyScaling = attackers.some(u => {
            const scaling = u.mechanics?.scaling || {};
            return scaling.anomaly || scaling.am || scaling.ap;
        });
        if (attackerHasAnomalyScaling) {
            if (debug) console.log('    Structure: UNCONVENTIONAL viable (monoshock)');
            return STRUCTURE.UNCONVENTIONAL_VIABLE;
        }
        if (debug) console.log('    Structure: WILDLY UNCONVENTIONAL (anomaly+attacker, no anomaly scaling)');
        return STRUCTURE.WILDLY_UNCONVENTIONAL;
    }

    // 2x Attacker + (Stun|Support) — Seed-like variant
    if (nAtk >= 2 && (nStun >= 1 || nSup >= 1) && nAno === 0 && nRup === 0) {
        const hasSubDPS = attackers.some(hasSubDPSRole);
        if (hasSubDPS && nStun >= 1) {
            if (debug) console.log('    Structure: CONVENTIONAL (attacker + subdps + stunner)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        const sameElement = attackers.every(a => getElement(a) === getElement(attackers[0]));
        if (hasSubDPS || sameElement) {
            if (debug) console.log('    Structure: UNCONVENTIONAL viable (double attacker with interaction)');
            return STRUCTURE.UNCONVENTIONAL_VIABLE;
        }
        if (debug) console.log('    Structure: UNCONVENTIONAL (double attacker, no interaction)');
        return STRUCTURE.UNCONVENTIONAL_NO_INTERACTION;
    }

    // Pseudo-DPS-support provides hidden DPS capability (e.g. Ramiel: anomaly DPS with support pseudo-role)
    if (supportLike.some(u => getEffectiveRoles(u).includes('dps'))) {
        if (nStun >= 1 || nSup >= 2) {
            if (debug) console.log('    Structure: UNCONVENTIONAL viable (pseudo-DPS-support team)');
            return STRUCTURE.UNCONVENTIONAL_VIABLE;
        }
    }

    // --- EVERYTHING ELSE: PENALTY ---
    if (debug) console.log(`    Structure: WILDLY UNCONVENTIONAL (atk=${nAtk} ano=${nAno} rup=${nRup} stun=${nStun} sup=${nSup})`);
    return STRUCTURE.WILDLY_UNCONVENTIONAL;
}

// ============================================================================
// LAYER 2: INHERENT QUALITY
// ============================================================================

function scoreInherentQuality(team, { lenient = false, debug = false, boss = null } = {}) {
    let score = 0;
    const reactions = computeAnomalyReactions(team, boss);

    const dpsUnits = team.filter(u => {
        if (!isDPS(u)) return false;
        if (getEffectiveRoles(u).includes('dps')) return true;
        return !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u);
    });
    const attackers = team.filter(u => isAttacker(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const anomalyUnits = team.filter(u => isAnomaly(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const armorerUnits = team.filter(u => isArmorer(u) && !isEffectiveSupport(u) && !isEffectiveDefense(u) && !isStun(u));
    const supportUnits = team.filter(isEffectiveSupport);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isEffectiveDefense);

    if (debug) console.log('\n  LAYER 2: INHERENT QUALITY');

    // --- DPS Tier ---
    if (debug) console.log('    DPS Tier:');
    const forcedSecondaryUnits = new Set();
    const reactionDisabledUnits = new Set();
    for (const unit of dpsUnits) {
        const tier = unit.tier ?? 2.5;

        const isSubDPS = hasSubDPSRole(unit);
        const isSecondaryAttacker = isSubDPS && isAttacker(unit) &&
            attackers.filter(a => a !== unit).length > 0;
        const isSecondaryAnomaly = isSubDPS && isAnomaly(unit) &&
            anomalyUnits.filter(a => a !== unit).length > 0;
        const hasDualDPSSupport = (() => {
            const pr = unit.mechanics?.pseudoRole;
            if (!Array.isArray(pr)) return false;
            const names = pr.map(pseudoRoleName);
            return names.includes('dps') && (names.includes('support') || names.includes('defense'));
        })();
        const forcedSecondary =
            hasDualDPSSupport ||
            (isAttacker(unit) && isForcedSecondaryDPS(unit, attackers)) ||
            (isAnomaly(unit) && isForcedSecondaryDPS(unit, anomalyUnits)) ||
            (isRupture(unit) && isForcedSecondaryDPS(unit, team.filter(isRupture))) ||
            (isArmorer(unit) && isForcedSecondaryDPS(unit, armorerUnits));
        if (forcedSecondary) forcedSecondaryUnits.add(unit);
        let tierMult = (isSecondaryAttacker || isSecondaryAnomaly || forcedSecondary) ? 0.5 : 1.0;
        const unitReaction = reactions.get(unit);
        const onElementWeakness = getBossWeaknesses(boss).includes(getElement(unit));
        const reactionDisabled = isSubDPS && isAnomaly(unit) &&
            !(unitReaction?.bestVortexTier > 0 || unitReaction?.hasDisorder) &&
            !onElementWeakness;
        if (reactionDisabled) {
            tierMult *= 0.5;
            reactionDisabledUnits.add(unit);
        }

        let tierBonus = 0;
        if (tier <= 0.5)      tierBonus = (40 - (tier * 10)) * tierMult;
        else if (tier <= 1.5) tierBonus = (18 - ((tier - 1) * 6)) * tierMult;
        else if (tier <= 2)   tierBonus = -(lenient ? 5 : 10);
        else if (tier <= 2.5) tierBonus = -(lenient ? 10 : 25);
        else if (tier <= 3)   tierBonus = -(lenient ? 25 : 65);
        else if (tier <= 3.5) tierBonus = -(lenient ? 35 : 90);
        else                  tierBonus = -(lenient ? 50 : 120);
        score += tierBonus;

        if (isTitled(unit)) {
            const titledBonus = forcedSecondary ? Math.round(15 * tierMult) : 15;
            score += titledBonus;
            if (debug) console.log(`      ${unit.name}: T${tier} → ${tierBonus >= 0 ? '+' : ''}${tierBonus}${tierMult < 1 ? ` (${forcedSecondary ? 'forced' : 'subdps'} x0.5)` : ''}, +${titledBonus} titled`);
        } else if (debug) {
            console.log(`      ${unit.name}: T${tier} → ${tierBonus >= 0 ? '+' : ''}${tierBonus}${tierMult < 1 ? ` (${forcedSecondary ? 'forced' : 'subdps'} x0.5)` : ''}`);
        }

        const dpsBuffUtil = computeBuffUtilization(unit, team);
        if (dpsBuffUtil < 1.0) {
            const buffs = unit.mechanics?.buffs || {};
            const totalBuffWeight = Object.values(buffs).reduce((sum, v) => sum + w(v), 0);
            if (totalBuffWeight > 0) {
                const wastedWeight = totalBuffWeight * (1 - dpsBuffUtil);
                const penalty = Math.round(wastedWeight * 15);
                score -= penalty;
                if (debug) console.log(`      ${unit.name}: wasted DPS buff penalty -${penalty} (util ${Math.round(dpsBuffUtil * 100)}%, wasted ${wastedWeight.toFixed(1)})`);
            }
        }

        const totalizeWeight = w(unit.mechanics?.damage?.totalize);
        if (totalizeWeight > 1) { //totalize penalty is only relevant if that is the key component of the kit. If it's only a small portion of the output, no need to penalize so heavily.
            const teammates = team.filter(t => t !== unit);
            let stunInfra = 0;
            for (const t of teammates) {
                const tRoles = getEffectiveRoles(t);
                if (tRoles.includes('stun')) {
                    stunInfra += 1;
                } else {
                    const hasHighDaze = w(t.mechanics?.utility?.daze) >= 2;
                    if (hasHighDaze) stunInfra += 0.2;
                }
            }

            if (stunInfra < 2) { 
                const deficit = 2 - stunInfra;
                const penalty = Math.round(totalizeWeight * MULT.TOTALIZE_PENALTY * deficit * (1 + deficit));
                score -= penalty;
                if (debug) console.log(`      ${unit.name}: totalize stun demand -${penalty} (stun infra ${stunInfra.toFixed(1)}, need 2)`);
            }
        }
    }

    // --- Non-DPS Tier + Rank (gated by buff utilization) ---
    const dpsSet = new Set(dpsUnits);
    for (const unit of [...supportUnits, ...defenseUnits, ...stunUnits].filter(u => !dpsSet.has(u))) {
        const tier = unit.tier ?? 2.5;
        let tierBonus = 0;
        if (tier <= 0.5)      tierBonus = 15 - (tier * 4);
        else if (tier <= 1.5) tierBonus = 7 - ((tier - 1) * 4);
        else if (tier <= 2)   tierBonus = 0;
        else if (tier <= 2.5) tierBonus = -(lenient ? 8 : 20);
        else                  tierBonus = -(lenient ? 15 : 35);

        let rankBonus = 0;
        if (isStun(unit)) {
            if (isSRank(unit)) { rankBonus += 6; if (isLimited(unit)) rankBonus += 5; }
            else if (isARank(unit)) rankBonus = -5;
        } else {
            if (isSRank(unit)) { rankBonus += 6; if (isLimited(unit)) rankBonus += 8; }
            else if (isARank(unit)) rankBonus = -5;
        }

        if (tier >= 2 && tierBonus < 0 && rankBonus > 0) {
            rankBonus = Math.min(rankBonus, Math.floor(Math.abs(tierBonus) / 2));
        }

        if (isStun(unit)) {
            const allDPSStunless = team.filter(isDPS).every(isStunlessUnit);
            if (allDPSStunless) {
                tierBonus = Math.round(tierBonus * 0.4);
                rankBonus = Math.round(rankBonus * 0.4);
            }
        }

        const utilization = computeBuffUtilization(unit, team);
        const relevanceMult = Math.max(BUFF_UTIL_FLOOR, utilization * utilization);
        if (tierBonus > 0) tierBonus = Math.round(tierBonus * relevanceMult);
        if (rankBonus > 0) rankBonus = Math.round(rankBonus * relevanceMult);

        score += tierBonus + rankBonus;
        if (debug) {
            const role = isStun(unit) ? 'stun' : 'support/def';
            const utilPct = Math.round(utilization * 100);
            console.log(`      ${unit.name}: T${tier} → tier ${tierBonus >= 0 ? '+' : ''}${tierBonus}, rank ${rankBonus >= 0 ? '+' : ''}${rankBonus} (${role}, util ${utilPct}%)`);
        }
    }

    // --- DPS Rank ---
    if (debug) console.log('    Rank:');
    for (const unit of dpsUnits) {
        let rankBonus = 0;
        if (isSRank(unit)) {
            rankBonus += 12;
            if (isTitled(unit)) rankBonus += 15;
            if (isLimited(unit)) rankBonus += 10;
        } else if (isARank(unit)) {
            const tier = unit.tier ?? 2.5;
            rankBonus = (tier >= 2) ? -(lenient ? 12 : 30) : -10;
        }
        if (forcedSecondaryUnits.has(unit) && rankBonus > 0) {
            rankBonus = Math.round(rankBonus * 0.5);
        }
        if (reactionDisabledUnits.has(unit) && rankBonus > 0) {
            rankBonus = Math.round(rankBonus * 0.5);
        }
        score += rankBonus;
        if (debug) console.log(`      ${unit.name} (DPS): ${rankBonus >= 0 ? '+' : ''}${rankBonus}${forcedSecondaryUnits.has(unit) ? ' (forced x0.5)' : ''}${reactionDisabledUnits.has(unit) ? ' (reaction-disabled x0.5)' : ''}`);
    }

    return score;
}

// ============================================================================
// LAYER 3: BOSS MATCHUP
// ============================================================================

function scoreBossMatchup(team, boss, { lenient = false, debug = false } = {}) {
    let score = 0;

    const bossWeaknesses = getBossWeaknesses(boss);
    const bossResistances = getBossResistances(boss);
    const bossShill = getBossShill(boss);
    const bossAnti = getBossAnti(boss);
    const bossAssists = getBossAssists(boss);
    const shillIntensity = getBossShillIntensity(boss);
    
    const dpsUnits = team.filter(isDPS);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isEffectiveDefense);

    if (debug) console.log('\n  LAYER 3: BOSS MATCHUP');

    // --- Shill preference ---
    if (bossShill) {
        const isDPSShill = DPS_ROLES.includes(bossShill);
        if (isDPSShill) {
            const hasShilledDPS = dpsUnits.some(u =>
                (u.tags.includes(bossShill) || (u._activatedRoles?.includes('dps') && u._activatedRoles?.includes(bossShill)))
                && !isEffectiveSupport(u) && !isEffectiveDefense(u));
            if (hasShilledDPS) {
                score += 8;
                if (debug) console.log(`    Shill match (${bossShill}): +8`);
            }
        } else {
            // A stun shill is a hard requirement because the boss only takes real damage
            // inside stun windows, where the stun multiplier applies. A stunless DPS holds
            // that multiplier permanently and bursts without a window, so it satisfies the
            // requirement on its own — no stunner needed.
            const hasShillRole = team.some(u => u.tags.includes(bossShill));
            const stunlessException = !hasShillRole && bossShill === 'stun'
                && team.some(u => isDPS(u) && isStunlessUnit(u));
            if (!hasShillRole && !stunlessException) {
                if (debug) console.log(`    DISQUALIFIED: Missing required role ${bossShill}`);
                return { score: -1, disqualified: true };
            }
            score += 8;
            if (debug) console.log(`    Non-DPS shill match (${bossShill})${stunlessException ? ' via stunless DPS' : ''}: +8`);
        }
    }
    
    // --- Favored units ---
    if (boss.favored && boss.favored.length > 0) {
        let favoredCount = 0;
        for (const unit of team) {
            if (boss.favored.includes(unit.name)) {
                favoredCount++;
                const multiplier = favoredCount === 1
                    ? shillIntensity
                    : 1 + (shillIntensity - 1) * 0.5;
                const bonus = Math.round(22 * multiplier);
                score += bonus;
                if (debug) console.log(`    Favored: ${unit.name} +${bonus} (intensity ${shillIntensity}, #${favoredCount})`);
            }
        }
    }
    
    // --- Boss-specific weakness mechanics ---
    // mechanics.weak is an array; support legacy single-string entries gracefully.
    const weakMechanics = [].concat(boss.mechanics?.weak ?? []);

    // Disorders weakness (e.g. Butcher): bonus scales with team disorder generation
    if (weakMechanics.includes('disorders')) {
        let totalDisorderScore = 0;
        for (const unit of team) {
            totalDisorderScore += w(unit.mechanics?.utility?.disorders);
        }
        if (teamHasImplicitDisorders(team)) totalDisorderScore += 2;
        if (totalDisorderScore > 0) {
            const bonus = Math.round(totalDisorderScore * BOSS_WEAK.DISORDER_PER_UNIT);
            score += bonus;
            if (debug) console.log(`    Boss weak(disorders): total=${totalDisorderScore} → +${bonus}`);
        }
    }

    // Veils weakness (e.g. Vesper): bonus scales with total veil supply on team
    if (weakMechanics.includes('veils')) {
        let totalVeils = 0;
        for (const unit of team) {
            totalVeils += w(unit.mechanics?.utility?.veils);
        }
        if (totalVeils > 0) {
            const bonus = Math.round(totalVeils * BOSS_WEAK.VEIL_PER_UNIT);
            score += bonus;
            if (debug) console.log(`    Boss weak(veils): total=${totalVeils} → +${bonus}`);
        }
    }

    // Stun weakness (e.g. Sweeper): flat bonus when team has at least one stunner
    if (weakMechanics.includes('stun')) {
        if (team.some(isStun)) {
            score += BOSS_WEAK.STUN_BONUS;
            if (debug) console.log(`    Boss weak(stun): stunner present → +${BOSS_WEAK.STUN_BONUS}`);
        }
    }

    // Abloom weakness (e.g. Scorched Horizon): bonus scales with total abloom output on team
    if (weakMechanics.includes('abloom')) {
        let totalAbloom = 0;
        for (const unit of team) {
            totalAbloom += w(unit.mechanics?.damage?.abloom);
        }
        if (totalAbloom > 0) {
            const bonus = Math.round(totalAbloom * BOSS_WEAK.ABLOOM_PER_UNIT);
            score += bonus;
            if (debug) console.log(`    Boss weak(abloom): total=${totalAbloom} → +${bonus}`);
        }
    }

    // Freezable boss (e.g. Sacrifice Bringer): ice anomaly agents get a large bonus.
    // Applies to any ice anomaly agent regardless of elemental variant.
    // Pseudo-anomaly agents (e.g. Soukaku) receive half the bonus.
    if (boss.mechanics?.freezable) {
        for (const unit of team) {
            if (isAnomaly(unit) && getElement(unit) === 'ice') {
                const isPseudo = !unit.tags.includes('anomaly');
                const bonus = isPseudo ? Math.round(BOSS_WEAK.FREEZE_BONUS * 0.5) : BOSS_WEAK.FREEZE_BONUS;
                score += bonus;
                if (debug) console.log(`    Boss freezable: ${unit.name}${isPseudo ? ' (pseudo, ×0.5)' : ''} → +${bonus}`);
            }
        }
    }

    // CD debuff (e.g. Scorched Horizon): each DPS unit with non-zero CD scaling is penalized
    // when the boss's CD debuff exceeds the team's total CD buff supply.
    // Penalty = shortfall × CD_DEBUFF_PER_UNIT, where shortfall = max(0, cdBaseline - effectiveCd).
    // effectiveCd = cdBaseline + teamCdSupply - cdDebuff.
    const cdDebuffVal = w(boss.mechanics?.debuffs?.cd);
    if (cdDebuffVal > 0) {
        const teamCdSupply = team.reduce((sum, u) =>
            sum + resolveConditionalValue(u.mechanics?.buffs?.cd, { team, self: u, consumer: null }), 0);
        for (const unit of dpsUnits) {
            const cdBaseline = w(getEffectiveScaling(unit).cd);
            if (cdBaseline > 0) {
                const effectiveCd = cdBaseline + teamCdSupply - cdDebuffVal;
                const shortfall = Math.max(0, cdBaseline - effectiveCd);
                if (shortfall > 0) {
                    const penalty = Math.round(shortfall * BOSS_WEAK.CD_DEBUFF_PER_UNIT);
                    score -= penalty;
                    if (debug) console.log(`    Boss CD debuff: ${unit.name} baseline=${cdBaseline} supply=${teamCdSupply} effective=${effectiveCd.toFixed(1)} shortfall=${shortfall.toFixed(1)} → -${penalty}`);
                }
            }
        }
    }

    // Daze debuff (e.g. Notorious Dead End Butcher): penalizes attack/rupture teams whose
    // stun windows are harder to trigger. High-daze stunners mitigate the effect. Anomaly
    // teams are not penalized — their damage is less window-dependent. The penalty is not a
    // hard anti-shill and can be fully mitigated by bringing a high-daze stunner.
    const dazeDebuffVal = w(boss.mechanics?.debuffs?.daze);
    if (dazeDebuffVal > 0) {
        const teamDazeSupply = team.reduce((sum, u) => sum + getSupplierDaze(u), 0);
        const shortfall = Math.max(0, dazeDebuffVal - teamDazeSupply);
        if (shortfall > 0) {
            for (const unit of dpsUnits) {
                const roles = getEffectiveRoles(unit);
                // Attack/rupture/armorer want stun windows (armorer's Maim is stun-assisted);
                // anomaly damage is less window-dependent and is not penalized.
                const isWindowDependent = roles.includes('attack') || roles.includes('rupture') || roles.includes('armorer');
                if (!isWindowDependent || isStunlessUnit(unit)) continue;
                const penalty = Math.round(shortfall * BOSS_WEAK.DAZE_DEBUFF_PER_UNIT);
                score -= penalty;
                if (debug) console.log(`    Boss daze debuff: ${unit.name} supply=${teamDazeSupply} shortfall=${shortfall.toFixed(1)} → -${penalty}`);
            }
        }
    }

    // --- DPS element weakness/resistance ---
    const l3Reactions = computeAnomalyReactions(team, boss);
    let onElementDPSCount = 0;
    for (const unit of dpsUnits) {
        const element = getElement(unit);

        if (bossWeaknesses.includes(element)) {
            onElementDPSCount++;
            const isSubDPS = hasSubDPSRole(unit);
            const unitReaction = l3Reactions.get(unit);
            const reactionDisabled = isSubDPS && isAnomaly(unit) &&
                !(unitReaction?.bestVortexTier > 0 || unitReaction?.hasDisorder) &&
                !bossWeaknesses.includes(element);
            let bonus = isSRank(unit)
                ? (isSubDPS ? 17 : 28)
                : (isSubDPS ? 9 : 15);
            if (reactionDisabled) bonus = Math.round(bonus * 0.5);
            if (onElementDPSCount > 1 && bossWeaknesses.length >= 2) bonus = Math.round(bonus * 0.6);
            score += bonus;
            if (debug) console.log(`    ${unit.name} on-element (${element}): +${bonus}${reactionDisabled ? ' (reaction-disabled)' : ''}${onElementDPSCount > 1 ? ' (diminished)' : ''}`);

            if (isTitled(unit) && bossShill && DPS_ROLES.includes(bossShill) && !unit.tags.includes(bossShill)) {
                score += 15;
                if (debug) console.log(`    ${unit.name} titled on-element vs shill mismatch: +15`);
            }
        }
    }

    if (bossWeaknesses.length > 0) {
        const primaryDPS = dpsUnits.filter(u => !hasSubDPSRole(u) && !isStun(u));
        const onCount = primaryDPS.filter(u => bossWeaknesses.includes(getElement(u))).length;
        const offCount = primaryDPS.length - onCount;

        if (offCount > 0 && primaryDPS.length > 0) {
            const offRatio = offCount / primaryDPS.length;
            const singleWeakness = bossWeaknesses.length === 1;
            const basePenalty = singleWeakness ? 45 : 30;
            const hasTitled = primaryDPS.some(u => isTitled(u) && !bossWeaknesses.includes(getElement(u)));
            const titledReduction = hasTitled ? 0.5 : 1.0;
            const applied = Math.round(basePenalty * offRatio * titledReduction);
            score -= lenient ? Math.floor(applied / 2) : applied;
            if (debug) console.log(`    Off-element DPS penalty: -${lenient ? Math.floor(applied / 2) : applied} (${offCount}/${primaryDPS.length} off, base=${basePenalty}${hasTitled ? ', titled' : ''})`);
        }
    }

    // --- Stunner element ---
    for (const unit of stunUnits) {
        const element = getElement(unit);
        if (bossResistances.includes(element)) {
            score -= 80;
            if (debug) console.log(`    ${unit.name} stun element resisted: -80`);
        }
        if (bossWeaknesses.includes(element)) {
            const util = computeBuffUtilization(unit, team);
            const scaledBonus = Math.round(15 * util);
            score += scaledBonus;
            if (debug) console.log(`    ${unit.name} stun on-element: +${scaledBonus} (util ${Math.round(util * 100)}%)`);
        } else if (!bossResistances.includes(element) && bossWeaknesses.length > 0) {
            const hasAnomPseudo = unit._activatedRoles?.some(r => DPS_ROLES.includes(r));
            const penalty = hasAnomPseudo ? 0 : 15;
            score -= penalty;
            if (debug) console.log(`    ${unit.name} stun off-element: -${penalty}${hasAnomPseudo ? ' (DPS pseudo-role)' : ''}`);
        }
    }

    // --- Pseudo-role vs boss anti-type ---
    if (bossAnti.length > 0) {
        for (const unit of team) {
            if (isDPS(unit)) continue;
            const activatedRoles = unit._activatedRoles || [];
            for (const antiType of bossAnti) {
                if (activatedRoles.includes(antiType) && !unit.tags.includes(antiType)) {
                    score -= 30;
                    if (debug) console.log(`    ${unit.name} pseudo-role '${antiType}' matches boss anti: -30`);
                }
            }
        }
    }

    // --- Defense element ---
    for (const unit of defenseUnits) {
        const element = getElement(unit);
        if (bossWeaknesses.includes(element)) {
            score += 3;
            if (debug) console.log(`    ${unit.name} defense on-element: +3`);
        }
    }

    // --- Damage-relevant resistance for support/defense units ---
    for (const unit of team) {
        const element = getElement(unit);
        if (!bossResistances.includes(element)) continue;
        if (!isEffectiveSupport(unit) && !isEffectiveDefense(unit)) continue;
        const damage = unit.mechanics?.damage || {};
        const maxDamage = Math.max(0, ...Object.values(damage).map(v =>
            typeof v === 'object' ? Math.max(...Object.values(v).map(Number)) : Number(v) || 0
        ));
        if (maxDamage > 1) {
            const penalty = Math.round(maxDamage * 8);
            score -= penalty;
            if (debug) console.log(`    ${unit.name} damage-relevant resistance: -${penalty} (damage ${maxDamage})`);
        }
    }

    // --- Defensive assist bonus ---
    const effectiveAssists = getEffectiveAssists(boss, team);
    if (effectiveAssists >= 2) {
        const extra = team.filter(hasDefensiveAssist).length - effectiveAssists;
        if (extra > 0) {
            score += extra * 3;
            if (debug) console.log(`    Extra defensive assists: +${extra * 3}`);
        }
    }

    return { score, disqualified: false };
}

// ============================================================================
// LAYER 4: MECHANICAL SYNERGY
// ============================================================================

// --- Baseline Affinity ---

function scoreBaselineAffinity(supplier, consumer, debug, options = {}) {
    let score = 0;
    // Resolve conditional buff/debuff values against THIS (supplier, consumer) pair so
    // recipient-scoped (role) conditionals route correctly per teammate.
    const _ctx = { team: options.team || [], self: supplier, consumer };
    const supplierBuffs = resolveValueMap(supplier.mechanics?.buffs, _ctx);
    const supplierDebuffs = resolveValueMap(supplier.mechanics?.debuffs, _ctx);
    const consumerRoles = getEffectiveRoles(consumer);
    const consumerElement = getElement(consumer);
    const firedCategories = new Set();
    const dbg = (cat, val) => {
        if (val > 0) firedCategories.add(cat);
        if (debug && val > 0) console.log(`        ${cat}: ${val.toFixed(1)}`);
    };

    // ATK buffs → all DPS (supports conditional buffs)
    const effectiveAtk = supplierBuffs.atk || 0;
    if (effectiveAtk > 0) {
        const cw = resolveBaselineWeight(consumer, 'atk');
        if (cw > 0) {
            const atkEfficiency = consumerRoles.includes('rupture') ? RUPTURE_ATK_EFFICIENCY
                : consumerRoles.includes('armorer') ? ARMORER_ATK_EFFICIENCY
                : 1;
            const supply = effectiveAtk * atkEfficiency;
            const val = supply * cw * MULT.ATK_BUFF;
            score += val;
            dbg('atk', val);
        }
    }

    // Anomaly buffs → anomaly agents
    if (supplierBuffs.anomaly) {
        const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
        if (cw > 0) {
            const val = w(supplierBuffs.anomaly) * cw * MULT.ANOMALY_BUFF;
            score += val;
            dbg('anomaly', val);
        }
    }

    // Disorder damage buff → anomaly agents, only when team generates disorders
    // On vortex bosses, natural disorders are suppressed; discount proportionally
    if (supplierBuffs.disorders && options?.hasDisorderGeneration) {
        const discount = options?.disorderBuffDiscount ?? 1;
        if (discount > 0) {
            const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
            if (cw > 0) {
                const val = w(supplierBuffs.disorders) * cw * MULT.ANOMALY_BUFF * discount;
                score += val;
                dbg('disorder-buff', val);
            }
        }
    }

    // Vortex buff → anomaly agents that actually generate vortex reactions this fight.
    // Tier-scaled so ice-vortex consumers (Promeia) benefit more than lower-tier ones.
    if (supplierBuffs.vortex) {
        const reaction = options?.reactions?.get(consumer);
        if (reaction?.bestVortexTier > 0) {
            const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
            if (cw > 0) {
                const tierScale = Math.min(1.0, reaction.bestVortexTier / MAX_VORTEX_TIER);
                const val = w(supplierBuffs.vortex) * cw * tierScale * MULT.VORTEX_BUFF;
                score += val;
                dbg('vortex-buff', val);
            }
        }
    }

    // Sheer buffs → rupture agents
    if (supplierBuffs.sheer) {
        const cw = resolveBaselineWeight(consumer, 'sheer');
        if (cw > 0) {
            const val = w(supplierBuffs.sheer) * cw * MULT.SHEER_BUFF;
            score += val;
            dbg('sheer', val);
        }
    }

    // PEN buffs → non-rupture DPS
    if (supplierBuffs.pen) {
        const cw = resolveBaselineWeight(consumer, 'pen');
        if (cw > 0) {
            const discount = options?.antiRupture ? 0.5 : 1;
            const val = w(supplierBuffs.pen) * cw * MULT.PEN_BUFF * discount;
            score += val;
            dbg('pen', val);
        }
    }

    // CR buffs → attackers and rupture
    if (supplierBuffs.cr) {
        const cw = resolveBaselineWeight(consumer, 'cr');
        if (cw > 0) {
            const val = w(supplierBuffs.cr) * cw * MULT.CR_BUFF;
            score += val;
            dbg('cr', val);
        }
    }

    // CD buffs → attackers and rupture
    if (supplierBuffs.cd) {
        const cw = resolveBaselineWeight(consumer, 'cd');
        if (cw > 0) {
            const val = w(supplierBuffs.cd) * cw * MULT.CD_BUFF;
            score += val;
            dbg('cd', val);
        }
    }

    // DEF buffs → consumers that scale with DEF (armorers + generic defense-DPS units).
    // DEF is the armorer's primary stat, so it carries a dedicated (higher) multiplier.
    if (supplierBuffs.def) {
        const cw = resolveBaselineWeight(consumer, 'def');
        if (cw > 0) {
            const val = w(supplierBuffs.def) * cw * MULT.DEF_BUFF;
            score += val;
            dbg('def', val);
        }
    }

    // Stun-multiplier buffs → all DPS
    if (supplierBuffs['stun-multiplier']) {
        const cw = isDPSByRoles(consumerRoles) ? 1 : 0;
        if (cw > 0) {
            const val = w(supplierBuffs['stun-multiplier']) * cw * MULT.STUN_MULT_BUFF;
            score += val;
            dbg('stun-multiplier', val);
        }
    }

    // Generic damage buff/debuff → all DPS, always lands. Debuff worth slightly less
    // (single-enemy vs team-wide). This is the whole point of Koleda's rework.
    if (isDPSByRoles(consumerRoles)) {
        if (supplierBuffs.dmg) {
            const val = w(supplierBuffs.dmg) * MULT.DMG_BUFF;
            score += val;
            dbg('dmg', val);
        }
        if (supplierDebuffs.dmg) {
            const val = w(supplierDebuffs.dmg) * MULT.DMG_DEBUFF;
            score += val;
            dbg('dmg-debuff', val);
        }
    }

    // Defense debuffs → non-rupture DPS and stunners
    if (supplierDebuffs.defense) {
        const cw = resolveBaselineWeight(consumer, 'defense');
        if (cw > 0) {
            const discount = options?.antiRupture ? 0.5 : 1;
            const val = w(supplierDebuffs.defense) * cw * MULT.DEFENSE_DEBUFF * discount;
            score += val;
            dbg('defense', val);
        }
    }

    // Element buffs → matching-element DPS and stunners
    for (const elem of ELEMENTS) {
        if (supplierBuffs[elem] && consumerElement === elem) {
            const cw = resolveBaselineWeight(consumer, 'element');
            if (cw > 0) {
                const val = w(supplierBuffs[elem]) * cw * MULT.ELEMENT_BUFF;
                score += val;
                dbg(`element-buff(${elem})`, val);
            }
        }
    }

    // Element debuffs → matching-element DPS and stunners
    for (const elem of ELEMENTS) {
        if (supplierDebuffs[elem] && consumerElement === elem) {
            const cw = resolveBaselineWeight(consumer, 'element');
            if (cw > 0) {
                const val = w(supplierDebuffs[elem]) * cw * MULT.ELEMENT_DEBUFF;
                score += val;
                dbg(`element-debuff(${elem})`, val);
            }
        }
    }

    // Stun infrastructure → non-stunless attackers and rupture
    const infraWeight = getStunInfraWeight(supplier);
    if (infraWeight > 0) {
        const cw = resolveBaselineWeight(consumer, 'stun-infra');
        if (cw > 0) {
            const val = infraWeight * cw * MULT.STUN_INFRA;
            score += val;
            dbg('stun-infra', val);
        }
    }

    // Recovery debuffs → all DPS (non-stunless), proportional to burst potential
    // Chains scaling: longer stun windows = more chains
    // Totalize: entire damage output is stun-time-dependent, so recovery is critical
    if (supplierDebuffs.recovery) {
        if (!isStunlessUnit(consumer) && isDPSByRoles(consumerRoles)) {
            const burstWeight = getMaxBurstWeight(consumer);
            const chainsScaling = w(consumer.mechanics?.scaling?.chains);
            const totalizeWeight = w(consumer.mechanics?.damage?.totalize);
            const recoveryScaling = w(consumer.mechanics?.scaling?.recovery);
            const effectiveBurst = burstWeight + chainsScaling + totalizeWeight * 2 + recoveryScaling;
            const val = w(supplierDebuffs.recovery) * effectiveBurst * MULT.RECOVERY_DEBUFF;
            score += val;
            dbg('recovery', val);
        }
    }

    // Ultimates provision → primary DPS only (subdps don't consume the burst window)
    // Skipped when consumer has a weak ultimate (their ultimate isn't stronger than their chain)
    const supplierUtility = supplier.mechanics?.utility || {};
    const ultimatesWeight = w(supplierUtility.ultimates);
    if (ultimatesWeight > 0 && isDPSByRoles(consumerRoles) && !hasSubDPSRole(consumer)) {
        // ultimate:strong (possibly conditional) overrides ultimate:weak — provision counts again.
        const cDmg = consumer._resolvedDamage || consumer.mechanics?.damage || {};
        const weakUltActive = w(cDmg['ultimate:weak']) > 0 && w(cDmg['ultimate:strong']) === 0;
        if (!weakUltActive) {
            const burstWeight = getMaxBurstWeight(consumer);
            const val = ultimatesWeight * burstWeight * MULT.ULTIMATES_PROVISION;
            score += val;
            dbg('ultimates', val);
        }
    }

    return { score, firedCategories };
}

// --- Need Fulfillment ---

function scoreNeedFulfillment(supplier, consumer, debug, options = {}) {
    let score = 0;
    const scaling = getEffectiveScaling(consumer);
    const _ctx = { team: options.team || [], self: supplier, consumer };
    const supplierBuffs = resolveValueMap(supplier.mechanics?.buffs, _ctx);
    const supplierDebuffs = resolveValueMap(supplier.mechanics?.debuffs, _ctx);
    const supplierUtility = resolveValueMap(supplier.mechanics?.utility, _ctx);

    const converts = consumer.mechanics?.converts;
    const replaces = supplier.mechanics?.replaces;

    for (const key of NEED_FULFILLMENT_KEYS) {
        const scalingWeight = w(scaling[key]);
        if (scalingWeight === 0) continue;

        let supplyWeight;
        if (key === 'disorders') {
            supplyWeight = w(supplierUtility[key]);
        } else {
            supplyWeight = Math.max(
                w(supplierBuffs[key]),
                w(supplierDebuffs[key]),
                w(supplierUtility[key])
            );
        }

        // Consumer-side conversion: if consumer converts X→Y, supplier's X provision
        // augments effective Y supply (e.g., Norma converts QA→chain, so QA supply also
        // counts as chain supply for need fulfillment)
        if (converts) {
            for (const [inputKey, outputKey] of Object.entries(converts)) {
                if (outputKey === key) {
                    const convertedSupply = Math.max(
                        w(supplierBuffs[inputKey]),
                        w(supplierDebuffs[inputKey]),
                        w(supplierUtility[inputKey])
                    );
                    supplyWeight = Math.max(supplyWeight, convertedSupply);
                }
            }
        }

        if (supplyWeight > 0) {
            // Undersupply is worse than linear: partially meeting a need (e.g. Lucia's
            // veils:1 for YSG's veils:2) helps, but not enough to do the job.
            let fulfillment = Math.min(1, supplyWeight / scalingWeight);
            if (supplyWeight < scalingWeight) fulfillment *= UNDERSUPPLY_FACTOR;
            const val = supplyWeight * scalingWeight * MULT.NEED_FULFILLMENT * fulfillment;
            score += val;
            if (debug) console.log(`        need(${key}): ${val.toFixed(1)}${fulfillment < 1 ? ` (gated ${Math.round(fulfillment * 100)}%)` : ''}`);
        }

        // Supplier-side replacement: if supplier provides X which replaces consumer's Y,
        // reduces effective Y supply (e.g., Dialyn's ultimates replace chains)
        if (replaces) {
            for (const [costKey, providedKey] of Object.entries(replaces)) {
                if (costKey !== key) continue;
                const provisionWeight = w(supplierUtility[providedKey] ?? supplierBuffs[providedKey]);
                if (provisionWeight <= 0) continue;
                const fulfillment = Math.min(1, provisionWeight / scalingWeight);
                const penalty = provisionWeight * scalingWeight * MULT.REPLACEMENT_COST * fulfillment;
                score -= penalty;
                if (debug) console.log(`        replace-cost(${providedKey}->${costKey}): -${penalty.toFixed(1)}`);
            }
        }
    }

    const scalingAttacker = w(scaling.attacker);
    if (scalingAttacker > 0) {
        const supplierRoles = getEffectiveRoles(supplier);
        if (supplierRoles.includes('attack')) {
            const val = scalingAttacker * MULT.NEED_FULFILLMENT;
            score += val;
            if (debug) console.log(`        need(attacker-role): ${val.toFixed(1)}`);
        }
    }

    // Damage-type need fulfillment: consumer's damage types create implicit scaling
    // for matching supplier buffs (aftershock buff → aftershock dealer, etc.)
    // Polarity is a subclass of disorders: buffs.disorders also satisfies damage.polarity
    const consumerDamage = consumer._resolvedDamage || consumer.mechanics?.damage || {};
    for (const [damageType, damageWeight] of Object.entries(consumerDamage)) {
        const dw = w(damageWeight);
        if (dw === 0) continue;
        let buffWeight = w(supplierBuffs[damageType]);
        if (damageType === 'polarity') {
            buffWeight = Math.max(buffWeight, w(supplierBuffs.disorders));
        }
        // Consumer-side conversion: if consumer converts X→Y, supplier's X provision
        // also counts as supply for Y damage type
        if (converts) {
            for (const [inputKey, outputKey] of Object.entries(converts)) {
                if (outputKey === damageType) {
                    const convertedSupply = Math.max(
                        w(supplierBuffs[inputKey]),
                        w(supplierUtility[inputKey])
                    );
                    buffWeight = Math.max(buffWeight, convertedSupply);
                }
            }
        }
        if (buffWeight > 0) {
            let val = buffWeight * dw * MULT.DAMAGE_NEED;
            if (damageType === 'polarity' && isVortexBoss(options?.boss)) {
                val *= POLARITY_VORTEX_DISCOUNT;
            }
            score += val;
            if (debug) console.log(`        need(damage:${damageType}): ${val.toFixed(1)}${damageType === 'polarity' && isVortexBoss(options?.boss) ? ' (vortex discount)' : ''}`);
        }
    }

    return score;
}

// --- Stun Emergence ---

function scoreStunEmergence(supplier, consumer, debug) {
    if (isStunlessUnit(consumer)) return 0;

    const burstWeight = getMaxBurstWeight(consumer);
    if (burstWeight === 0) return 0;

    const infraWeight = getStunInfraWeight(supplier);
    if (infraWeight === 0) return 0;

    let score = burstWeight * infraWeight * MULT.STUN_EMERGENCE;
    if (debug) console.log(`        stun-emergence: burst=${burstWeight} × infra=${infraWeight} × ${MULT.STUN_EMERGENCE} = ${score.toFixed(1)}`);

    // Totalize quantity bonus: more stunners = more stun cycles for totalize
    const totalizeWeight = w(consumer.mechanics?.damage?.totalize);
    if (totalizeWeight > 0 && getEffectiveRoles(supplier).includes('stun')) {
        const stunWeight = getSupplierDaze(supplier);
        const bonus = totalizeWeight * stunWeight * MULT.TOTALIZE_QTY;
        score += bonus;
        if (debug) console.log(`        totalize-qty: ${totalizeWeight} × ${stunWeight} × ${MULT.TOTALIZE_QTY} = ${bonus.toFixed(1)}`);
    }

    return score;
}

// --- Diametric Buff Synergy ---

const DIAMETRIC_RATE = 0.20;
const ON_ELEMENT_L4 = 1.15;
const OFF_ELEMENT_L4 = 0.85;

function countDiametricPairs(consumer, team, { antiRupture = false } = {}) {
    let pairs = 0;
    let maxFloor = 0;
    const consumerElement = getElement(consumer);
    const consumerRoles = getEffectiveRoles(consumer);
    if (!isDPSByRoles(consumerRoles)) return { count: 0, floor: 0 };

    const suppliers = team.filter(t => t !== consumer);
    const atkCdSuppliers = new Map();
    const defDebuffSuppliers = new Map();
    const elemBuffSuppliers = new Map();
    const elemDebuffSuppliers = new Map();

    for (const s of suppliers) {
        const buffs = resolveValueMap(s.mechanics?.buffs, { team, self: s, consumer: null });
        const debuffs = resolveValueMap(s.mechanics?.debuffs, { team, self: s, consumer: null });
        const atkCdWeight = Math.max(getEffectiveBuffValue(s, team, 'atk'), w(buffs.cd));
        if (atkCdWeight > 0) atkCdSuppliers.set(s.name, atkCdWeight);
        const defWeight = w(debuffs.defense);
        if (defWeight > 0) defDebuffSuppliers.set(s.name, defWeight);
        for (const elem of ELEMENTS) {
            if (elem !== consumerElement) continue;
            const elemBw = w(buffs[elem]);
            if (elemBw > 0) {
                if (!elemBuffSuppliers.has(elem)) elemBuffSuppliers.set(elem, new Map());
                elemBuffSuppliers.get(elem).set(s.name, elemBw);
            }
            const elemDw = w(debuffs[elem]);
            if (elemDw > 0) {
                if (!elemDebuffSuppliers.has(elem)) elemDebuffSuppliers.set(elem, new Map());
                elemDebuffSuppliers.get(elem).set(s.name, elemDw);
            }
        }
    }

    if (atkCdSuppliers.size > 0 && defDebuffSuppliers.size > 0) {
        const hasDistinct = [...atkCdSuppliers.keys()].some(s => !defDebuffSuppliers.has(s))
            || [...defDebuffSuppliers.keys()].some(s => !atkCdSuppliers.has(s));
        if (hasDistinct) {
            pairs++;
            if (!antiRupture) {
                const buffW = Math.max(...atkCdSuppliers.values());
                const debuffW = Math.max(...defDebuffSuppliers.values());
                if (buffW >= 2 && debuffW >= 2) {
                    maxFloor = Math.max(maxFloor, Math.min(1.0, 0.4 + (buffW + debuffW) * 0.1));
                }
            }
        }
    }

    for (const elem of ELEMENTS) {
        const buffMap = elemBuffSuppliers.get(elem);
        const debuffMap = elemDebuffSuppliers.get(elem);
        if (buffMap && debuffMap) {
            const hasDistinct = [...buffMap.keys()].some(s => !debuffMap.has(s))
                || [...debuffMap.keys()].some(s => !buffMap.has(s));
            if (hasDistinct) {
                pairs++;
                const buffW = Math.max(...buffMap.values());
                const debuffW = Math.max(...debuffMap.values());
                if (buffW >= 2 && debuffW >= 2) {
                    maxFloor = Math.max(maxFloor, Math.min(1.0, 0.4 + (buffW + debuffW) * 0.1));
                }
            }
        }
    }

    return { count: pairs, floor: maxFloor };
}

// --- Layer 4 Orchestrator ---

function scoreMechanicalSynergy(team, debug, options = {}) {
    let totalScore = 0;
    const boss = options.boss;
    const reactions = computeAnomalyReactions(team, boss);
    const hasDisorderGen = teamHasDisorderGenerationFromReactions(team, reactions);
    const vortexBoss = isVortexBoss(boss);

    const disorderBuffDiscount = vortexBoss
        ? (teamHasPolarity(team) ? POLARITY_VORTEX_DISCOUNT : 0)
        : 1;
    const l4Options = {
        ...options,
        hasDisorderGeneration: hasDisorderGen,
        disorderBuffDiscount,
        boss,
        reactions,
        team,
    };

    if (debug) console.log('\n  LAYER 4: MECHANICAL SYNERGY');

    const consumerScores = new Map();

    // Pairwise scoring
    for (const consumer of team) {
        let consumerTotal = 0;

        for (const supplier of team) {
            if (supplier === consumer) continue;

            if (debug) console.log(`      ${supplier.name} → ${consumer.name}:`);

            const { score: affinityScore, firedCategories } = scoreBaselineAffinity(supplier, consumer, debug, l4Options);
            consumerTotal += affinityScore;

            const needScore = scoreNeedFulfillment(supplier, consumer, debug, l4Options);
            consumerTotal += needScore;

            const stunScore = scoreStunEmergence(supplier, consumer, debug);
            consumerTotal += stunScore;

            if (debug) {
                const pairTotal = affinityScore + needScore + stunScore;
                console.log(`        pair total: ${pairTotal.toFixed(1)}`);
            }
        }

        consumerScores.set(consumer.name, consumerTotal);
    }

    // Anomaly reaction bonuses (vortex + disorder)
    const anomalyDPS = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    for (const unit of anomalyDPS) {
        const reaction = reactions.get(unit);
        if (!reaction) continue;

        if (reaction.bestVortexTier > 0) {
            const vortexBonus = VORTEX_BASE * reaction.bestVortexTier;
            consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + vortexBonus);
            if (debug) console.log(`    Vortex bonus: ${unit.name} +${vortexBonus.toFixed(1)} (tier ${reaction.bestVortexTier})`);
        }

        if (reaction.hasDisorder) {
            const disorderScaling = w(unit.mechanics?.scaling?.disorders);
            if (disorderScaling > 0) {
                const implicitSupply = 2;
                const fulfillment = Math.min(1, implicitSupply / disorderScaling);
                const val = implicitSupply * disorderScaling * MULT.NEED_FULFILLMENT * fulfillment;
                consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + val);
                if (debug) console.log(`    Implicit disorder need: ${unit.name} +${val.toFixed(1)} (supply ${implicitSupply}, scaling ${disorderScaling}, gated ${Math.round(fulfillment * 100)}%)`);
            } else {
                consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + MULT.DISORDER_BONUS);
                if (debug) console.log(`    Implicit disorder: ${unit.name} +${MULT.DISORDER_BONUS}`);
            }
        }
    }

    // Refringe bonus: when a lumen anomaly agent is present, their Lumiflux Buildup is consumed
    // when a non-lumen anomaly teammate procs an anomaly, dealing a large additional hit.
    // Cascade: Attribute Mutation boosts anomaly proc damage, so disorder/vortex damage (which
    // derives from anomaly procs) is also amplified. Partners with active reactions get extra credit.
    const lumenAnomalyAgents = anomalyDPS.filter(isLumenUnit);
    if (lumenAnomalyAgents.length > 0) {
        const nonLumenAnomalyPartners = anomalyDPS.filter(u => !isLumenUnit(u));
        for (const partner of nonLumenAnomalyPartners) {
            const reaction = reactions.get(partner);
            let bonus = REFRINGE_BONUS;
            if (reaction?.hasDisorder) bonus += REFRINGE_DISORDER_CASCADE;
            if (reaction?.bestVortexTier > 0) bonus += REFRINGE_VORTEX_CASCADE;
            consumerScores.set(partner.name, (consumerScores.get(partner.name) || 0) + bonus);
            if (debug) {
                const parts = [`base ${REFRINGE_BONUS}`];
                if (reaction?.hasDisorder) parts.push(`disorder +${REFRINGE_DISORDER_CASCADE}`);
                if (reaction?.bestVortexTier > 0) parts.push(`vortex +${REFRINGE_VORTEX_CASCADE}`);
                console.log(`    Refringe: ${partner.name} +${bonus} (${parts.join(', ')})`);
            }
        }
    }

    // Maim reaction bonus. Only armorers open Gash meters; all meters share one pool of marks
    // (max 3), and only stun/armorer agents build that pool (+ non-stun/non-armorer units that
    // Claret has granted gash-build to, via utility["gash-build"]). More gash builders → the
    // shared pool fills faster → more/bigger Maims (only stun/armorer detonate). This is why
    // armorers favour stun/armorer-dense comps (Stun/Armorer/Armorer, Armorer/Armorer/Support).
    // The shared-pool cap is modelled by capping the builder count.
    const armorerUnits = team.filter(u => getEffectiveRoles(u).includes('armorer'));
    if (armorerUnits.length > 0) {
        const grantsGashBuild = team.some(u => w(u.mechanics?.utility?.['gash-build']) > 0);
        const buildsGash = (u) => isStun(u) || isArmorer(u)
            || (grantsGashBuild && !isStun(u) && !isArmorer(u));
        for (const unit of armorerUnits) {
            const builderCount = Math.min(2, team.filter(u => u !== unit && buildsGash(u)).length);
            const maimBonus = MAIM_BASE + MAIM_ENABLER_BONUS * builderCount;
            consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + maimBonus);
            if (debug) console.log(`    Maim: ${unit.name} +${maimBonus} (base ${MAIM_BASE}, ${builderCount} gash-builder(s))`);
        }
    }

    // Anomaly-quantity scaling: a unit that deals extra damage the more anomaly is on the enemy.
    //   `scaling.anomaly`         — generic: fed by ANY effective anomaly agent (any element).
    //   `scaling["anomaly:wind"]` — element-scoped: fed ONLY by wind anomaly agents.
    // A wind-anomaly source is still anomaly, so it satisfies BOTH the generic and the wind need.
    // Supply counts effective anomaly agents on the team INCLUDING self (a wind pseudo-anomaly
    // self-fulfils its own wind need). Linear in supply — oversupply always helps (two anomaly
    // agents feed Harumasa's generic anomaly scaling a lot; Vivian's ether gives a wind-scaler nothing).
    for (const consumer of team) {
        const cScaling = getEffectiveScaling(consumer);
        for (const [skey, sval] of Object.entries(cScaling)) {
            let element;
            if (skey === 'anomaly') element = null;              // generic: any element
            else if (skey.startsWith('anomaly:')) element = skey.slice('anomaly:'.length);
            else continue;
            const scalingWeight = w(sval);
            if (scalingWeight <= 0) continue;
            const supply = team.filter(u =>
                getEffectiveRoles(u).includes('anomaly') && (element === null || getElement(u) === element)).length;
            if (supply <= 0) continue;
            const bonus = ANOMALY_ELEMENT_MULT * scalingWeight * supply;
            consumerScores.set(consumer.name, (consumerScores.get(consumer.name) || 0) + bonus);
            if (debug) console.log(`    Anomaly(${element ?? 'any'}): ${consumer.name} +${bonus} (${supply} anomaly source(s))`);
        }
    }

    // Diametric synergy: proportional amplifier on consumer's incoming L4
    if (debug) console.log('    Diametric synergy:');
    for (const consumer of team) {
        const { count: pairs } = countDiametricPairs(consumer, team);
        if (pairs > 0) {
            const multiplier = 1 + pairs * DIAMETRIC_RATE;
            const base = consumerScores.get(consumer.name) || 0;
            const rawBonus = base * (multiplier - 1);
            const bonus = Math.max(rawBonus, pairs * 10);
            consumerScores.set(consumer.name, base + bonus);
            if (debug) console.log(`    Diametric for ${consumer.name}: ${pairs} pair(s) → ×${multiplier.toFixed(2)} on ${base.toFixed(1)} = +${bonus.toFixed(1)}${bonus > rawBonus ? ' (floored)' : ''}`);
        }
    }

    // L4 element modifier: on-element DPS gets boosted, off-element gets discounted
    const l4Weaknesses = getBossWeaknesses(boss);
    if (boss && l4Weaknesses.length > 0) {
        for (const consumer of team) {
            const roles = getEffectiveRoles(consumer);
            if (!isDPSByRoles(roles)) continue;
            const element = getElement(consumer);
            const base = consumerScores.get(consumer.name) || 0;
            if (base <= 0) continue;
            if (l4Weaknesses.includes(element)) {
                const bonus = base * (ON_ELEMENT_L4 - 1);
                consumerScores.set(consumer.name, base + bonus);
                if (debug) console.log(`    L4 element: ${consumer.name} on-element → ×${ON_ELEMENT_L4} on ${base.toFixed(1)} = +${bonus.toFixed(1)}`);
            } else {
                const penalty = base * (1 - OFF_ELEMENT_L4);
                consumerScores.set(consumer.name, base - penalty);
                if (debug) console.log(`    L4 element: ${consumer.name} off-element → ×${OFF_ELEMENT_L4} on ${base.toFixed(1)} = -${penalty.toFixed(1)}`);
            }
        }
    }

    for (const [, score] of consumerScores) {
        totalScore += score;
    }

    // Conditional buff underutilization penalty — applied once per supplier
    for (const supplier of team) {
        const penalty = computeConditionalBuffPenalty(supplier, team);
        if (penalty > 0) {
            totalScore -= penalty;
            if (debug) console.log(`    Conditional underutil penalty: ${supplier.name} -${penalty.toFixed(2)}`);
        }
    }

    if (debug) console.log(`    Layer 4 total: ${totalScore.toFixed(1)}`);

    return totalScore;
}

// ============================================================================
// LAYER 5: ADDITIONAL SYNERGIES
// ============================================================================

function scoreAdditionalSynergies(team, debug) {
    let score = 0;

    if (debug) console.log('\n  LAYER 5: ADDITIONAL SYNERGIES');

    // Unit synergy (currently AoD only)
    for (const unit of team) {
        const unitSynergies = unit.synergy?.units || [];
        if (unitSynergies.length === 0) continue;

        for (const teammate of team) {
            if (teammate === unit) continue;
            if (unitSynergies.includes(teammate.name)) {
                score += 15;
                if (debug) console.log(`    ${unit.name} → ${teammate.name}: +15 (unit synergy)`);

                const mutual = teammate.synergy?.units?.includes(unit.name);
                if (mutual) {
                    score += 25;
                    if (debug) console.log(`    ${unit.name} ↔ ${teammate.name}: +25 (mutual)`);
                }
            }
        }
    }

    // Tag synergy (currently only Ju Fufu → rupture)
    for (const unit of team) {
        const synergyTags = unit.synergy?.tags || [];
        if (synergyTags.length === 0) continue;

        for (const teammate of team) {
            if (teammate === unit) continue;
            const match = synergyTags.some(tag => teammate.tags.includes(tag));
            if (match) {
                score += 15;
                if (debug) console.log(`    ${unit.name} tag synergy with ${teammate.name}: +15`);
            }
        }
    }

    if (debug) console.log(`    Layer 5 total: ${score}`);

    return score;
}

// ============================================================================
// TEAMWORK MULTIPLIER
// ============================================================================

const STRUCTURE_FACTOR = new Map([
    [STRUCTURE.CONVENTIONAL_BONUS, 1.0],
    [STRUCTURE.UNCONVENTIONAL_VIABLE, 0.85],
    [STRUCTURE.UNCONVENTIONAL_NO_INTERACTION, 0.6],
    [STRUCTURE.WILDLY_UNCONVENTIONAL, 0.35],
]);

const COHESION_FLOOR = 0.2;

function computeTeamworkMultiplier(team, structureScore, debug, diametricPairs = 0, diametricFloor = 0, boss = null) {
    const structureFactor = STRUCTURE_FACTOR.get(structureScore) ?? 0.35;
    const twReactions = computeAnomalyReactions(team, boss);

    let logSum = 0;
    let totalWeight = 0;

    for (const unit of team) {
        const buffs = unit.mechanics?.buffs || {};
        const debuffs = unit.mechanics?.debuffs || {};
        const utility = unit.mechanics?.utility || {};
        const hasBuffContributions = Object.keys(buffs).length > 0 || Object.keys(debuffs).length > 0
            || (!isDPS(unit) && NEED_FULFILLMENT_KEYS.some(k => w(utility[k]) > 0))
            || isStun(unit);
        if (!hasBuffContributions && isDPS(unit)) {
            const scaling = getEffectiveScaling(unit);
            let needsMet = 0;
            let needsTotal = 0;
            for (const key of NEED_FULFILLMENT_KEYS) {
                if (NATURALLY_AVAILABLE_NEEDS.has(key)) continue;
                const sw = w(scaling[key]);
                if (sw < 1) continue;
                const selfProvision = Math.max(
                    w(unit.mechanics?.buffs?.[key]),
                    w(unit.mechanics?.debuffs?.[key]),
                    w(unit.mechanics?.utility?.[key])
                );
                if (selfProvision > 0) continue;
                needsTotal++;
                if (key === 'disorders') {
                    const unitReaction = twReactions.get(unit);
                    if (unitReaction?.hasDisorder) {
                        needsMet++;
                        continue;
                    }
                }
                for (const supplier of team) {
                    if (supplier === unit) continue;
                    let supplyWeight;
                    if (key === 'disorders') {
                        supplyWeight = w(supplier.mechanics?.utility?.[key]);
                    } else {
                        supplyWeight = Math.max(
                            w(supplier.mechanics?.buffs?.[key]),
                            w(supplier.mechanics?.debuffs?.[key]),
                            w(supplier.mechanics?.utility?.[key])
                        );
                    }
                    if (supplyWeight > 0) { needsMet++; break; }
                }
            }
            if (hasSubDPSRole(unit) && isAnomaly(unit)) {
                const unitReaction = twReactions.get(unit);
                const hasReaction = unitReaction?.bestVortexTier > 0 || unitReaction?.hasDisorder;
                if (!hasReaction) {
                    needsTotal++;
                }
                // Wasted vortex: subdps generates vortex but no native primary anomaly DPS
                // benefits from it (e.g., Velina + Miyabi frost). The wind reaction is wasted
                // because the hypercarry's vortex tier is negligible.
                if (unitReaction?.bestVortexTier > 0) {
                    const primaryNativeAnomaly = team.filter(t =>
                        t !== unit && t.tags.includes('anomaly') && !hasSubDPSRole(t)
                    );
                    const bestPrimaryTier = primaryNativeAnomaly.reduce((best, t) => {
                        return Math.max(best, twReactions.get(t)?.bestVortexTier ?? 0);
                    }, 0);
                    if (bestPrimaryTier < VORTEX_PRIMARY_MIN) {
                        needsTotal++;
                    }
                }
            }
            if (needsTotal > 0 && needsMet < needsTotal) {
                const reception = needsMet / needsTotal;
                const receptionUtil = 0.7 + 0.3 * reception;
                const weight = Math.min(0.5, needsTotal * 0.25);
                logSum += weight * Math.log(Math.max(receptionUtil * receptionUtil, 0.01));
                totalWeight += weight;
            }
            // Armorer crit-rate dependency (dedicated, strong). Armorers scale almost entirely
            // off CR (overcritical, useful to 200%) and DEF; ATK is nearly dead (15%) and CD is
            // fixed. Unlike other DPS — for whom CR is a generic equipment stat — an armorer with
            // NO CR-supplying teammate is badly under-powered. Koleda's P6 narrow CR and
            // Nicole/Cissia satisfy it; a plain stunner like Trigger does not.
            if (isArmorer(unit)) {
                const hasCrSupplier = team.some(s => s !== unit &&
                    resolveConditionalValue(s.mechanics?.buffs?.cr, { team, self: s, consumer: unit }) > 0);
                const crUtil = hasCrSupplier ? 1.0 : ARMORER_CR_MISS_UTIL;
                logSum += ARMORER_CR_WEIGHT * Math.log(Math.max(crUtil * crUtil, 0.01));
                totalWeight += ARMORER_CR_WEIGHT;
            }
            continue;
        }
        if (!hasBuffContributions && !isDPS(unit)) {
            const weight = 1.0;
            logSum += weight * Math.log(0.01);
            totalWeight += weight;
            continue;
        }

        let util = computeBuffUtilization(unit, team);
        const pseudo = unit.mechanics?.pseudoRole;
        if (Array.isArray(pseudo) && pseudo.length > 0 && !isDPS(unit)) {
            const unitBuffs = unit.mechanics?.buffs || {};
            let statBuffWeight = 0, statBuffEffective = 0;
            const teammates = team.filter(t => t !== unit);
            for (const [key, value] of Object.entries(unitBuffs)) {
                if (!STAT_BUFF_KEYS.has(key)) continue;
                const bw = w(value);
                if (bw <= 0) continue;
                statBuffWeight += bw;
                let maxRel = 0;
                for (const c of teammates) maxRel = Math.max(maxRel, getBuffRelevance(key, c));
                statBuffEffective += bw * maxRel;
            }
            const buffAlignment = statBuffWeight > 0 ? statBuffEffective / statBuffWeight : 1;
            if (buffAlignment < 0.5) {
                const activated = unit._activatedRoles || [];
                for (const entry of pseudo) {
                    const name = pseudoRoleName(entry);
                    if (DPS_ROLES.includes(name) && !activated.includes(name)) {
                        util *= 0.65;
                        break;
                    }
                }
            }
        }
        const weight = isDPS(unit) ? 0.5 : 1.0;
        const utilValue = isDPS(unit) ? util : util * util;

        logSum += weight * Math.log(Math.max(utilValue, 0.01));
        totalWeight += weight;
    }

    let cohesion = totalWeight > 0 ? Math.exp(logSum / totalWeight) : 0.5;
    if (diametricFloor > 0) {
        cohesion = Math.max(cohesion, diametricFloor);
    }
    const teamwork = structureFactor * (COHESION_FLOOR + (1 - COHESION_FLOOR) * cohesion);

    if (debug) {
        console.log(`    Teamwork multiplier: ${teamwork.toFixed(3)} (structure=${structureFactor}, cohesion=${cohesion.toFixed(2)}${diametricPairs > 0 ? `, diametric=${diametricPairs}` : ''})`);
    }

    return teamwork;
}

// ============================================================================
// SYNERGY AVOID CHECK
// ============================================================================

function checkSynergyAvoid(team, { lenient = false, debug = false } = {}) {
    for (const unit of team) {
        const avoidList = unit.synergy?.avoid || [];
        for (const teammate of team) {
            if (teammate === unit) continue;
            if (avoidList.includes(teammate.name)) {
                if (debug) console.log(`  AVOID: ${unit.name} explicitly avoids ${teammate.name}`);
                if (!lenient) return -1;
                return -200;
            }
        }
    }
    return 0;
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export function scoreTeamForBoss(team, boss, options = {}) {
    const { lenient = false, debug = false } = options;

    // Lumen units morph their damage to a teammate's element via Attribute Mutation.
    // Try each possible morph combination and return the highest score — the player will
    // naturally order their team for the optimal outcome.
    const lumenUnits = team.filter(isLumenUnit);
    if (lumenUnits.length > 0 && !debug) {
        const morphOptions = lumenUnits.map(u => getPossibleMorphElements(u, team) ?? [null]);
        let bestScore = -Infinity;
        const tryMorphCombinations = (idx) => {
            if (idx === lumenUnits.length) {
                const s = scoreTeamForBoss(team, boss, options);
                if (s > bestScore) bestScore = s;
                return;
            }
            const unit = lumenUnits[idx];
            const targets = morphOptions[idx];
            if (targets.length === 0) {
                tryMorphCombinations(idx + 1);
            } else {
                for (const el of targets) {
                    unit._morphedElement = el;
                    tryMorphCombinations(idx + 1);
                }
                delete unit._morphedElement;
            }
        };
        tryMorphCombinations(0);
        return bestScore === -Infinity ? -1 : bestScore;
    }

    const baseScore = lenient ? 250 : 175;
    let score = baseScore;

    for (const unit of team) {
        unit._activatedRoles = computeActivatedRoles(unit, team);
    }
    // Resolve conditional damage values (e.g. Pyrois's ultimate:strong under wind anomaly) once
    // against the team, after roles are known. Damage is always team-scoped (a unit's own output),
    // so consumer context isn't needed. Damage-reading helpers prefer `_resolvedDamage`.
    for (const unit of team) {
        unit._resolvedDamage = resolveValueMap(unit.mechanics?.damage, { team, self: unit, consumer: null });
    }

    if (debug) {
        const teamLabel = team.map(u => u.name).join(' / ');
        console.log(`\n${'='.repeat(60)}`);
        console.log(`SCORING: ${teamLabel}`);
        console.log(`Boss: ${boss.name}`);
        console.log(`Base score: ${baseScore}`);
        const lumenLabels = lumenUnits.map(u => `${u.name}→${u._morphedElement ?? '(native)'}`);
        if (lumenLabels.length > 0) console.log(`Lumen morph: ${lumenLabels.join(', ')}`);
    }

    const cleanupRoles = () => {
        for (const u of team) {
            delete u._activatedRoles;
            delete u._morphedElement;
            delete u._resolvedDamage;
        }
    };

    // Layer 1: Disqualifications
    const disq = checkDisqualifications(team, boss, debug);
    if (disq < 0) { cleanupRoles(); return disq; }

    // Synergy avoid check (near-disqualification)
    const avoidResult = checkSynergyAvoid(team, { lenient, debug });
    if (avoidResult === -1) { cleanupRoles(); return -1; }
    score += avoidResult;

    // Layer 1.5: Team Structure (feeds into teamwork multiplier, not additive)
    if (debug) console.log('\n  LAYER 1.5: TEAM STRUCTURE');
    let structureScore = scoreTeamStructure(team, debug);
    if (structureScore === STRUCTURE.CONVENTIONAL_BONUS) {
        const supLike = team.filter(u => isEffectiveSupport(u) || isEffectiveDefense(u));
        for (const sup of supLike) {
            const util = computeBuffUtilization(sup, team);
            if (util < 0.5) {
                structureScore = STRUCTURE.UNCONVENTIONAL_VIABLE;
                if (debug) console.log(`    Structure downgraded: ${sup.name} buff util ${Math.round(util * 100)}% below 50%`);
                break;
            }
        }
    }
    if (debug) console.log(`    Structure type: ${structureScore >= 0 ? '+' : ''}${structureScore} (used for teamwork multiplier)`);

    // Field-time economy (stunners have brief rotations that don't compete for DPS field time).
    // Shared-field units (e.g., Remielle's forced on/off cycle) count as 0.5 — they occupy
    // field time but not exclusively.
    const onFieldCount = team.reduce((sum, u) => {
        if (!isOnField(u)) return sum;
        return sum + (isSharedField(u) ? 0.5 : 1);
    }, 0);
    let fieldTimeAdj = 0;
    if (onFieldCount === 0)      fieldTimeAdj = FIELD_TIME.ZERO_ONFIELD_PENALTY;
    else if (onFieldCount === 1) fieldTimeAdj = FIELD_TIME.SOLO_CARRY_BONUS;
    else if (onFieldCount >= 3)  fieldTimeAdj = FIELD_TIME.TRIPLE_ONFIELD_PENALTY;
    score += fieldTimeAdj;
    if (debug) console.log(`    Field time: ${onFieldCount} on-field agent(s) → ${fieldTimeAdj >= 0 ? '+' : ''}${fieldTimeAdj}`);

    // Layer 2: Inherent Quality
    score += scoreInherentQuality(team, { lenient, debug, boss });

    // Layer 3: Boss Matchup
    const bossResult = scoreBossMatchup(team, boss, { lenient, debug });
    if (bossResult.disqualified) { cleanupRoles(); return -1; }
    score += bossResult.score;

    // Layer 4: Mechanical Synergy (with diminishing returns via hyperbolic soft cap)
    const antiRupture = getBossAnti(boss).includes('rupture');
    const rawL4 = scoreMechanicalSynergy(team, debug, { antiRupture, boss });
    const L4_PASSTHROUGH = 100;
    const adjustedL4 = rawL4 > L4_PASSTHROUGH
        ? L4_PASSTHROUGH + (rawL4 - L4_PASSTHROUGH) * L4_SOFT_CAP / (rawL4 - L4_PASSTHROUGH + L4_SOFT_CAP)
        : rawL4;
    score += adjustedL4;
    if (debug && rawL4 !== adjustedL4) console.log(`    L4 soft cap: raw ${rawL4.toFixed(1)} → adjusted ${adjustedL4.toFixed(1)}`);

    // Layer 5: Additional Synergies
    score += scoreAdditionalSynergies(team, debug);

    // Apply teamwork multiplier (replaces additive structure scoring)
    const rawScore = score;
    let maxDiametricPairs = 0;
    let maxDiametricFloor = 0;
    const antiRuptureBoss = getBossAnti(boss).includes('rupture');
    for (const unit of team) {
        const { count, floor } = countDiametricPairs(unit, team, { antiRupture: antiRuptureBoss });
        maxDiametricPairs = Math.max(maxDiametricPairs, count);
        maxDiametricFloor = Math.max(maxDiametricFloor, floor);
    }
    const teamwork = computeTeamworkMultiplier(team, structureScore, debug, maxDiametricPairs, maxDiametricFloor, boss);
    score = Math.round(rawScore * teamwork * 10) / 10;

    if (debug) {
        console.log(`\n  RAW SCORE: ${rawScore.toFixed(1)}`);
        console.log(`  TEAMWORK: ×${teamwork.toFixed(3)}`);
        console.log(`  FINAL SCORE: ${score.toFixed(1)}`);
        console.log(`${'='.repeat(60)}\n`);
    }

    cleanupRoles();
    return score;
}

// ============================================================================
// LEGACY EXPORTS (backwards compatibility)
// ============================================================================

export function getDPSType(unit) {
    if (unit.tags.includes("attack")) return "attack";
    if (unit.tags.includes("anomaly")) return "anomaly";
    if (unit.tags.includes("rupture")) return "rupture";
    return null;
}

export function unitsHaveSynergy(unit1, unit2) {
    const u1 = unit1.synergy?.units?.includes(unit2.name) ||
        unit1.synergy?.tags?.some(tag => unit2.tags.includes(tag));
    const u2 = unit2.synergy?.units?.includes(unit1.name) ||
        unit2.synergy?.tags?.some(tag => unit1.tags.includes(tag));
    return u1 || u2;
}

export function unitsHaveMutualSynergy(unit1, unit2) {
    return unit1.synergy?.units?.includes(unit2.name) &&
        unit2.synergy?.units?.includes(unit1.name);
}

export function calculateSynergyScore() { return 0; }
export function calculateDPSMixingPenalty() { return 0; }
export function isSpecialist() { return false; }
export function getSpecialistType() { return null; }
export function hasStunSynergy() { return false; }
