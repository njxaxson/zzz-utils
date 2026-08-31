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
    // Per greed unit squeezed out of the stun window; see getBurstContention.
    GREED_CONTENTION: -3,
    // Per point by which a unit's `damage.basic` exceeds what its role already implies.
    // Only the excess is paid; see the L2 block that reads it.
    BASIC_DAMAGE_CREDIT: 5,
    DAMAGE_NEED: 3,
    TOTALIZE_QTY: 5,
    STUN_EMERGENCE: 1.0,
    ELEMENT_BUFF: 2,
    ELEMENT_DEBUFF: 2,
    ANOMALY_BUFF: 1.6,
    SHEER_BUFF: 9,
    // Laceration buff -> armorers. The armorer analogue of SHEER_BUFF: a direct
    // amplifier on the class's own damage type. Priced above DEF_BUFF because the
    // buff is rare (only Claret/Koleda/Roxy supply it) and armorers have few other
    // levers, but below SHEER_BUFF because an armorer still has CR, PEN and shred.
    // Primary calibration dial for the armorer rework.
    LACERATION_BUFF: 6,
    PEN_BUFF: 2,
    ATK_BUFF: 0.7,
    CR_BUFF: 0.7,
    CD_BUFF: 0.7,
    DEFENSE_DEBUFF: 1.5,
    RECOVERY_DEBUFF: 2,
    STUN_INFRA: 1,
    // Ultimate provision, multiplied by the consumer's ULTIMATE_MAGNITUDE (0 - 2.0). Was 1.5
    // against getMaxBurstWeight, which saturated at 3 for every carry and so paid a flat rate;
    // the magnitude table is a smaller number, hence the larger multiplier here.
    ULTIMATES_PROVISION: 7.8,
    // Chain provision, multiplied by the consumer's CHAIN_MAGNITUDE (0 - 1.45). Far smaller
    // than ULTIMATES_PROVISION because a chain attack is a fraction of an ultimate, and
    // because chains are unlimited rather than one-per-window.
    CHAINS_PROVISION: 0.4,
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
    // last term in the formula, so it lifts attack/anomaly/vortex/totalize/Laceration/etc.
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

// Maim: only armorers OPEN Gash meters; all meters share one pool of marks (max 3). Stun and
// armorer agents BUILD that pool, but only armorers DETONATE it into a Maim burst (parallel to
// a disorder). More gash builders → the shared pool fills faster → more/bigger maims — which is
// why armorers favour dual-DPS (Stun/Armorer/Armorer, Armorer/Armorer/Support).
const MAIM_BASE = 8;
const MAIM_ENABLER_BONUS = 6;
// Element-scoped anomaly scaling (e.g. Roxy/Pyrois `scaling["anomaly:wind"]`): bonus per
// same-element anomaly source on the team. Linear — oversupply always helps. A wind
// pseudo-anomaly (Roxy) counts herself; a non-anomaly consumer (Pyrois) needs teammates.
const ANOMALY_ELEMENT_MULT = 4;
// Extra anomaly procs, declared as `utility["anomaly:<element>"]`: this unit generates additional
// anomaly procs of that element beyond the buildup its own rotation already implies. Alice's
// polarity assaults are extra *physical* procs; a future unit's would name its own element.
// Element-scoped rather than a generic flag on purpose, so it composes with the head-count it
// augments: a generic `scaling.anomaly` consumer (Harumasa, Remielle) absorbs procs of any
// element, while an element-scoped one (Grace `anomaly:electric`, Roxy/Sigrid `anomaly:wind`)
// absorbs only matching ones. Weighted below 1 because procs are a surplus on top of a body,
// not a second body — a `2` annotation is worth one extra agent's presence, not two.
const ANOMALY_PROC_SUPPLY = 0.5;

// Disorder supply contributed by ONE distinct cycling element, in the same units as a
// `utility.disorders` annotation — so cycling and polarity provision are directly additive
// (see `getDisorderSupply`). Set to 2 because that is the value the old implicit block
// hardcoded for "this team cycles disorders", which keeps a plain two-agent disorder team
// on exactly its previous supply and confines all movement to consumers whose need exceeds
// what one cycling element covers.
const DISORDER_CYCLE_SUPPLY = 2;
// An off-field anomaly agent fills its gauge WHILE the carry is on field, so procs land in
// parallel and disorders arrive roughly twice as fast. Applied per cycling element whenever the
// consumer and the contributor are not both competing for field time — see
// `hasParallelGaugeSource`. This is what makes Vivian a complete disorder engine for Miyabi
// despite generating no polarity disorders at all.
const DISORDER_PARALLEL_MULT = 2;

const BOSS_WEAK = {
    DISORDER_PER_UNIT: 4,
    VEIL_PER_UNIT: 8,
    STUN_BONUS: 15,
    ABLOOM_PER_UNIT: 5,
    FREEZE_BONUS: 15,
    CD_DEBUFF_PER_UNIT: 16,
    DAZE_DEBUFF_PER_UNIT: 10,
    // Armorer quicktime bonus, per control skill the boss uses. A control skill locks the
    // player out of everything but dodge/parry/assist and arrives without the usual telegraph,
    // so timing it is a large part of a good clear. Armorers intercept it and reduce it to a
    // simple quicktime event. Bonus only — a team with no armorer is never penalized for it.
    CONTROL_QUICKTIME: 10,
};

// Second armorer adds much less (one interceptor already covers the fight); third adds nothing.
const ARMORER_CONTROL_FALLOFF = [1, 0.25, 0];

// Boss shill credit: the boss's mechanics reward a specific role or archetype.
const SHILL_MATCH_BONUS = 8;
// A stun shill satisfied by a stunless carry rather than by a stunner. Worth far more than
// the plain match because the requirement is met WITHOUT spending a team slot on a stunner —
// the freed slot takes a second support instead. Sized at roughly what that replacement
// support contributes end-to-end: for YSG/Zhao/Sunna on Thrall, Zhao is worth ~27 after the
// L4 element modifier and soft cap, plus ~21 of L2 tier/rank. Reachable only by a
// stunner-free team holding a stunless unit on a stun-shill boss — today that is
// Ye Shunguong on Thrall and butcher:raging. Primary calibration dial for the stunless
// archetype; raising it makes stunless carries compete with stunner lines.
const STUNLESS_SHILL_CREDIT = 48;

// BURST THROUGHPUT. What a unit actually dumps into a stun window, as a sum over the
// instruments it can fire there - because in a stun window it does not matter HOW the big
// damage lands, only that it does. This replaces an older MAX over a flat list of damage
// keys, which was wrong in a specific way: the annotation scales are NOT commensurate, so a
// MAX picked the biggest ORDINAL rather than the biggest instrument. `chain: 3` and
// `ultimate:strong: 3` both returned 3 despite being roughly four rungs apart, and a unit
// with three instruments scored the same as a unit with one.
//
// The rungs below are relative burst damage, calibrated so an unannotated DPS ultimate is
// ~2.25 and a chain attack is ~0.8. Two equivalences anchor the scale and are load-bearing:
// `enhanced: 3` == `ultimate:strong: 2`, and `chain` (at ANY value) sits down with
// `ultimate:weak`. The whole chain 1/2/3 axis spans less than one rung - which is why chain
// magnitude earns its keep in the PROVISION channel (getChainMagnitude) rather than here.
// See engine-context.md under `damage` for the full relative-damage table.
//
// Unannotated does NOT mean "no burst": `damage` records what is DISTINCTIVE, and Ellen's
// `mechanics` is literally `{}` while she still fires a real ultimate and a chain attack.
// So every instrument has a role-derived baseline. A support's ultimate is a fraction of a
// DPS's, which is why the baselines split on role and not on annotation.
const BURST_ULTIMATE = { weak: 1.05, support: 1.0, stun: 2.11, base: 2.25, 1: 2.8, 2: 3.0, 3: 4.1 };
const BURST_CHAIN = { support: 0.4, stun: 0.74, base: 0.8, 1: 0.9, 2: 1.0, 3: 1.05 };
const BURST_ENHANCED = { 1: 1.6, 2: 2.1, 3: 3.0 };
const BURST_TOTALIZE = { 1: 1.0, 2: 2.0, 3: 3.0 };
// Maim is the armorer's inherent burst (parallel to a disorder), carried by the role rather
// than by an explicit `damage.maim` - no unit annotates one.
const BURST_MAIM = 1.5;

// How much of that throughput converts into real impact. Stands in for the base-ATK gap
// between roles, which is deliberately NOT modelled as a number: role and pseudoRole carry
// it. Read through getEffectiveRoles, so Norma - tagged `stun` but playing subdps - is
// correctly treated as a DPS, and Soukaku's conditional anomaly role follows the team.
const BURST_ROLE_FACTOR = { dps: 1.0, stun: 0.80, support: 0.67 };
// Normalises the sum so an unannotated DPS (Ellen: 2.25 + 0.8) lands at 1.0, keeping the
// output on roughly the 0-3 range the two call sites were calibrated against.
const BURST_NORM = 3.05;

// FREQUENCY keys. `ultimate:double` and `chain:extra` say how MANY times a unit fires an
// instrument in one window, never how hard. Both are read HERE AND NOWHERE ELSE. They must
// never reach the provision or need channels - that leak is what fabricated an ultimate need
// for 26 of 60 units; see scoring-engine-open-issues.md.
//
// `chain:extra` is Evelyn's self-provisioned chains. It is deliberately NOT `utility.chains`:
// provision is scored supplier -> consumer with `supplier !== consumer`, so a `utility` entry
// can never reach its own owner. Annotating her that way would hand Sigrid free chains and
// give Evelyn nothing - the unintended effect and none of the intended one.
//
// `scaling` is a NEED, never a frequency. `scaling.chains: 3` means Evelyn WANTS chains
// badly, not that she fires more of them. Same for `scaling.ultimates`. Do not conflate them.

// ULTIMATE MAGNITUDE. How big this unit's own ultimate is, and therefore what a FREE
// ultimate is worth to them. One of three INDEPENDENT axes in the data (see
// engine-context.md under `damage`), and each axis has exactly one home:
//   frequency  `damage['ultimate:double']`       -> throughput, via getMaxBurstWeight above
//   magnitude  `damage['ultimate:strong'|'weak']` -> the PROVISION channel, via this table
//   scaling    `mechanics.scaling.ultimates`     -> the NEED channel, annotated values only
// Do not collapse them. Magnitude and frequency used to be manufactured into the need
// channel, which fabricated an ultimate need for every primary DPS and paid twice for the
// same free ultimate; see scoring-engine-open-issues.md.
//
// Values track the in-game modifier tiers: 3 is 6000%+ (Seed, YSG), 2 is 4500%+ (Miyabi),
// 1 is 4200%+ (Evelyn, Yixuan), and an unannotated ultimate is ~3000-3600%. The 1.0 -> 1.1
// step at the bottom is what makes Evelyn worth slightly more than Ellen from a free
// ultimate; collapsing those two rungs would make `ultimate:strong: 1` meaningless.
const ULTIMATE_MAGNITUDE = { 0: 1.0, 1: 1.1, 2: 1.25, 3: 2.0 };

// CHAIN MAGNITUDE. How big this unit's own chain attack is, and therefore what a FREE chain
// is worth to them. The chain analogue of ULTIMATE_MAGNITUDE, and it exists for the same
// reason: magnitude predicts provision value, so it lives in the provision channel and
// nothing else. The steps are deliberately shallow - the underlying chain modifiers span far
// less ground than the ultimate ones, which is exactly why chain magnitude contributes almost
// nothing to burst throughput but still separates provision targets.
//   0 (unannotated) - a standard DPS chain attack
//   1 / 2 / 3       - progressively harder-hitting, Evelyn at the top
// A non-DPS returns 0 from getChainMagnitude before this table is consulted.
const CHAIN_MAGNITUDE = { 0: 1.0, 1: 1.15, 2: 1.3, 3: 1.45 };
const NEED_FULFILLMENT_KEYS = [
    'disorders', 'ablooms', 'chains', 'ultimates', 'veils',
    'quick-assists', 'interrupt-resistance', 'vortex'
];
// Per-key override of MULT.NEED_FULFILLMENT. Ultimates are paid through TWO channels -
// provision (ULTIMATE_MAGNITUDE, for any carry who can use a free ultimate) and need
// (`scaling.ultimates`, for the few who get something beyond its damage). Charging the need
// side at the shared rate would let it dominate the provision side, so it carries its own,
// lower weight. Every other key falls through to MULT.NEED_FULFILLMENT unchanged.
const NEED_KEY_MULT = { ultimates: 3.2 };

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
// Floor for codependencyFactor: what a codependent unit is still worth with its composition
// need entirely unmet. Not zero — Remielle off triple-anomaly keeps her double ultimate.
const CODEPENDENCY_FLOOR = 0.25;
const L4_SOFT_CAP = 250;
const POLARITY_VORTEX_DISCOUNT = 0.35;
// Needs exempt from L5 cohesion penalties. INTENTIONAL, and NOT an L4/L5 inconsistency -
// this has been misread as an oversight before. L4 pays for ultimate provision (two channels:
// ULTIMATES_PROVISION for throughput, need(ultimates) for units that ultimates actually FUEL),
// while L5 declines to penalise its absence. Both halves are deliberate: ultimates and chains
// arrive naturally anyway, AND the ability to provision them is vanishingly rare (essentially
// Dialyn and Ju Fufu), so charging a YSG or Yixuan team for lacking a provisioner would punish
// it for something almost no teammate could supply. Reward the upside, do not bill the absence.
// See engine-context.md, "The ultimates two-channel model", before changing this.
const NATURALLY_AVAILABLE_NEEDS = new Set(['ultimates', 'chains']);
// What one quick assist is worth to a unit that does nothing special with it — which is
// almost everyone. Every unit in the game benefits from a quick assist; most just take the
// standard small bonus, and a few (Anton) declare a real `scaling.quick-assists` need and
// earn more. This is a statement about SIZE, not about landing: a quick assist never misses.
// Read in two places that must agree — the implicit consumer need in getEffectiveScaling,
// and the cohesion weight in computeBuffUtilization.
const QUICK_ASSIST_VALUE = 0.25;
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

// Natively lumen. Reads `tags`, so it stays TRUE inside a morph pass. Every rule about what lumen
// *is* — fills no anomaly gauge (so no disorder, no vortex, no element diversity, no anomaly
// quantity), supplies Lumiflux for Refringe — must use this. getElement() reports the MORPH TARGET
// during morph scoring, so an element-based test silently inverts on the real scoring path; that
// was issue 6, and it disabled the reaction guards and the Refringe bonus alike.
function isNativeLumen(unit) {
    return unit.tags.includes('lumen');
}

// Lumen with no morph target assigned yet. ONLY the morph search may use this: its recursion
// terminates precisely because this goes false once `_morphedElement` is set (including to null).
function isUnmorphedLumen(unit) {
    return isNativeLumen(unit) && unit._morphedElement === undefined;
}

// Returns the list of teammate elements that a lumen unit could morph to via Attribute Mutation.
// Lumen agents deal damage as the next agent's element in team order — effectively any teammate
// element. The caller should score with each option and take the best result.
function getPossibleMorphElements(unit, team) {
    if (!isUnmorphedLumen(unit)) return null;
    return [...new Set(
        team
            .filter(u => u.id !== unit.id && !isNativeLumen(u))
            .map(u => getElement(u))
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
export function getBossControl(boss) { return boss.mechanics?.control ?? 0; }

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
// How much of a CODEPENDENT unit's kit this team actually switches on.
//
// `scaling.codependent` says a unit's worth depends on the team meeting its composition needs.
// The pull engine has always honoured that — it is why Remielle drops off a roster with no
// anomaly agents — but the scorer only ever charged the shortfall on the ONE conditional buff,
// through computeConditionalBuffPenalty, and went on paying her as a full anomaly body for
// everything else.
//
// Remielle needs THREE anomaly-tagged bodies. On Nangong/Miyabi/Remielle there are two —
// Nangong reaches anomaly through a pseudo-role, which her `countTag: "anomaly"` condition
// rightly does not count — so her ATK buff resolves to 2 of 4 and her kit does not come
// together. She was scoring 539 there against 201 for the same team with Lucy in the slot.
// The owner: "Rem's value CRASHES when she isn't on triple-anomaly."
//
// Fulfilment is read off the unit's own team-scoped conditionals, so it needs no new
// annotation and no per-unit special case: the condition the designer already wrote down IS
// the composition need. A codependent unit with no conditional buff (Ye Shunguong, who buffs
// nothing) reads 1 and is untouched.
//
// Returns 0-1. Scaling, not gating — she is a fraction of the unit she should be, not absent.
function codependencyFulfilment(unit, team) {
    if (!unit.mechanics?.scaling?.codependent) return 1;
    const buffs = unit.mechanics?.buffs;
    if (!buffs) return 1;
    let worst = 1;
    for (const spec of Object.values(buffs)) {
        if (!isTeamScopedConditional(spec)) continue;
        const maxLevel = maxConditionalValue(spec);
        if (maxLevel <= 0) continue;
        const resolved = resolveConditionalValue(spec, { team, self: unit, consumer: null });
        worst = Math.min(worst, resolved / maxLevel);
    }
    return worst;
}

/**
 * What a codependent unit's contributions are worth on this team.
 *
 * Blended toward a floor rather than run to zero: Remielle off triple-anomaly still brings a
 * double ultimate, aftershock and luminize, and the owner's own read is that she should land
 * meaningfully above the same team built with Lucy. The floor is what keeps her there.
 */
function codependencyFactor(unit, team) {
    const f = codependencyFulfilment(unit, team);
    if (f >= 1) return 1;
    return CODEPENDENCY_FLOOR + (1 - CODEPENDENCY_FLOOR) * f;
}

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

export function getElementVariant(unit) {
    const base = getElement(unit);
    return unit.mechanics?.elementalVariant 
        ? base + ':' + unit.mechanics?.elementalVariant 
        : base;
}

function teamHasImplicitDisorders(team) {
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    if (anomalyAgents.length < 2) return false;
    // Lumen doesn't open its own anomaly gauge, so it doesn't contribute to elemental
    // diversity for disorder purposes. Only count non-lumen anomaly elements. Filtered on the
    // UNIT rather than the resolved variant string: a variant would read "lumen:x" and slip past
    // an element comparison, and during morph scoring the string is the morph target anyway.
    const elements = anomalyAgents.filter(u => !isNativeLumen(u)).map(u => getElementVariant(u));
    return new Set(elements).size >= 2;
}

// --- Boss Anomaly State helpers ---

function getBossAnomalyState(boss) {
    return boss?.mechanics?.['anomaly:state'] || null;
}

function isVortexBoss(boss) {
    const state = getBossAnomalyState(boss);
    return state === 'wind';
}

function getVortexTierForVariant(variant) {
    return VORTEX_TIERS[variant] ?? VORTEX_DEFAULT_TIER;
}

function getVortexTierForElement(unit, bossAnomaly) {
    const base = getElement(unit);
    if (base === 'wind' && bossAnomaly && bossAnomaly !== 'wind') {
        return getVortexTierForVariant(bossAnomaly);
    }
    //otherwise:
    return getVortexTierForVariant(getElementVariant(unit));
}

// The gauge a unit fills with its own rotation, or null if it fills none. Returned as an
// element-VARIANT string, because a variant tracks a separate gauge and therefore reacts with
// its own base element (Miyabi's frost disorders with plain ice — see Soukaku's displayText).
//
// SINGLE SOURCE OF TRUTH: the element a unit contributes to the team pool and the element it
// is excluded from reacting with must be the same string, or the unit disorders with itself.
// Deriving both from one function makes that desync unrepresentable.
function getOwnGaugeElement(unit) {
    if (isNativeLumen(unit)) return null;
    return getEffectiveRoles(unit).includes('anomaly') ? getElementVariant(unit) : null;
}

// Which elements does this unit put on the enemy's anomaly gauges?
//
// Its own gauge element, when it fills one, PLUS any `utility["anomaly:<element>"]` element
// REGARDLESS of role — because a proc is a proc: that annotation says an extra anomaly of that
// element lands on the target, and it reacts whether or not its owner is an anomaly agent. The
// anomaly-QUANTITY channel already reads the key role-blind; this brings the reaction path into
// line. Latent today — Alice is the only holder, and her `anomaly:physical` is an element she
// already supplies as an agent — but it is the shape a wind enabler needs if it ever loses its
// `anomaly` pseudo-role while keeping the procs.
//
// Lumen contributes nothing at all: Attribute Mutation morphs damage but fills no gauge.
function getProcElements(unit) {
    const els = new Set();
    if (isNativeLumen(unit)) return els;
    const own = getOwnGaugeElement(unit);
    if (own) els.add(own);
    for (const [key, val] of Object.entries(unit.mechanics?.utility || {})) {
        if (key.startsWith('anomaly:') && w(val) > 0) els.add(key.slice('anomaly:'.length));
    }
    return els;
}

function computeAnomalyReactions(team, boss) {
    const bossAnomaly = getBossAnomalyState(boss);
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    const reactions = new Map();

    // Every element the team lands on the target, pooled once. Reactions are then read off
    // this set rather than off a partner-by-partner scan, so "how many distinct elements
    // disorder with me" becomes answerable — that count is the disorder SUPPLY, and a bare
    // hasDisorder boolean could not express it.
    const teamElements = new Set();
    for (const u of team) for (const el of getProcElements(u)) teamElements.add(el);

    for (const unit of anomalyAgents) {
        const baseElement = getElement(unit);
        let bestVortexTier = 0;
        const disorderElements = new Set();

        // Lumen agents don't build anomaly gauges via Attribute Mutation — their damage
        // morphs to a teammate's element but does not fill the corresponding anomaly gauge.
        // Therefore lumen units produce no anomaly reactions (no disorder, no vortex).
        if (isNativeLumen(unit)) {
            reactions.set(unit, { bestVortexTier: 0, hasDisorder: false, disorderElements });
            continue;
        }

        if (bossAnomaly) {
            // Boss anomaly states are named by BASE element, so this comparison stays base.
            if (baseElement !== bossAnomaly && bossAnomaly !== 'lumen') {
                if (bossAnomaly === 'wind' || baseElement === 'wind') {
                    bestVortexTier = getVortexTierForElement(unit, bossAnomaly);
                } else {
                    disorderElements.add(bossAnomaly);
                }
            }
        } else {
            const element = getOwnGaugeElement(unit);
            for (const partnerEl of teamElements) {
                // A unit cannot react with the gauge it fills itself.
                if (partnerEl === element) continue;
                const partnerBase = partnerEl.split(':')[0];
                // Same-element pairs do nothing, and that includes wind + wind.
                if (baseElement === 'wind' && partnerBase === 'wind') continue;

                if (baseElement === 'wind' || partnerBase === 'wind') {
                    const nonWindEl = (baseElement === 'wind') ? partnerEl : element;
                    bestVortexTier = Math.max(bestVortexTier, getVortexTierForVariant(nonWindEl));
                } else {
                    disorderElements.add(partnerEl);
                }
            }
        }

        reactions.set(unit, {
            bestVortexTier,
            hasDisorder: disorderElements.size > 0,
            disorderElements
        });
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

// How much disorder does the team actually put in front of `unit`?
//
// `scaling.disorders` declares a NEED, so it can only be priced against a measured supply.
// This used to be a hardcoded 2 gated on a boolean, which meant supply never varied with
// the composition (one cycling partner paid the same as three) and Miyabi's need of 3 was
// permanently stuck at 67% coverage — unreachable by ANY team. See issue 5.
//
// Two independent sources, ADDED, never netted off against each other:
//
//   * element cycling — one rung per distinct element that disorders with this unit,
//     counted off `disorderElements` so it agrees with the reaction detector by
//     construction rather than by a parallel re-derivation.
//   * solo polarity generation — a teammate's `utility.disorders` forces disorders on its
//     own, with no second anomaly agent required (Nangong, Yanagi).
//
// A prototype that SUBTRACTED teammate provision from the cycling supply passed all three
// suites and was still wrong: it deleted the cycling credit exactly when a polarity unit
// was present, which is backwards. Nangong + Miyabi genuinely produces ether/frost cycling
// disorders AND Nangong's polarity disorders on top.
//
// Self is excluded, matching the `supplier !== consumer` convention used everywhere else;
// a unit that provides its own need is handled by the L5 self-provision shortcut.
// Does anyone supply `element` whose gauge fills ALONGSIDE `unit`'s own rotation, rather than
// competing with it for field time? Vivian builds ether while Miyabi is applying frost, so their
// procs land simultaneously and disorders arrive roughly twice as fast; Yanagi has to share the
// field with her, so hers arrive one after the other.
//
// This is a question about RATE, not about whether a disorder happens at all — that is already
// settled by `disorderElements`. Two on-field agents disorder perfectly well, just serially, so a
// false result here means "no speed-up", never "no disorder".
//
// Existential over the whole team, not a property of a pair: one parallel source is enough to
// speed the element up, even when another teammate also supplies it on-field.
//
// Two off-field suppliers are parallel with each other too, which is correct. The resulting
// composition (nobody actually on field) is penalised through field-time economy and structure,
// which is where that belongs rather than here.
function hasParallelGaugeSource(unit, element, team) {
    for (const u of team) {
        if (u === unit) continue;
        if (!getProcElements(u).has(element)) continue;
        if (!(isOnField(unit) && isOnField(u))) return true;
    }
    return false;
}

function getDisorderSupply(unit, team, reactions) {
    let elements = reactions.get(unit)?.disorderElements;
    if (!reactions.has(unit)) {
        // A consumer that is not itself an anomaly agent has no reaction of its own, but
        // disorders land on the TARGET, not on whoever caused them — so it still benefits from
        // teammates cycling without it. Read the richest stream on the team. This is the case
        // the old code missed entirely (issue 5): it only ever asked whether the consumer's own
        // reaction fired. Unreachable on the current roster, where both `scaling.disorders`
        // units are anomaly agents, which is exactly why it went unnoticed.
        for (const [, r] of reactions) {
            if ((r.disorderElements?.size ?? 0) > (elements?.size ?? 0)) elements = r.disorderElements;
        }
    }
    let supply = 0;
    for (const element of (elements ?? [])) {
        // Per element, the BEST contributor wins: one parallel source is enough to make that
        // element's cycling parallel, even if another teammate supplies it on-field too.
        supply += hasParallelGaugeSource(unit, element, team)
            ? DISORDER_CYCLE_SUPPLY * DISORDER_PARALLEL_MULT
            : DISORDER_CYCLE_SUPPLY;
    }
    for (const u of team) {
        if (u === unit) continue;
        supply += w(u.mechanics?.utility?.disorders);
    }
    return supply;
}

// Disorder supply a CONSUMER can actually convert, given how much it needs.
//
// Full credit up to the need, then strictly diminishing but never zero. A Deadly Assault fight
// is capped at 180 seconds: supply a thousand disorders and you run out of time before you can
// turn them into enhanced attacks, so surplus becomes statistically insignificant — yet never
// exactly worthless, since extreme play can always squeeze out a little more. Hence
// logarithmic and unbounded rather than a hard cap.
//
// The log's scale is tied to the need, so the shape is the same for a 2-scaler and a 3-scaler,
// and its derivative is exactly 1 at the need — the curve joins the linear part smoothly, with
// no cliff of the kind the old `UNDERSUPPLY_FACTOR` step produced.
//
//   need=3:  E(3)=3.000  E(4)=3.766  E(5)=4.271  E(6)=4.648  E(8)=5.200  E(1000)=12.75
//
// This is DELIBERATELY a different shape from `effectiveDisorderWeakSupply` below. Oversupply
// keeps helping a consumer; the boss-weakness bonus genuinely hard-caps. Do not unify them.
const DISORDER_SURPLUS_SCALE = 0.5;

export function effectiveDisorderSupply(supply, need) {
    if (need <= 0) return 0;
    if (supply <= need) return supply;
    const k = DISORDER_SURPLUS_SCALE * need;
    return need + k * Math.log(1 + (supply - need) / k);
}

// Disorder supply that counts toward a boss's `weak: disorders` bonus. Unlike the consumer
// side this really does hard-cap: the game stops paying past 5 sources, so a sixth earns
// nothing at all. Full credit to the reference weight, then a marginal rate falling linearly
// to zero at the cap.
//
//   E(3)=3.00  E(4)=3.75  E(5)=4.00  E(6)=4.00  E(7)=4.00      max = R + (CAP-R)/2 = 4
const DISORDER_WEAK_REF = 3;
const DISORDER_WEAK_CAP = 5;

export function effectiveDisorderWeakSupply(supply) {
    const s = Math.min(supply, DISORDER_WEAK_CAP);
    const width = DISORDER_WEAK_CAP - DISORDER_WEAK_REF;
    if (s <= DISORDER_WEAK_REF || width <= 0) return s;
    const d = s - DISORDER_WEAK_REF;
    return DISORDER_WEAK_REF + d - (d * d) / (2 * width);
}

// Team-wide disorder output, for the boss-weakness channel. Consumer-relative supply is the
// wrong question there — the boss does not care who converts them — so take the richest single
// stream and add the team's total forced-polarity provision on top.
function getTeamDisorderSupply(team, reactions) {
    let bestCycling = 0;
    for (const unit of team) {
        const elements = reactions.get(unit)?.disorderElements;
        if (!elements) continue;
        let cycling = 0;
        for (const element of elements) {
            cycling += hasParallelGaugeSource(unit, element, team)
                ? DISORDER_CYCLE_SUPPLY * DISORDER_PARALLEL_MULT
                : DISORDER_CYCLE_SUPPLY;
        }
        bestCycling = Math.max(bestCycling, cycling);
    }
    let polarity = 0;
    for (const u of team) polarity += w(u.mechanics?.utility?.disorders);
    return bestCycling + polarity;
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
        // NO IMPLICIT `ultimates` HERE, DELIBERATELY. A unit must never be given a need it
        // did not declare. `scaling.ultimates` is authored data and nothing else: it flows
        // through the `explicit` merge below untouched, so only the units that annotate one
        // ever enter the need channel. Everyone else gets ultimate value through the
        // PROVISION channel instead, priced by ULTIMATE_MAGNITUDE.
        //
        // This block used to manufacture a floor of 1 for every primary DPS plus bumps from
        // magnitude and frequency, which the annotated value then OVERWROTE. That fabricated
        // a need for units like Evelyn and Seed (neither annotates one), paid twice for the
        // same free ultimate, and exposed the fabricated need to the undersupply gate. See
        // scoring-engine-open-issues.md.
        baseline['quick-assists'] = QUICK_ASSIST_VALUE;
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
            // How much a raw ATK buff is worth to this consumer, scaled by how much damage it
            // actually deals. `basic` runs 0-3 with a full DPS at 3, so a DPS reads 1 and is
            // unchanged; a stunner reads 0.67, a defence agent 0.33, and a plain support 0.
            // Sunna, who overrides her support baseline to 1, reads 0.33 — she attacks, so ATK
            // on her is worth something, where on Astra it is worth nothing at all.
            return getBasicDamage(consumer) / 3;
        case 'anomaly-affinity': {
            const am = scaling?.am;
            const ap = scaling?.ap;
            if (am || ap) return Math.max(w(am || 0), w(ap || 0));
            return roles.includes('anomaly') ? 2 : 0;
        }
        case 'sheer':
            if (scaling?.sheer) return w(scaling.sheer);
            return roles.includes('rupture') ? 3 : 0;
        case 'laceration':
            if (scaling?.laceration) return w(scaling.laceration);
            return roles.includes('armorer') ? 3 : 0;
        case 'pen':
            if (scaling?.pen) return w(scaling.pen);
            // Armorer premium: Laceration lands against normal enemy defense (unlike
            // rupture's Sheer), and with ATK and CD dead, PEN is one of the few levers
            // an armorer has left — so it is worth more to them than to an attacker.
            if (roles.includes('armorer')) return 2;
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
            // Armorer premium, same reasoning as 'pen'. Defense shred is doubly valuable
            // to them because it stacks across suppliers (Trigger + Nicole ~= 60% shred)
            // and raises their damage without the armorer receiving a buff at all.
            if (roles.includes('armorer')) return 2;
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

// A subdps deals DPS-tier damage even when their tag says otherwise - Norma is tagged `stun`
// but hits like a carry, which is exactly what her pseudoRole records. `DPS_ROLES` (and so
// isDPSByRoles) deliberately excludes `subdps` because ultimate provision IS limited to one
// primary carry; burst throughput is not. Local to the burst model on purpose - widening
// DPS_ROLES itself would move every channel in the engine.
function isBurstDPS(roles) {
    return isDPSByRoles(roles) || roles.includes('subdps');
}

function getBurstRoleFactor(roles) {
    if (isBurstDPS(roles)) return BURST_ROLE_FACTOR.dps;
    if (roles.includes('stun')) return BURST_ROLE_FACTOR.stun;
    return BURST_ROLE_FACTOR.support;
}

/**
 * Total burst a unit dumps into one stun window, summed across every instrument it fires,
 * then scaled by how much its role converts that into impact. See the BURST_* tables above.
 *
 * NON-DPS UNITS RETURN 0 UNLESS THEY ANNOTATE AN INSTRUMENT. A support technically fires an
 * ultimate and a chain attack in a window, but crediting every Astra and Lycaon for it would
 * pay a small unearned bonus on essentially every team. The annotation IS the statement that
 * this unit's burst is worth noticing - Rina's `ultimate:strong: 2` is exactly that, and it
 * is what puts her below Ellen (support role factor) but well above Astra (zero). This is
 * the same "never give a unit something it did not declare" rule that governs the need
 * channel; see scoring-engine-open-issues.md.
 */
// BASIC DAMAGE. A plain baseline of how much damage a unit puts out, independent of any
// special mechanism. It answers one question the rest of the `damage` map cannot: how do we
// know Sunna deals more damage than most supports — more than Astra, who deals none?
//
// Every other key in `damage` names a MECHANISM (`aftershock`, `abloom`, `enhanced`,
// `ultimate:strong`) and is read either for stun-window throughput or to create a need for a
// matching teammate buff. `basic` is the odd one out on purpose: it is magnitude, not
// mechanism, and it is deliberately NOT part of burst throughput — Sunna's damage accrues
// while someone else is on field, so feeding it into getMaxBurstWeight would make her contend
// for a stun window she never uses.
//
// The value is INHERITED from role and can be overridden per unit in units.json:
//
//   3   any DPS role (attack / anomaly / rupture / armorer), or subdps
//   2   stun
//   1   defense
//   0   support
//
// Resolved against EFFECTIVE roles, so it is a property of the unit ON THIS TEAM, not of the
// unit in isolation. That is the whole point for the conditional pseudo-roles: Nangong reads 3
// beside an anomaly agent and 2 on a pure stun team, and Soukaku swings from 0 to 3 when
// Miyabi is present — which is correct, because Soukaku alongside Miyabi is tuned and played
// as a DPS. Baking static numbers into units.json would have got both of those wrong.
//
// Max across roles, so Caesar (defense tagged, pseudo-stun) reads 2 rather than 1.
const BASIC_DAMAGE_BY_ROLE = { attack: 3, anomaly: 3, rupture: 3, armorer: 3, subdps: 3, stun: 2, defense: 1, support: 0 };

/**
 * This unit's baseline damage output on this team: 0-3, inherited from role unless the unit
 * declares `mechanics.damage.basic`. See BASIC_DAMAGE_BY_ROLE.
 */
export function getBasicDamage(unit) {
    const declared = (unit._resolvedDamage || unit.mechanics?.damage || {}).basic;
    if (declared !== undefined) return w(declared);
    return getBasicDamageBaseline(unit);
}

/** What this unit's roles alone imply, ignoring any override. */
export function getBasicDamageBaseline(unit) {
    let best = 0;
    for (const role of getEffectiveRoles(unit)) {
        best = Math.max(best, BASIC_DAMAGE_BY_ROLE[role] ?? 0);
    }
    if (hasSubDPSRole(unit)) best = Math.max(best, BASIC_DAMAGE_BY_ROLE.subdps);
    return best;
}

// BURST WINDOW CONTENTION.
//
// Some carries need the stun window to THEMSELVES to reach their ceiling. Remielle cannot fire
// her double ultimate while Miyabi is running enhanced -> ultimate -> enhanced; that is the same
// reason dual-attacker and dual-rupture teams do not exist, and why Yixuan wants the whole window.
//
// `scaling.greedy` measures how much of the window a unit needs, and it is about EXECUTION
// DIFFICULTY rather than damage. Miyabi's enhanced attacks take about twice as long as Promeia's
// and additionally need disorder fuel timed into the window to land a second one; Aria's are very
// quick. So the greedy list is not the biggest-burst list — measuring this by burst size would
// penalise Aria and Promeia, who are two of Remielle's BEST partners.
//
//   3   needs the window to itself: Yixuan, Remielle, Miyabi, Evelyn
//   1   a real enhanced-attack rotation, but quick and easy: Aria, Promeia, Alice, Sigrid, Harumasa
//   0   everyone else
//
// ONLY GREED ABOVE 1 CONTENDS. That single rule is what separates the cases: Remielle/Velina/Aria
// and Remielle/Velina/Promeia are among Remielle's best teams and must not be touched, while
// Miyabi/Vivian/Remielle is the team to demote.
const GREED_CONTENTION_FLOOR = 1;

/** How much of the stun window this unit needs to itself, 0-3. */
function getGreed(unit) {
    return w(unit.mechanics?.scaling?.greedy);
}

/**
 * How much burst window this team is short of, in greed units.
 *
 * Zero unless at least TWO units need the window above the floor. The greediest keeps the window;
 * everyone else is contending for what is left, and their greed is what is squeezed out. So a
 * greedy-3 beside a greedy-3 costs 3, and a greedy-2 beside a greedy-3 costs 2.
 *
 * NOTE: every contender on the current roster is annotated 3, so the value-scaling is not
 * exercised by anything today and no test can cover it. It is written this way because the owner
 * chose scaling over a flat charge, and it becomes live the moment a greedy-2 unit exists.
 */
function getBurstContention(team) {
    const greeds = team.map(getGreed).filter(g => g > GREED_CONTENTION_FLOOR);
    if (greeds.length < 2) return 0;
    return greeds.reduce((sum, g) => sum + g, 0) - Math.max(...greeds);
}

/**
 * Can this team's greedy carry actually cash in a longer stun window?
 *
 * Two gates, and both are about whether the window is real rather than about the carry.
 *
 * 1. NO CONTENTION. If two greedy carries are fighting over the window, neither of them is
 *    getting enough of it to exploit an extension — that is the same claim getBurstContention
 *    makes. Paying both the extension bonus while charging contention once was worth a net +27
 *    to Nangong/Miyabi/Remielle and put Remielle in four of Miyabi's top five teams.
 *
 * 2. SOMEBODY HAS TO OPEN THE WINDOW. A recovery debuff on a team with no stunner is close to
 *    comical: Miyabi/Vivian/Remielle has Remielle's recovery debuff and nobody to stun with it,
 *    so it lands maybe once in a fight. The team still earns the BASE recovery credit for that
 *    — this gate only withholds the greedy EXTRA, which is about repeatedly getting a longer
 *    window, and a stunner opens three to five in a fight where an incidental debuff opens one.
 */
function canExploitLongWindow(consumer, team) {
    if (getBurstContention(team) > 0) return false;
    return team.some(u => u !== consumer && getEffectiveRoles(u).includes('stun'));
}

export function getMaxBurstWeight(unit) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    const roles = getEffectiveRoles(unit);
    const dps = isBurstDPS(roles);
    // A stunner sits between a DPS and a support: their ultimates run slightly under a DPS's
    // and their base ATK lower, for ~75% of an undistinguished DPS like Ellen overall. Norma
    // and Nangong are the exceptions and are correctly excluded here - they reach isBurstDPS
    // through their subdps / pseudo-anomaly roles.
    const tier = dps ? 'base' : (roles.includes('stun') ? 'stun' : 'support');

    const strong = w(damage['ultimate:strong']);
    const weak = w(damage['ultimate:weak']);
    const enhanced = w(damage.enhanced);
    const totalize = w(damage.totalize);
    const chainMag = w(damage.chain);
    const armorer = roles.includes('armorer');

    // A non-DPS with nothing declared contributes no burst worth pricing.
    if (!dps && !strong && !weak && !enhanced && !totalize && !chainMag && !w(damage.maim)) return 0;

    // Ultimate: magnitude first, then frequency. `ultimate:strong` overrides `ultimate:weak`,
    // which is how Pyrois's wind condition lifts his weak-ultimate rung via _resolvedDamage.
    let ultimate;
    if (strong > 0) ultimate = BURST_ULTIMATE[Math.min(3, strong)];
    else if (weak > 0) ultimate = BURST_ULTIMATE.weak;
    else ultimate = BURST_ULTIMATE[tier];
    if (w(damage['ultimate:double']) > 0) ultimate *= 2;

    // Chain attacks exist ONLY inside a stun window, so a stunless carry never gets the
    // opening chain - YSG does not open a window, she only inherits the damage multiplier.
    let chain = 0;
    if (!isStunlessUnit(unit)) {
        const per = chainMag > 0
            ? BURST_CHAIN[Math.min(3, chainMag)]
            : BURST_CHAIN[tier];
        // Teammate chain provision (Astra, Norma) stays OUT of this - it is already priced in
        // the provision channel, and counting it here would pay for it twice.
        chain = per * (1 + w(damage['chain:extra']));
    }

    let sum = ultimate + chain;
    if (enhanced > 0) sum += BURST_ENHANCED[Math.min(3, enhanced)];
    if (totalize > 0) sum += BURST_TOTALIZE[Math.min(3, totalize)];
    if (armorer || w(damage.maim) > 0) sum += BURST_MAIM;

    return (sum * getBurstRoleFactor(roles)) / BURST_NORM;
}

/**
 * Value of a free CHAIN ATTACK to this unit, from chain MAGNITUDE alone. The exact analogue
 * of getUltimateMagnitude: Astra gifting a chain to Ellen is nice, to Starlight Billy nicer,
 * to Evelyn nicest, and to a support a waste.
 *
 * Returns 0 for a non-DPS. That zeroing is the counterpart of getUltimateMagnitude returning
 * 0 for `ultimate:weak` - it stops a chain provisioner earning credit for gifting a chain to
 * someone who cannot punish with it.
 */
export function getChainMagnitude(unit) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    const annotated = w(damage.chain);
    // An ANNOTATION OVERRIDES THE ROLE DEFAULT, exactly as it does for ultimate magnitude:
    // Rina is a support whose  makes her a real recipient of a free
    // ultimate, and a future support with a meaningful chain attack must not be zeroed here
    // either. Only an UNANNOTATED non-DPS is the waste case - gifting Sunna a chain.
    if (annotated === 0 && !isBurstDPS(getEffectiveRoles(unit))) return 0;
    return CHAIN_MAGNITUDE[Math.min(3, annotated)] ?? 1.0;
}

/**
 * Value of a free ultimate to this unit, from ultimate MAGNITUDE alone. Feeds the provision
 * channel; the need channel reads `scaling.ultimates` and nothing else.
 *
 * Returns 0 when the unit's ultimate is not a real burst (`ultimate:weak` with no
 * `ultimate:strong`) - Sigrid, whose burst lives in her enhanced attacks, and Pyrois without
 * a wind-anomaly teammate. LOAD-BEARING: this zeroing is what excludes Sigrid from ultimate
 * provision entirely, and what implements the intentional design that Pyrois under-benefits
 * from Dialyn (two weak ultimates sum to one normal one, but Dialyn supplies a single
 * ultimate). A possibly-conditional `ultimate:strong` overrides `ultimate:weak`, which is
 * exactly how Pyrois's wind condition lifts the penalty.
 */
function getUltimateMagnitude(unit) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    const strong = w(damage['ultimate:strong']);
    if (strong === 0 && w(damage['ultimate:weak']) > 0) return 0;
    return ULTIMATE_MAGNITUDE[Math.min(3, strong)] ?? 1.0;
}

const BUFF_UTIL_FLOOR = 0;
// Cohesion multiplier applied (per key) when a support's directional stat buff whiffs —
// i.e. NO consumer can use it. `sheer` whiffs with no rupture consumer; `cd` whiffs when
// every DPS is an armorer (fixed crit damage) or otherwise crit-damage-agnostic. Until the
// armorer class, CD always landed, so the engine never treated it as missable.
const WHIFF_COHESION_PENALTY = 0.8;
const WHIFF_PENALTY_BUFFS = ['sheer', 'cd'];
// Cohesion multiplier when a DEFINING (weight-3) need-fulfillment provision lands on nobody.
// Softer than WHIFF_COHESION_PENALTY: Dialyn handing free ultimates to a weak-ultimate carry
// has wasted her headline perk, but she is still a fully functional stunner underneath.
const PROVISION_WHIFF_PENALTY = 0.963;
// Armorer damage-lever dependency. Armorers have two crit checks (0-100% for 150% Laceration,
// 100-200% for 300%) but fixed crit damage and zero ATK scaling, so their whole lever set is
// CR, Laceration, PEN and defense shred. A team that supplies none of them leaves the armorer
// with no way to reach its damage ceiling, and takes this cohesion hit (weighted like a hard
// need). CR and Laceration are primary (they drive the crit checks directly); PEN and shred
// are secondary but real, and shred STACKS across suppliers — Trigger + Nicole together shred
// ~60%, which is a full-strength lever without the armorer receiving a buff at all.
const ARMORER_LEVER_MISS_UTIL = 0.55;
const ARMORER_LEVER_WEIGHT = 0.6;
const ARMORER_SECONDARY_LEVER_FACTOR = 0.75;
// Total lever supply at which the dependency is fully satisfied.
const ARMORER_LEVER_FULL = 3;

// Summed lever supply available to `armorer` from the rest of the team. Conditional values are
// resolved against this armorer as recipient, so Koleda/Roxy's armorer-only Laceration counts.
function getArmorerLeverSupply(armorer, team) {
    let primary = 0, secondary = 0;
    for (const s of team) {
        if (s === armorer) continue;
        const ctx = { team, self: s, consumer: armorer };
        const buffs = s.mechanics?.buffs;
        primary += Math.max(
            resolveConditionalValue(buffs?.cr, ctx),
            resolveConditionalValue(buffs?.laceration, ctx));
        secondary += resolveConditionalValue(buffs?.pen, ctx)
            + resolveConditionalValue(s.mechanics?.debuffs?.defense, ctx);
    }
    return primary + secondary * ARMORER_SECONDARY_LEVER_FACTOR;
}
// Undersupply is worse than linear: when a provider supplies less of a need than the
// consumer scales for, the partial credit is further discounted (0.6 → ~30% at half).
const UNDERSUPPLY_FACTOR = 0.6;
// Ultimates price partial supply as a straight FRACTION OF THE NEED MET, not as a flat discount.
// Ju Fufu's `utility.ultimates: 1` fully covers Miyabi's `scaling.ultimates: 1`, half of Yixuan's
// 2 and a third of YSG's 3, and should earn 6 / 3 / 2 in that shape. The ratio is SQUARED below
// because `scalingWeight` already appears once in the need product, so a single power of it
// cancels out and pays every undersupplied consumer the same flat number regardless of appetite -
// which is the bug this replaces. Unmet ultimate scaling is never a penalty, only a smaller
// bonus: ultimates arrive naturally and only Dialyn and Ju Fufu provision them at all.
const FRACTIONAL_COVERAGE_KEYS = new Set(['ultimates']);

function getBuffRelevance(key, consumer) {
    const roles = getEffectiveRoles(consumer);
    const element = getElement(consumer);
    const dps = isDPSByRoles(roles);

    switch (key) {
        case 'atk': {
            // Scaled by how much damage the consumer actually deals, matching the L4 need
            // weight in resolveBaselineWeight. A DPS reads 1 and is unchanged; a stunner 0.67,
            // a defence agent 0.33, a plain support 0. Without this, L4 would pay a support for
            // buffing a stunner's ATK while cohesion recorded that same buff as landing on
            // nobody — two readings of one fact, and they must agree.
            const scale = getBasicDamage(consumer) / 3;
            if (scale <= 0) return 0;
            if (roles.includes('rupture')) return RUPTURE_ATK_EFFICIENCY * scale;
            if (roles.includes('armorer')) return ARMORER_ATK_EFFICIENCY * scale;
            return scale;
        }
        case 'anomaly':
            return roles.includes('anomaly') ? 1 : 0;
        case 'sheer':
            if (consumer.mechanics?.scaling?.sheer) return 1;
            return roles.includes('rupture') ? 1 : 0;
        case 'laceration':
            if (consumer.mechanics?.scaling?.laceration) return 1;
            return roles.includes('armorer') ? 1 : 0;
        case 'pen':
            return (dps && !roles.includes('rupture')) ? 1 : 0;
        case 'cr':
            if (consumer.mechanics?.scaling?.cr) return 1;
            if (roles.includes('armorer')) return 1;
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'cd':
            // Graded by declared scaling: an attacker-tier cd:2 is fully relevant, while a
            // token converter like Claret (cd:1 — she turns a sliver of CD into Laceration)
            // only half-lands, so CD-buffing supports earn proportionally little credit.
            if (consumer.mechanics?.scaling?.cd) return Math.min(1, w(consumer.mechanics.scaling.cd) / 2);
            // Armorers otherwise have FIXED crit damage — CD-buffing supports earn nothing.
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

const STAT_BUFF_KEYS = new Set(['atk', 'anomaly', 'sheer', 'laceration', 'pen', 'cr', 'cd', 'stun-multiplier', ...ELEMENTS]);

// How much damage one point of each buff is worth. There used to be two answers to this
// question: the L4 damage layer priced a buff from MULT, while cohesion consulted a shorter
// table here and quietly fell through to MULT.ELEMENT_BUFF for anything it did not list. The
// two disagreed about `laceration`, which L4 pays at 6 and cohesion charged at 2 — so an
// armorer support like Koleda buffing Claret was measured as if her defining buff were worth
// a third of what the engine actually pays for it.
//
// One table now, sourced from MULT so the two cannot drift again. Every key in
// STAT_BUFF_KEYS must appear; the assertion below fails loudly at load if one is added
// without a price, rather than silently pricing it at 2.
const BUFF_IMPACT = {
    atk: MULT.ATK_BUFF,
    cr: MULT.CR_BUFF,
    cd: MULT.CD_BUFF,
    sheer: MULT.SHEER_BUFF,
    laceration: MULT.LACERATION_BUFF,
    anomaly: MULT.ANOMALY_BUFF,
    pen: MULT.PEN_BUFF,
    'stun-multiplier': MULT.STUN_MULT_BUFF,
    // Elements were already reaching MULT.ELEMENT_BUFF through the old fallthrough, so they
    // are unchanged — but listed, so a change to ELEMENT_BUFF cannot silently desync them.
    ...Object.fromEntries(ELEMENTS.map(e => [e, MULT.ELEMENT_BUFF])),
};

// Generic damage is a flat, always-on damage term scored in baseline affinity. It is
// EXCLUDED from cohesion/utilization: it must not rescue a support whose designed buffs
// are mismatched (e.g. Pan's sheer on an attack team), nor inflate diametric/core stacking.
// Debuffs are priced the same way, from the same source. A defence shred and a recovery
// debuff are damage amplifiers exactly as an ATK buff is; they were simply never given a
// value on the cohesion side.
const DEBUFF_IMPACT = {
    defense: MULT.DEFENSE_DEBUFF,
    recovery: MULT.RECOVERY_DEBUFF,
    dmg: MULT.DMG_DEBUFF,
    ...Object.fromEntries(ELEMENTS.map(e => [e, MULT.ELEMENT_DEBUFF])),
};

// Cohesion asks what FRACTION of a support's kit is landing, so only the RELATIVE size of
// these values matters — the ratio is unchanged if every impact is scaled by a constant.
// They are divided by 2 because 2 (MULT.ELEMENT_BUFF) was the value cohesion already used
// for every key it did not list, so a buff worth 2 keeps exactly the weight it has today and
// everything else moves relative to it. That keeps the absolute-supply terms further down
// roughly where they were until phase 4e replaces them.
const IMPACT_UNIT = MULT.ELEMENT_BUFF;

// MULT's values are L4 PAIR-TERM coefficients, not a damage scale. L4 multiplies them by a
// consumer weight and then soft-caps the whole layer at 100, so a 116x spread between sheer
// (81.0 to Yixuan) and ATK (0.7) is survivable there. Cohesion has no such cap: used raw, that
// spread made every ATK support read 26-83% and every sheer/ultimate support saturate.
//
// Delivery therefore uses the SQUARE ROOT of the L4 coefficient. Rationale: a support's share
// of a team's damage is not linear in its pair coefficient, because L4 is one capped layer
// among several. A buff worth IMPACT_UNIT still maps to exactly 1.0, so the anchor is unmoved
// and only the spread compresses — sheer to 2.1x and ATK to 0.6x rather than 4.5x and 0.35x.
function scaleImpact(raw) {
    return Math.sqrt(raw / IMPACT_UNIT);
}

/** How much one point of this buff is worth, relative to a buff of average impact. */
function buffImpact(key) {
    return scaleImpact(BUFF_IMPACT[key] ?? IMPACT_UNIT);
}

/** How much one point of this debuff is worth, relative to a buff of average impact. */
function debuffImpact(key) {
    return scaleImpact(DEBUFF_IMPACT[key] ?? IMPACT_UNIT);
}

// Provisions, priced from what L4 actually pays for them. Only two of them have a real
// provision channel to read a price from, and both are informative:
//
//   ultimates  gifting a carry a free ultimate is a big deal, and it is priced like one
//   chains     a gifted chain attack is worth very little — which is the right answer for
//              Astra's `chains: 2`, and the engine already believed it
//
// EVERY OTHER PROVISION IS DELIBERATELY LEFT AT 1. They are paid only through the need
// channel, whose multiplier is large BECAUSE it is multiplied by a declared need weight and
// fires only for the rare consumer who declares one — 6 units supply veils and 2 declare a
// need for them; nobody at all declares vortex or ablooms. Pricing a veil provision at the
// need multiplier would make Sunna's `veils: 3` about 78% of her measured kit and land it on
// almost nobody, cratering a support this engine has just been corrected to rate highly. A
// niche need going unmet says nothing about whether a support fits the team, which is the
// same reasoning that keeps PROVISION_WHIFF_PENALTY restricted to ultimates.
const PROVISION_IMPACT = {
    ultimates: MULT.ULTIMATES_PROVISION,
    chains: MULT.CHAINS_PROVISION,
};

// Defensive provisions are EXEMPT from the delivery measure. The game heavily favours
// offensive play and these are negligible next to a damage buff, so pricing them would only
// add noise — and, worse, would let a defensive provision that nobody declared a need for
// masquerade as a support's flagship. Sunna's `veils: 3` is the case that forced this: it was
// 48% of her measured kit, landed on nobody, and dragged her below Nicole.
// (`shields` and `heal:*` are already outside NEED_FULFILLMENT_KEYS and never reached here.)
const DEFENSIVE_PROVISIONS = new Set(['veils', 'interrupt-resistance']);

// How close to the biggest offering another one has to be to count as an alternative
// flagship. A unit carrying several comparably huge buffs is not a mismatch on any team,
// because one of them always lands — the same "menu, not separate offerings" rule phase 1
// established for Lighter's fire/ice, applied to a whole kit. A unit with ONE dominant
// offering and a few small ones has no substitute when the big one misses.
const FLAGSHIP_BAND = 0.6;

// How much of a buff has to actually reach a consumer for it to count as having landed.
// Half: a buff arriving at RUPTURE_ATK_EFFICIENCY (0.33) has not found a home, it has been
// tolerated. A buff reaching only non-DPS teammates, at the 0.5 discount, still counts.
const FLAGSHIP_LAND_THRESHOLD = 0.5;

// Damage-weighted delivery at which a support is contributing a full complement, i.e. the
// point where utilization saturates at 1.0. Derived from the roster — see the note in
// computeBuffUtilization.
const DELIVERY_REFERENCE = 4.5;

/** How much one point of this provision is worth, relative to a buff of average impact. */
function provisionImpact(key) {
    return scaleImpact(PROVISION_IMPACT[key] ?? IMPACT_UNIT);
}

for (const key of STAT_BUFF_KEYS) {
    if (BUFF_IMPACT[key] === undefined) {
        throw new Error(`BUFF_IMPACT is missing a damage value for stat buff "${key}". ` +
            `Add it from MULT rather than letting cohesion price it by accident.`);
    }
}

// `vortex` is a contextual situational bonus rather than a designed part of a kit, and its
// positive signal is already paid in L4 baseline affinity. It stays out of cohesion.
//
// `dmg` USED to be excluded alongside it, on the grounds that always-on generic damage must
// not rescue a support whose designed buffs are mismatched. Under impact weighting that
// reasoning inverts. Generic damage IS what makes Astra's weak ATK into a rupture carry
// tolerable — it lands in full on a DPS while her ATK arrives at a third — and a measure that
// cannot see it reports her as a worse fit than a support who brings less. It is priced at
// DMG_BUFF like everything else, so it can no longer rescue anyone by being free: it carries
// its own weight in the denominator too, and because generic damage takes the else-branch it
// lands at the AVERAGE relevance across teammates rather than the max, so on a team with one
// DPS and one support it arrives at half.
const COHESION_EXCLUDED_BUFFS = new Set(['vortex']);

function getScalingBuffs(unit) {
    const explicit = unit.mechanics?.scaling?.buffs;
    if (explicit !== undefined) return w(explicit);
    if (unit.tags.includes('support') || unit.tags.includes('defense')) return 3;
    if (unit.tags.includes('stun')) return 2;
    return 0;
}

/**
 * Decide which of a supplier's element buffs are charged against its cohesion.
 *
 * Element buffs are a MENU, not separate offerings: a unit carries fire AND ice so that one
 * of them matches whatever the team runs. The rule:
 *
 *   - every arm that lands is charged and credited in full;
 *   - an arm with no target is not charged at all;
 *   - if NOTHING on the menu lands, the largest arm is charged as dead weight — one
 *     mismatch, not one per arm.
 *
 * For a unit with a single element buff the result is arithmetically identical to charging
 * that buff directly (a lone landing arm charges itself; a lone missing arm is also the
 * largest), which is why Soukaku's unmatched ice buff keeps taking the hit it takes today.
 * Lighter is the only unit in the roster with more than one element buff.
 *
 * Exported so the rule can be asserted directly. It cannot be observed through a team's score
 * while the absolute-supply threshold in computeBuffUtilization pins Lighter's utilization at
 * 100% regardless — see issue 3.
 *
 * @param {Array<[string, number]>} elementMenu - [elementKey, weight] pairs, weight >= 2
 * @param {Object[]} consumers - the supplier's teammates
 * @returns {Array<{key: string, bw: number, rel: number}>} the arms to charge
 */
export function chargeableElementArms(elementMenu, consumers) {
    const hasDPS = consumers.some(c => isDPS(c));
    const arms = elementMenu.map(([key, bw]) => {
        let dpsRelevance = 0;
        let otherRelevance = 0;
        for (const consumer of consumers) {
            const rel = getBuffRelevance(key, consumer);
            if (isDPS(consumer)) dpsRelevance = Math.max(dpsRelevance, rel);
            else otherRelevance = Math.max(otherRelevance, rel);
        }
        return { key, bw, rel: Math.max(dpsRelevance, otherRelevance * (hasDPS ? 0.5 : 1.0)) };
    });
    const live = arms.filter(a => a.rel > 0);
    if (live.length > 0) return live;
    return [arms.reduce((biggest, a) => (a.bw > biggest.bw ? a : biggest))];
}

/**
 * What a quick-assist provision is worth to a team's cohesion — charged and credited alike.
 *
 * Quick assists are a SMALL benefit that ALWAYS lands. Every unit in the game benefits from
 * one; most do nothing special with it, and a few (Anton) declare a real
 * `scaling.quick-assists` need and get more out of it. So offering them is never a mismatch
 * and must not read as one — but it must not read as a big contribution either.
 *
 * Judging them purely by declared need got both halves wrong: Astra's `quick-assists: 3`
 * entered cohesion at weight 3 and came back at 3 x 0.25 = 0.75, recording her as wasting
 * 2.25 of her kit on the thing every carry in the game happily uses. Charging the SIZE
 * instead leaves the credit exactly where it was and stops charging for a phantom shortfall.
 *
 * The caller adds this to BOTH the total and the effective weight — that is the "always
 * lands" half, and it is the property worth asserting. How little a quick assist is worth is
 * priced separately, in L4's need channel, against the same QUICK_ASSIST_VALUE baseline.
 *
 * @param {number} uv - the provider's annotated `utility['quick-assists']` weight
 * @param {Object[]} consumers - the provider's teammates
 * @returns {number} weight to charge, which is also the weight to credit
 */
export function quickAssistCohesionWeight(uv, consumers) {
    // The floor is the standard bonus everyone takes. A consumer who declares a real need is
    // worth more, and the provider must still be credited for it — which the old
    // declared-need lookup got right and which must not be lost.
    let landed = QUICK_ASSIST_VALUE;
    for (const consumer of consumers) {
        landed = Math.max(landed, Math.min(1, w(getEffectiveScaling(consumer)['quick-assists'])));
    }
    return uv * landed;
}

/**
 * The cohesion measure for one supplier on one team, with its parts exposed.
 *
 *   delivered       damage-weighted contribution that actually arrived (no denominator)
 *   flagship        magnitude of this unit's largest single offering
 *   flagshipLanded  did that offering, or one within FLAGSHIP_BAND of it, find a target
 *   util            what computeBuffUtilization returns
 *
 * Exported so the model can be asserted directly and so DELIVERY_REFERENCE can be derived
 * from the roster rather than guessed.
 */
export function cohesionBreakdown(supplier, team) {
    const out = {};
    out.util = computeBuffUtilization(supplier, team, out);
    return out;
}

function computeBuffUtilization(supplier, team, out = null) {
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
            const bw = w(value) * buffImpact(key);
            totalWeight += bw;
            let totalRelevance = 0;
            for (const consumer of consumers) {
                totalRelevance += getBuffRelevance(key, consumer);
            }
            effectiveWeight += bw * (nConsumers > 0 ? totalRelevance / nConsumers : 0);
        }
        for (const [key, value] of evaluatableDebuffs) {
            const dw = w(value) * debuffImpact(key);
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
    // Every distinct thing this unit offers, as {magnitude, landed}. Used ONLY for the
    // flagship test — how much arrived is `effectiveWeight`.
    const offerings = [];
    const offer = (magnitude, relevance) => { if (magnitude > 0) offerings.push({ magnitude, relevance }); };
    let coreWeight = 0;
    let coreEffective = 0;
    let coreImpact = 0;

    // Element buffs are a MENU, not separate offerings. Lighter carries fire AND ice so that
    // one of them matches whatever the team runs; charging him for the arm with no target
    // penalises the exact thing that makes him flexible. They are collected here and settled
    // together below, after the ordinary buffs.
    const elementMenu = [];

    for (const [key, value] of Object.entries(buffs)) {
        if (COHESION_EXCLUDED_BUFFS.has(key)) continue; // dmg/vortex: flat L4 only, not cohesion
        const bw = w(value);
        if (bw <= 0) continue;
        // Weight-1 element buffs (Nicole's ether) stay on the auto-credit path below, which
        // never consults relevance — routing them through the menu would change a unit this
        // phase is not about.
        if (bw >= 2 && ELEMENTS.includes(key)) {
            elementMenu.push([key, bw]);
            continue;
        }
        // Weighted by how much damage this buff is actually worth, not by its annotation
        // weight. Wasting a point of sheer (4.5) costs far more than wasting a point of ATK
        // (0.35), which is the whole of the Lucia/YSG case: her defining buff is a rupture
        // stat and YSG is an attack unit, so she is the wrong tool for the job even though
        // her annotation weights look respectable.
        const impact = buffImpact(key);
        totalWeight += bw * impact;
        if (bw < 2) {
            effectiveWeight += bw * impact;
            offer(bw * impact, 1);
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
            effectiveWeight += bw * impact * maxRelevance;
            offer(bw * impact, maxRelevance);
            coreWeight += bw;
            coreEffective += bw * maxRelevance;
            coreImpact += bw * maxRelevance * BUFF_IMPACT[key];
        } else {
            let totalRelevance = 0;
            for (const consumer of consumers) {
                totalRelevance += getBuffRelevance(key, consumer);
            }
            const avgRelevance = nConsumers > 0 ? totalRelevance / nConsumers : 0;
            effectiveWeight += bw * impact * avgRelevance;
            offer(bw * impact, avgRelevance);
        }
    }

    // Settle the element menu.
    //
    // Charge only the arms that LAND, and credit each of them in full. A unit is never
    // penalised for an arm with no target, but two arms landing is genuinely worth more than
    // one, because both add weight to the numerator AND to the absolute-supply term. If NO arm
    // lands, the largest one is charged as dead weight — a menu where nothing matches is a real
    // mismatch and still deserves the hit.
    //
    // For a unit with a single element buff this is arithmetically identical to charging it
    // directly: one landing arm charges itself, and a lone missing arm is also the largest.
    // That is deliberate — Soukaku's lone ice buff on a team with no ice consumer must keep
    // taking the hit it takes today. Lighter is the only unit in the roster with more than one
    // element buff, so he is the only unit this can move.
    if (elementMenu.length > 0) {
        for (const arm of chargeableElementArms(elementMenu, consumers)) {
            const armImpact = buffImpact(arm.key);
            totalWeight += arm.bw * armImpact;
            effectiveWeight += arm.bw * armImpact * arm.rel;
            offer(arm.bw * armImpact, arm.rel);
            coreWeight += arm.bw;
            coreEffective += arm.bw * arm.rel;
            coreImpact += arm.bw * arm.rel * BUFF_IMPACT[arm.key];
        }
    }

    for (const [key, value] of Object.entries(debuffs)) {
        if (COHESION_EXCLUDED_BUFFS.has(key)) continue; // dmg: flat L4 only, not cohesion
        const dw = w(value);
        if (dw <= 0) continue;
        const impact = debuffImpact(key);
        totalWeight += dw * impact;
        if (dw < 2) {
            effectiveWeight += dw * impact;
            offer(dw * impact, 1);
            continue;
        }
        let maxRelevance = 0;
        for (const consumer of consumers) {
            maxRelevance = Math.max(maxRelevance, getDebuffRelevance(key, consumer));
        }
        effectiveWeight += dw * impact * maxRelevance;
        offer(dw * impact, maxRelevance);
    }

    if (!isDPS(supplier)) {
        for (const key of NEED_FULFILLMENT_KEYS) {
            const uv = w(utility[key]);
            if (uv <= 0) continue;

            // Quick assists are a SMALL benefit that ALWAYS lands. Every unit in the game
            // benefits from one; most do nothing special with it, and a few (Anton) declare a
            // real need and earn more in L4. So offering them is never a mismatch and must not
            // read as one — but it must not read as a big contribution either.
            //
            // Judging them by declared need got both halves wrong: Astra's `quick-assists: 3`
            // entered at weight 3 and came back at 3 x 0.25 = 0.75, so the engine recorded her
            // as wasting 2.25 of her kit on the thing every carry in the game happily uses.
            // Charging the SIZE instead — the same 0.25 the consumer baseline uses — leaves the
            // credit exactly as it was and stops charging for the phantom shortfall.
            if (key === 'quick-assists') {
                const qw = quickAssistCohesionWeight(uv, consumers);
                totalWeight += qw;
                effectiveWeight += qw;
                offer(qw, 1);
                continue;
            }

            if (DEFENSIVE_PROVISIONS.has(key)) continue;
            const impact = provisionImpact(key);
            totalWeight += uv * impact;
            let maxRelevance = 0;
            for (const consumer of consumers) {
                // `ultimates` is the one key paid through the PROVISION channel, which lands on
                // any carry who can use an ultimate at all - not only on the few units that
                // declare a `scaling.ultimates` need. Judging it by declared need would read
                // Dialyn's provision as landing on nobody whenever the carry is a Seed or an
                // Evelyn, which is wrong: they use the free ultimate, they just don't get
                // anything extra from it.
                //
                // DELIBERATELY UNMODELED - relayed provision. Dialyn/Sigrid/Sunna and
                // Dialyn/Sigrid/Astra take the identical hit here. The Astra line could in
                // principle take a smaller one: Dialyn can gift the free ultimate to Astra,
                // whose ultimate provisions a chain attack to every teammate, and Sigrid
                // (`scaling.chains: 3`) wants a free chain attack badly - so the provision
                // reaches her by relay. Tracing provisions through an intermediary is a lot of
                // machinery for a difference this small. Not modelled on purpose; revisit only
                // if this hair genuinely needs splitting.
                const rel = key === 'ultimates'
                    ? (isDPS(consumer) && !hasSubDPSRole(consumer) && getUltimateMagnitude(consumer) > 0 ? 1 : 0)
                    : Math.min(1, w(getEffectiveScaling(consumer)[key]));
                maxRelevance = Math.max(maxRelevance, rel);
            }
            effectiveWeight += uv * impact * maxRelevance;
            offer(uv * impact, maxRelevance);
        }
    }

    // Daze. A stunner gets a flat 3 for opening the window at all, plus whatever daze they
    // annotate. A NON-stunner who annotates daze gets only the annotated part — Sunna is shy
    // of a pseudo-stunner: enough daze to matter, not enough to open a window herself. Before
    // this, her `daze: 2` counted for nothing at all, because the block was gated on the stun
    // tag, and she read below Nicole on every team as a result.
    if (!isDPS(supplier)) {
        const opensWindow = isStun(supplier);
        const dazeContribution = (opensWindow ? 3 : 0) + w(utility.daze);
        if (dazeContribution > 0) {
            totalWeight += dazeContribution;
            const hasBeneficiary = consumers.some(c => isDPS(c) && !isStunlessUnit(c));
            effectiveWeight += dazeContribution * (hasBeneficiary ? 1 : 0);
            offer(dazeContribution, hasBeneficiary ? 1 : 0);
        }
    }

    if (totalWeight === 0) return 0.0;

    // TWO questions, and neither of them is "what fraction of your kit was wasted".
    //
    // The team asks: DO THE BUFFS I CARE ABOUT LAND? That is an absolute quantity — how much
    // damage arrived — with no denominator. A support carrying five enormous buffs of which
    // four have no target on this team is not thereby a bad support; the one that landed is
    // still enormous, and nobody was ever going to want all five.
    //
    // The unit asks: DID MY FLAGSHIP LAND? That is identity, not arithmetic. Lucia's defining
    // buff is sheer, which is a rupture stat; on an attack carry she is the wrong tool for the
    // job, and it is that — not the size of the waste — that should cost her.
    //
    // A FRACTION answers neither, and answers them wrongly in a specific way: adding an
    // offering that does not land leaves the numerator alone and raises the denominator, so a
    // ratio always rewards DELETING a mismatched buff. That was issue 3's visible symptom
    // (strip Sunna's ATK and Nangong/Yixuan/Sunna scored higher), and it is inherent to
    // ratios rather than a calibration miss. The old `effectiveWeight / 4` term that looked
    // like the bug was in fact the answer to the first question all along, just unweighted;
    // `Math.max(ratio, threshold, coreRatio)` was what let the fraction win.
    //
    // Note that removing a buff CAN now raise a unit's score, and correctly so. A support
    // whose one armorer buff dominates her kit is wasted on an attack team; strip that buff
    // and her flagship becomes whatever she offers next, which may well land. She is a
    // different unit with less kit, and a better one for that team.
    const delivered = effectiveWeight;

    // A flagship has to SUBSTANTIALLY land, not merely be nonzero. Yuzuha's ATK buff reaches
    // a rupture carry at RUPTURE_ATK_EFFICIENCY — a third — and counting that as "my flagship
    // landed" is how an anomaly support read as a reasonable pick for Yixuan. Partial landing
    // is already priced correctly in `delivered`, where relevance multiplies magnitude; this is
    // the separate, categorical question of whether the unit found a home at all.
    const flagship = offerings.reduce((m, o) => Math.max(m, o.magnitude), 0);
    const flagshipLanded = flagship === 0 || offerings.some(
        o => o.magnitude >= FLAGSHIP_BAND * flagship && o.relevance >= FLAGSHIP_LAND_THRESHOLD);

    let baseUtil = Math.min(1.0, delivered / DELIVERY_REFERENCE);
    if (!flagshipLanded) baseUtil *= WHIFF_COHESION_PENALTY;
    if (out) { out.delivered = delivered; out.flagship = flagship; out.flagshipLanded = flagshipLanded; }

    // Provision side. A provision is only "wasted" when the consumer is ACTIVELY barred from
    // using something they would otherwise want — not merely when nobody happens to scale for
    // it. Most need-fulfillment keys are niche (only 2 of 60 units scale off veils, 1 off
    // disorders, 0 off vortex), so "no consumer scales for this" is the normal case and says
    // nothing about fit. Ultimates are the opposite: 27 of 60 units want them, and
    // `ultimate:weak` is an explicit statement that this carry cannot. That is a real mismatch,
    // and it is the one this charge exists for — Dialyn handing free ultimates to Sigrid, whose
    // burst lives in her enhanced attacks and whose chains they would consume.
    if (w(utility.ultimates) >= 3) {
        const anyUsableUltimate = consumers.some(c => {
            if (!isDPS(c) || hasSubDPSRole(c)) return false;
            const cDmg = c._resolvedDamage || c.mechanics?.damage || {};
            return !(w(cDmg['ultimate:weak']) > 0 && w(cDmg['ultimate:strong']) === 0);
        });
        if (!anyUsableUltimate) baseUtil *= PROVISION_WHIFF_PENALTY;
    }
    // KNOWN GAP: a *partially* landing stat buff is still not charged. Sunna's atk:3 reaches a
    // rupture carry at relevance 0.33, and because utilization is a ratio, carrying that buff
    // lowers it even though the buff adds real absolute damage — so she can score better by not
    // having it at all. Charging the shortfall in proportion was tried and breaks the calibrated
    // support ordering in TEST 9. The real fix is making the fit ratio authoritative over the
    // absolute-supply `threshold` above, which needs a full retune of the suite.
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
            // Unreachable in practice: L1 runs inside a morph pass, where the morph sentinel is
            // already false. Kept because it is redundant rather than wrong — the search takes the
            // max over every target, so an all-resisted lumen unit yields -1 from the `else` branch
            // on every combination and an any-unresisted one yields a real score.
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

// A composition with NO support or defense agent is a real teambuilding failure, not a stylistic
// choice — supports exist because buffs matter, and a team that forgoes one is giving up its
// single largest source of damage amplification. L1.5 could not express this at all: it rated
// `Nangong/Miyabi/Vivian` and `Nangong/Miyabi/Yuzuha` as identically CONVENTIONAL, which is why
// triple-anomaly lines outranked the wheelchairs they should lose to (issue 7).
//
// Demotion is to the EXISTING `UNCONVENTIONAL_VIABLE` tier, so no new tier or factor is needed.
// The hit is deliberately large (~-35 raw, then -15% on the total): it is meant to be.
//
// `isEffectiveSupport || isEffectiveDefense` reads activated pseudo-roles, which is what makes
// Orphie, Remielle, and Cissia-alongside-Seed count as the team's support.
function scoreTeamStructure(team, debug) {
    const classified = classifyTeamStructure(team, debug);
    if (classified !== STRUCTURE.CONVENTIONAL_BONUS) return classified;
    if (team.some(u => isEffectiveSupport(u) || isEffectiveDefense(u))) return classified;
    // Exemption: in a totalize + double-stun comp the SECOND STUNNER *is* the support. Totalize
    // damage is stun uptime, so a second stunner is feeding the carry's damage the way a support
    // otherwise would. Deliberate, not an oversight.
    if (secondStunnerActsAsSupport(team)) {
        if (debug) console.log('    Structure: ^ kept — no support, but the second stunner serves as one (totalize)');
        return classified;
    }
    if (debug) console.log('    Structure: ^ DEMOTED to UNCONVENTIONAL viable — no support or defense agent');
    return STRUCTURE.UNCONVENTIONAL_VIABLE;
}

function secondStunnerActsAsSupport(team) {
    const stunners = team.filter(isStun);
    if (stunners.length < 2) return false;
    return team.filter(isDPS).some(u => w(u.mechanics?.damage?.totalize) > 0);
}

function classifyTeamStructure(team, debug) {
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
        // Native lumen is exempt: it CANNOT produce a reaction (Attribute Mutation fills no
        // gauge), so the absence is what lumen is rather than a defect of the team. Same
        // reasoning as the L5 carve-out below.
        const reactionDisabled = isSubDPS && isAnomaly(unit) && !isNativeLumen(unit) &&
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

        // A codependent unit whose composition need is unmet is not the tier it says it is.
        const codepFactor = codependencyFactor(unit, team);
        if (codepFactor < 1) {
            tierBonus = Math.round(tierBonus * codepFactor);
            rankBonus = Math.round(rankBonus * codepFactor);
        }
        score += tierBonus + rankBonus;
        if (debug) {
            const role = isStun(unit) ? 'stun' : 'support/def';
            const utilPct = Math.round(utilization * 100);
            console.log(`      ${unit.name}: T${tier} → tier ${tierBonus >= 0 ? '+' : ''}${tierBonus}, rank ${rankBonus >= 0 ? '+' : ''}${rankBonus} (${role}, util ${utilPct}%)`);
        }
    }

    // --- Damage output beyond what the role already implies ---
    //
    // `basic` is a baseline INHERITED from role (see BASIC_DAMAGE_BY_ROLE), and the baseline
    // is a description of damage the engine already prices everywhere else — tier, rank, burst
    // throughput, L4 pair terms. Paying the baseline again here would double-count it and,
    // worse, would reward stacking DPS roles, which the field-time economy exists to prevent.
    //
    // What is NEWS is a unit whose damage EXCEEDS its role. Sunna is a support, so the engine
    // assumes she deals nothing at all — but she attacks from off-field and does considerably
    // more in a matchup than Astra, who deals none. `damage.basic: 1` against a support
    // baseline of 0 is exactly that one point of difference, and this is where it is paid.
    // Generalises: a stunner annotated `basic: 3` would be paid the one point over stun's 2.
    for (const unit of team) {
        const excess = getBasicDamage(unit) - getBasicDamageBaseline(unit);
        if (excess <= 0) continue;
        const credit = Math.round(excess * MULT.BASIC_DAMAGE_CREDIT);
        score += credit;
        if (debug) console.log(`      ${unit.name}: basic damage +${credit} (${getBasicDamage(unit)} vs role baseline ${getBasicDamageBaseline(unit)})`);
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

    // Hoisted: both the disorders-weakness block and the element weakness/resistance block
    // below need reactions, and this used to be computed twice in one pass.
    const l3Reactions = computeAnomalyReactions(team, boss);

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
                score += SHILL_MATCH_BONUS;
                if (debug) console.log(`    Shill match (${bossShill}): +${SHILL_MATCH_BONUS}`);
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
            // Meeting the requirement intrinsically is not the same as meeting it with a
            // stunner: the stunless carry satisfies it AND keeps the slot for a second support.
            const shillCredit = stunlessException ? STUNLESS_SHILL_CREDIT : SHILL_MATCH_BONUS;
            score += shillCredit;
            if (debug) console.log(`    Non-DPS shill match (${bossShill})${stunlessException ? ' via stunless DPS — stunner slot not spent' : ''}: +${shillCredit}`);
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

    // Disorders weakness (e.g. Butcher): bonus scales with team disorder generation, and
    // saturates. This block used to keep its OWN convention — sum of `utility.disorders` plus a
    // flat +2 for element cycling — which could not tell one cycling element from two, missed a
    // role-less proc enabler entirely, and scaled without limit so a triple-anomaly team kept
    // collecting. It now shares `getTeamDisorderSupply` with the rest of the engine and passes
    // through the game's hard cap of 5 sources.
    if (weakMechanics.includes('disorders')) {
        const supply = getTeamDisorderSupply(team, l3Reactions);
        if (supply > 0) {
            const effective = effectiveDisorderWeakSupply(supply);
            const bonus = Math.round(effective * BOSS_WEAK.DISORDER_PER_UNIT);
            score += bonus;
            if (debug) console.log(`    Boss weak(disorders): supply ${supply} → ${effective.toFixed(2)} effective → +${bonus}`);
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

    // Control skills (e.g. Discordant Solo): armorers intercept a control skill and turn it
    // into a simple quicktime event, so their value rises with how many the boss uses. Scales
    // per armorer with a steep falloff — a second interceptor helps a little, a third not at
    // all. Pure bonus: teams without an armorer are unaffected.
    const controlCount = getBossControl(boss);
    if (controlCount > 0) {
        const armorers = team.filter(u => getEffectiveRoles(u).includes('armorer'));
        armorers.forEach((unit, i) => {
            const falloff = ARMORER_CONTROL_FALLOFF[i] ?? 0;
            if (falloff === 0) return;
            const bonus = Math.round(controlCount * BOSS_WEAK.CONTROL_QUICKTIME * falloff);
            score += bonus;
            if (debug) console.log(`    Boss control skills (${controlCount}): ${unit.name} quicktime intercept → +${bonus}${i > 0 ? ` (×${falloff})` : ''}`);
        });
    }

    // --- DPS element weakness/resistance ---
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

    // Laceration buffs → armorers. The armorer analogue of the sheer block above.
    if (supplierBuffs.laceration) {
        const cw = resolveBaselineWeight(consumer, 'laceration');
        if (cw > 0) {
            const val = w(supplierBuffs.laceration) * cw * MULT.LACERATION_BUFF;
            score += val;
            dbg('laceration', val);
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
            // A GREEDY carry gets more out of a longer window than anyone else. Most units have
            // plenty of time to land their burst inside a normal stun, so a shortened recovery
            // is a modest bonus; a greedy carry is the one that was actually running out of
            // window, and extending it lets them land damage they otherwise could not.
            //
            // This is the other half of `scaling.greedy`, and the reason Lighter beats Trigger as
            // Evelyn's stunner: both raise her stun multiplier, but only Lighter shortens the
            // enemy's recovery, and Evelyn - greedy 3, and the one carry who declares
            // `scaling.recovery` outright - is exactly who that helps. Gated at 2 because a
            // greedy-1 rotation (Aria, Promeia) is quick enough already; more window is gravy.
            const team = options?.team ?? [supplier, consumer];
            const greedBonus = (getGreed(consumer) >= 2 && canExploitLongWindow(consumer, team))
                ? getGreed(consumer) : 0;
            const effectiveBurst = burstWeight + chainsScaling + totalizeWeight * 2
                + recoveryScaling + greedBonus;
            const val = w(supplierDebuffs.recovery) * effectiveBurst * MULT.RECOVERY_DEBUFF;
            score += val;
            dbg('recovery', val);
        }
    }

    // Ultimates provision → primary DPS only (subdps don't consume the burst window).
    // Priced by the consumer's ultimate MAGNITUDE: a free ultimate is worth more to a carry
    // whose own ultimate hits harder. Magnitude belongs here and only here - it used to be
    // smuggled into the need channel instead, which fabricated an ultimate need for 26 of 60
    // units. Note getMaxBurstWeight ALSO reads ultimate magnitude, and that is not a duplicate:
    // this channel prices what a FREE ultimate is worth to the consumer, while burst throughput
    // prices what the consumer dumps into a window from its own kit. Different questions.
    //
    // A weak ultimate (not a real burst) yields magnitude 0 and zeroes this out on its own,
    // so no separate guard is needed. A conditional `ultimate:strong` resolves through
    // _resolvedDamage and lifts the zeroing - which is exactly how Pyrois's wind case works.
    const supplierUtility = resolveValueMap(supplier.mechanics?.utility, _ctx);
    const ultimatesWeight = w(supplierUtility.ultimates);
    if (ultimatesWeight > 0 && isDPSByRoles(consumerRoles) && !hasSubDPSRole(consumer)) {
        const val = ultimatesWeight * getUltimateMagnitude(consumer) * MULT.ULTIMATES_PROVISION;
        score += val;
        dbg('ultimates', val);
    }

    // Chain provision -> any DPS, priced by the consumer's chain MAGNITUDE. Unlike ultimates,
    // chains are NOT a limited one-per-window resource, so subdps are included. Astra gifting
    // a chain to Ellen is nice, to Starlight Billy nicer, to Evelyn nicest; to a support it is
    // a waste, which getChainMagnitude expresses by returning 0.
    //
    // This is a separate channel from `need(chains)`, on purpose and for the same reason the
    // two ultimate channels are separate: this one pays for the chain attack's own damage,
    // while the need channel pays units that get something BEYOND it (Evelyn, Sigrid).
    const chainsWeight = w(supplierUtility.chains);
    if (chainsWeight > 0) {
        const val = chainsWeight * getChainMagnitude(consumer) * MULT.CHAINS_PROVISION;
        if (val > 0) {
            score += val;
            dbg('chains', val);
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

        // Disorders are priced ONCE, team-wide, in the L4 team-level section rather than
        // per supplier. A disorder need is fed by two independent sources — element cycling
        // and a teammate's forced polarity disorders — and pricing them per pair meant each
        // computed coverage in ignorance of the other, so both read as undersupplied when
        // together they covered the need. `getDisorderSupply` aggregates them instead.
        // (No unit `converts` or `replaces` disorders, so those branches lose nothing.)
        if (key === 'disorders') continue;

        let supplyWeight = Math.max(
            w(supplierBuffs[key]),
            w(supplierDebuffs[key]),
            w(supplierUtility[key])
        );

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
            const coverage = Math.min(1, supplyWeight / scalingWeight);
            let fulfillment = coverage;
            if (FRACTIONAL_COVERAGE_KEYS.has(key)) {
                // Fraction of the need met; see FRACTIONAL_COVERAGE_KEYS. Continuous at coverage
                // 1, so there is no cliff where supply happens to match scaling exactly.
                fulfillment *= coverage;
            } else if (supplyWeight < scalingWeight) {
                // Undersupply is worse than linear: partially meeting a need (e.g. Lucia's
                // veils:1 for YSG's veils:2) helps, but not enough to do the job.
                fulfillment *= UNDERSUPPLY_FACTOR;
            }
            const keyMult = NEED_KEY_MULT[key] ?? MULT.NEED_FULFILLMENT;
            const val = supplyWeight * scalingWeight * keyMult * fulfillment;
            score += val;
            if (debug) console.log(`        need(${key}): ${val.toFixed(1)}${coverage < 1 ? ` (covers ${Math.round(coverage * 100)}%)` : ''}`);
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

    // The buff half of the buff x defense-shred pair. For most DPS that is ATK/CD, but an
    // armorer gets nothing from ATK and usually nothing from CD, so pairing off those would
    // hand out a cohesion floor for buffs the consumer cannot use. Swap in the levers an
    // armorer actually has: PEN, CR and Laceration. (The element buff x element debuff pair
    // below is left alone — elemental damage is a full-value lever for armorers too.)
    const isArmorerConsumer = consumerRoles.includes('armorer');
    const pairBuffWeight = (s, buffs) => isArmorerConsumer
        ? Math.max(
            getEffectiveBuffValue(s, team, 'atk') * ARMORER_ATK_EFFICIENCY,
            w(buffs.cd) * getBuffRelevance('cd', consumer),
            w(buffs.pen), w(buffs.cr), w(buffs.laceration))
        : Math.max(getEffectiveBuffValue(s, team, 'atk'), w(buffs.cd));

    for (const s of suppliers) {
        const buffs = resolveValueMap(s.mechanics?.buffs, { team, self: s, consumer: null });
        const debuffs = resolveValueMap(s.mechanics?.debuffs, { team, self: s, consumer: null });
        const atkCdWeight = pairBuffWeight(s, buffs);
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

            // ...and what a codependent unit GIVES is worth less too. Remielle's buffs on a
            // team that cannot switch her on are the same shortfall seen from the other side.
            const supplierCodep = codependencyFactor(supplier, team);
            let pairTotal = affinityScore + needScore + stunScore;
            if (supplierCodep < 1 && pairTotal > 0) {
                const scaled = pairTotal * supplierCodep;
                consumerTotal -= (pairTotal - scaled);
                if (debug) console.log(`        ${supplier.name} codependency unmet → ×${supplierCodep.toFixed(2)}`);
                pairTotal = scaled;
            }
            if (debug) console.log(`        pair total: ${pairTotal.toFixed(1)}`);
        }

        // Everything the team pours INTO a codependent unit is worth less when its
        // composition need is unmet — buffs it cannot convert are not buffs.
        const codepFactor = codependencyFactor(consumer, team);
        if (codepFactor < 1) {
            if (debug && consumerTotal > 0) {
                console.log(`      ${consumer.name}: codependency unmet → ×${codepFactor.toFixed(2)} ` +
                    `on ${consumerTotal.toFixed(1)}`);
            }
            consumerTotal *= codepFactor;
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

        // Flat "a disorder happened, and this agent's own procs are part of it" bonus. Agents
        // who additionally SCALE on disorders are paid through the need channel below instead.
        if (reaction.hasDisorder && w(getEffectiveScaling(unit).disorders) <= 0) {
            consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + MULT.DISORDER_BONUS);
            if (debug) console.log(`    Implicit disorder: ${unit.name} +${MULT.DISORDER_BONUS}`);
        }
    }

    // Disorder need, priced ONCE against the team's aggregate disorder supply. Formerly two
    // half-blind channels — a hardcoded implicit supply here plus a per-supplier
    // `need(disorders)` in the pair loop — neither of which could see the other's supply, so
    // a need of 3 read as 67% covered from both even when the two together met it.
    //
    // Loops the whole team, not just anomaly agents: a disorder is a team-wide event on the
    // target, so a consumer benefits from it whether or not it generates any itself. That is
    // the L4 half of issue 5 — the old code only ever paid an agent for its OWN reaction.
    for (const unit of team) {
        const need = w(getEffectiveScaling(unit).disorders);
        if (need <= 0) continue;
        const supply = getDisorderSupply(unit, team, reactions);
        if (supply <= 0) continue;
        const effective = effectiveDisorderSupply(supply, need);
        // Undersupply still hurts: a unit that cannot reach its ceiling is worth less than one
        // that can. A RAMP rather than the old flat step, so it is continuous at full coverage
        // and there is no cliff — but it must not scale as coverage itself, because
        // `supply x need x (supply/need)` collapses to `supply^2` and deletes the appetite term
        // entirely. That collapse is what issue 5 existed to remove; do not reintroduce it.
        const coverage = Math.min(1, supply / need);
        const damp = UNDERSUPPLY_FACTOR + (1 - UNDERSUPPLY_FACTOR) * coverage;
        const val = effective * need * MULT.NEED_FULFILLMENT * damp;
        consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + val);
        if (debug) console.log(`    Disorder need: ${unit.name} +${val.toFixed(1)} (supply ${supply} → ${effective.toFixed(2)} effective, need ${need}${coverage < 1 ? `, undersupplied x${damp.toFixed(2)}` : ''})`);
    }

    // Refringe bonus: when a lumen anomaly agent is present, their Lumiflux Buildup is consumed
    // when a non-lumen anomaly teammate procs an anomaly, dealing a large additional hit.
    // Cascade: Attribute Mutation boosts anomaly proc damage, so disorder/vortex damage (which
    // derives from anomaly procs) is also amplified. Partners with active reactions get extra credit.
    const lumenAnomalyAgents = anomalyDPS.filter(isNativeLumen);
    if (lumenAnomalyAgents.length > 0) {
        const nonLumenAnomalyPartners = anomalyDPS.filter(u => !isNativeLumen(u));
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
    // (max 3). Stun and armorer agents build that pool, and only armorers detonate it into a
    // Maim — which is why the bonus below is awarded to armorers alone. More gash builders →
    // the shared pool fills faster → more/bigger Maims, so armorers favour stun/armorer-dense
    // comps (Stun/Armorer/Armorer, Armorer/Armorer/Support). The shared-pool cap is modelled by
    // capping the builder count.
    const armorerUnits = team.filter(u => getEffectiveRoles(u).includes('armorer'));
    if (armorerUnits.length > 0) {
        const buildsGash = (u) => isStun(u) || isArmorer(u);
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
    // Supply is a WEIGHTED count, not a head-count. Each effective anomaly agent on the team is
    // one body INCLUDING self (a wind pseudo-anomaly self-fulfils its own wind need), plus any
    // `utility["anomaly:<element>"]` proc surplus at ANOMALY_PROC_SUPPLY per weight (Alice's
    // polarity assaults). Linear in supply — oversupply always helps (two anomaly agents feed
    // Harumasa's generic anomaly scaling a lot; Vivian's ether gives a wind-scaler nothing).
    for (const consumer of team) {
        const cScaling = getEffectiveScaling(consumer);
        for (const [skey, sval] of Object.entries(cScaling)) {
            let element;
            if (skey === 'anomaly') element = null;              // generic: any element
            else if (skey.startsWith('anomaly:')) element = skey.slice('anomaly:'.length);
            else continue;
            const scalingWeight = w(sval);
            if (scalingWeight <= 0) continue;
            let supply = 0;
            for (const u of team) {
                // Lumen fills no anomaly gauge (Attribute Mutation morphs damage, not buildup),
                // so a lumen agent supplies no anomaly quantity — not even to itself. This is why
                // Remielle's `scaling.anomaly` is fed by teammates alone, matching the Luminize
                // rebound it models.
                if (!isNativeLumen(u)
                    && getEffectiveRoles(u).includes('anomaly')
                    && (element === null || getElement(u) === element)) supply += 1;
                for (const [ukey, uval] of Object.entries(u.mechanics?.utility || {})) {
                    if (!ukey.startsWith('anomaly:')) continue;
                    if (element !== null && ukey.slice('anomaly:'.length) !== element) continue;
                    supply += ANOMALY_PROC_SUPPLY * w(uval);
                }
            }
            if (supply <= 0) continue;
            const bonus = ANOMALY_ELEMENT_MULT * scalingWeight * supply;
            consumerScores.set(consumer.name, (consumerScores.get(consumer.name) || 0) + bonus);
            if (debug) console.log(`    Anomaly(${element ?? 'any'}): ${consumer.name} +${bonus.toFixed(1)} (${supply} anomaly source(s))`);
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
        // Armorer damage-lever dependency (dedicated, strong) — see ARMORER_LEVER_MISS_UTIL.
        // Graded by total lever supply rather than a yes/no CR check, so stacked defense shred
        // counts for what it is. Applied to every armorer, buff-carrying or not: Claret has a
        // buff of her own now, and must not fall out of this check because of it.
        if (isArmorer(unit)) {
            const supply = getArmorerLeverSupply(unit, team);
            const leverUtil = ARMORER_LEVER_MISS_UTIL + (1 - ARMORER_LEVER_MISS_UTIL)
                * Math.min(1, supply / ARMORER_LEVER_FULL);
            logSum += ARMORER_LEVER_WEIGHT * Math.log(Math.max(leverUtil * leverUtil, 0.01));
            totalWeight += ARMORER_LEVER_WEIGHT;
            if (debug) console.log(`    Armorer levers: ${unit.name} supply=${supply.toFixed(2)} util=${leverUtil.toFixed(2)}`);
        }
        const buffs = unit.mechanics?.buffs || {};
        const debuffs = unit.mechanics?.debuffs || {};
        const utility = unit.mechanics?.utility || {};
        const hasBuffContributions = Object.keys(buffs).length > 0 || Object.keys(debuffs).length > 0
            || (!isDPS(unit) && NEED_FULFILLMENT_KEYS.some(k => w(utility[k]) > 0))
            || isStun(unit);
        // Needs are evaluated for EVERY unit, whether or not it also supplies buffs. A unit
        // that provides something still consumes something: a support can depend on disorders
        // exactly the way a hypercarry does. Gating this on "supplies nothing" used to mean a
        // single token weight-1 buff silently switched off the whole consumer-side evaluation
        // — including the wasted-vortex check below — and was worth ~90-105 points.
        let chargedForNeeds = false;
        {
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
                // A disorder is a team-wide event on the target, so ANY source satisfies ANY
                // consumer — this unit's own reaction, two OTHER teammates cycling elements
                // without it, or a teammate generating polarity disorders solo. This used to
                // test the unit's own `hasDisorder` and then fall through to a teammate's
                // `utility.disorders`, which missed the middle case entirely: a consumer that
                // is not itself part of the cycling pair read as unmet on a team swimming in
                // disorders. Latent on the current roster (both `scaling.disorders` units are
                // anomaly agents) but wrong, and it is the same supply the L4 need channel
                // now prices — one measure, consulted in both places.
                if (key === 'disorders') {
                    if (getDisorderSupply(unit, team, twReactions) > 0) needsMet++;
                    // Skip the generic supplier scan: it can only see annotations, never
                    // element cycling, so the supply above is the whole answer for this key.
                    continue;
                }
                for (const supplier of team) {
                    if (supplier === unit) continue;
                    const supplyWeight = Math.max(
                        w(supplier.mechanics?.buffs?.[key]),
                        w(supplier.mechanics?.debuffs?.[key]),
                        w(supplier.mechanics?.utility?.[key])
                    );
                    if (supplyWeight > 0) { needsMet++; break; }
                }
            }
            // Native anomaly tag, not the effective role: this charges a unit for its own
            // anomaly output going nowhere, which only makes sense when anomaly IS its job.
            // A stunner who picks anomaly up as a pseudo-role (Roxy) is valued as a wind
            // ENABLER for teammates who scale off it, not as a reaction generator herself.
            // Native lumen is exempt for a stronger version of the same reason: it cannot
            // react at all, so there is no output going nowhere to charge for. Remielle's
            // value is the Luminize rebound off TEAMMATE procs, priced in the anomaly-quantity
            // channel by `scaling.anomaly`. Without this every lumen team pays a cohesion
            // penalty for a mechanical impossibility.
            if (hasSubDPSRole(unit) && unit.tags.includes('anomaly') && !isNativeLumen(unit)) {
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
                chargedForNeeds = true;
            }
        }
        // A unit that is EXPECTED to supply something (scaling.buffs > 0 — supports and
        // defense by default, stunners at 2, or an explicit override like SAnby's 3) but
        // supplies nothing at all is on the wrong team entirely. Keyed off scaling.buffs
        // rather than role so the data stays the single source of truth.
        if (!hasBuffContributions) {
            if (getScalingBuffs(unit) > 0) {
                const weight = 1.0;
                logSum += weight * Math.log(0.01);
                totalWeight += weight;
            }
            continue;
        }
        // scaling.buffs === 0 means "whether this unit's buffs land is not part of its job"
        // (Lycaon's ice debuff, Claret's own buff). computeBuffUtilization returns a flat 1.0
        // for these, and that neutral term is load-bearing: it is how a clean unit vouches for
        // the team in the weighted average. Keep it — but never let it wash out the SAME unit's
        // needs penalty above, which is how a token weight-1 buff on Velina or Vivian used to
        // cancel the wasted-vortex charge.
        if (getScalingBuffs(unit) === 0) {
            if (!chargedForNeeds) {
                const neutralWeight = isDPS(unit) ? 0.5 : 1.0;
                logSum += neutralWeight * Math.log(1.0);
                totalWeight += neutralWeight;
            }
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
        // How much a whiff matters is a property of the unit's kit, not its role tag.
        // scaling.buffs already carries that (support/defense 3, stun 2, DPS 0, explicit
        // overrides win), so a DPS who genuinely depends on landing her buffs — SAnby, who
        // cannot reach her ceiling without an aftershock consumer — is charged like the
        // supplier she is instead of getting the DPS discount.
        // Only units with scaling.buffs > 0 reach here. A DPS that opted in via an explicit
        // override (SAnby) still takes the lighter DPS weighting — the severity of her whiff
        // is already applied inside computeBuffUtilization, which damps by scaling.buffs/3;
        // charging it again here would double-count it.
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

// Charged once per (unit, avoided-role teammate) pair. Sized so that a support who is the
// wrong tool for the archetype falls clearly below every support who is the right one, while
// the team stays legal and scoreable: Nangong/Yixuan/Sunna lands beneath Nangong/Yixuan/Nicole
// rather than vanishing from the corpus.
const ROLE_AVOID_PENALTY = -85;

function checkSynergyAvoid(team, { lenient = false, debug = false } = {}) {
    let penalty = 0;
    for (const unit of team) {
        const avoidList = unit.synergy?.avoid || [];
        for (const teammate of team) {
            if (teammate === unit) continue;
            // Matches a unit NAME or a ROLE/TAG, the same way synergy.units and synergy.tags
            // pair up on the positive side. A role entry states that a unit is mechanically
            // wrong for a whole archetype rather than for one teammate: Sunna's kit is stun
            // infrastructure plus an ATK buff, and on a rupture carry the ATK arrives at a
            // third while the stun contribution is redundant beside the stunner she had to
            // bring to join the team at all. There is no rupture team she belongs on.
            if (avoidList.includes(teammate.name)) {
                if (debug) console.log(`  AVOID: ${unit.name} explicitly avoids ${teammate.name}`);
                if (!lenient) return -1;
                return -200;
            }
            // A ROLE avoid is a different claim from a unit avoid, and gets a different answer.
            // Naming a unit says these two do not function together at all, and disqualifies.
            // Naming a role says this unit is the wrong tool for that archetype — a matter of
            // degree, not legality. Sunna on a rupture carry is a bad team, not an impossible
            // one; it is nothing like running a fire team into a fire-resistant boss.
            const avoidedRole = teammate.tags.find(tag => avoidList.includes(tag));
            if (avoidedRole) {
                if (debug) console.log(`  AVOID: ${unit.name} is the wrong tool for a ${avoidedRole} carry (${teammate.name}): ${ROLE_AVOID_PENALTY}`);
                penalty += ROLE_AVOID_PENALTY;
            }
        }
    }
    return penalty;
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export function scoreTeamForBoss(team, boss, options = {}) {
    // `trace`, when supplied, is an object this call fills with the per-layer contributions.
    // It is pure observability — nothing read back out of it affects the score — and exists so
    // `score-dump.mjs` can attribute a score movement to a layer without re-running `--debug`
    // team by team.
    const { lenient = false, debug = false, trace = null } = options;

    // Lumen units morph their damage to a teammate's element via Attribute Mutation.
    // Try each possible morph combination and return the highest score — the player will
    // naturally order their team for the optimal outcome. The search runs silently and, under
    // debug, the WINNING combination is then re-scored with the trace on, so a debug score for a
    // lumen team matches its real score. `isUnmorphedLumen` is what terminates the recursion:
    // once `_morphedElement` is assigned (a real element, or null when there is nothing to morph
    // to) the sentinel goes false while `isNativeLumen` stays true, so every lumen RULE still
    // applies on the inner pass — which is the whole of issue 6.
    const lumenUnits = team.filter(isUnmorphedLumen);
    if (lumenUnits.length > 0) {
        const morphOptions = lumenUnits.map(u => getPossibleMorphElements(u, team) ?? [null]);
        let bestScore = -Infinity;
        let bestCombo = null;
        const tryMorphCombinations = (idx) => {
            if (idx === lumenUnits.length) {
                const s = scoreTeamForBoss(team, boss, { ...options, debug: false, trace: null });
                if (s > bestScore) {
                    bestScore = s;
                    bestCombo = lumenUnits.map(u => u._morphedElement ?? null);
                }
                return;
            }
            const unit = lumenUnits[idx];
            const targets = morphOptions[idx];
            // A lumen unit with no non-lumen teammate has nothing to morph to. Assigning null
            // still clears the sentinel (getElement falls back to the native `lumen` tag via
            // `??`), which is what stops this from recursing forever.
            for (const el of targets.length > 0 ? targets : [null]) {
                unit._morphedElement = el;
                tryMorphCombinations(idx + 1);
            }
            delete unit._morphedElement;
        };
        tryMorphCombinations(0);
        if (bestScore === -Infinity) return -1;
        // A trace is re-run on the WINNING combination for the same reason debug is: a trace of
        // whichever morph happened to be tried last would not describe the score returned.
        if (!debug && !trace) return bestScore;
        lumenUnits.forEach((u, i) => { u._morphedElement = bestCombo[i]; });
        const traced = scoreTeamForBoss(team, boss, options);
        lumenUnits.forEach(u => { delete u._morphedElement; });
        return traced;
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
        // isNativeLumen, not the morph sentinel: this line runs on the TRACED pass, where the
        // sentinel is already false. Reading tags is what makes the winning target visible.
        const lumenLabels = team.filter(isNativeLumen)
            .map(u => `${u.name}→${u._morphedElement ?? '(native)'}`);
        if (lumenLabels.length > 0) console.log(`Lumen morph: ${lumenLabels.join(', ')}`);
    }

    // `_morphedElement` is deliberately NOT cleared here — the morph search above owns its whole
    // lifecycle. Clearing it from the inner pass wiped an outer lumen unit's target mid-search
    // whenever a team held two of them.
    const cleanupRoles = () => {
        for (const u of team) {
            delete u._activatedRoles;
            delete u._resolvedDamage;
        }
    };

    // Layer 1: Disqualifications
    const disq = checkDisqualifications(team, boss, debug);
    if (disq < 0) { cleanupRoles(); if (trace) trace.disqualified = true; return disq; }

    // Synergy avoid check (near-disqualification)
    const avoidResult = checkSynergyAvoid(team, { lenient, debug });
    if (avoidResult === -1) { cleanupRoles(); if (trace) trace.disqualified = true; return -1; }
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

    // Burst window contention. DELIBERATELY ITS OWN TERM rather than folded into field time:
    // field time is about who is standing on the screen, and greed is about who needs the burst
    // window. They are different questions and this one must be traceable and removable on its own.
    const contention = getBurstContention(team);
    const contentionAdj = contention * MULT.GREED_CONTENTION;
    score += contentionAdj;
    if (debug && contention > 0) {
        const who = team.filter(u => getGreed(u) > GREED_CONTENTION_FLOOR)
            .map(u => `${u.name}(${getGreed(u)})`).join(' + ');
        console.log(`    Burst window contention: ${who} → ${contentionAdj.toFixed(1)}`);
    }

    // Layer 2: Inherent Quality
    const l2 = scoreInherentQuality(team, { lenient, debug, boss });
    score += l2;

    // Layer 3: Boss Matchup
    const bossResult = scoreBossMatchup(team, boss, { lenient, debug });
    if (bossResult.disqualified) { cleanupRoles(); if (trace) trace.disqualified = true; return -1; }
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
    const l5 = scoreAdditionalSynergies(team, debug);
    score += l5;

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

    if (trace) {
        trace.disqualified = false;
        trace.base = baseScore;
        trace.avoid = avoidResult;
        trace.structure = structureScore;
        trace.fieldTime = fieldTimeAdj;
        trace.contention = contentionAdj;
        trace.l2 = l2;
        trace.l3 = bossResult.score;
        trace.l4raw = rawL4;
        trace.l4 = adjustedL4;
        trace.l5 = l5;
        trace.raw = rawScore;
        trace.teamwork = teamwork;
        trace.final = score;
    }

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
