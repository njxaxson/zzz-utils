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
    // Rate for a supplier BUFFING a damage type the consumer deals — Orphie's
    // `buffs.aftershock` landing on Trigger's `damage.aftershock`. This is a BUFF channel, not a
    // provision or need channel: the supplier side reads `buffs`, the consumer side reads `damage`,
    // and no `scaling.<type>` is involved anywhere. It was called DAMAGE_NEED, and that name plus
    // the `need(damage:...)` debug label made it read like the provision channel twice over — do
    // not rename it back.
    DAMAGE_TYPE_BUFF: 3,
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
    // Rate for a chain-damage BUFF (`buffs.chains`), as opposed to the provision above.
    // Deliberately its own dial rather than borrowing DAMAGE_TYPE_BUFF: Koleda is the only unit in
    // the roster that buffs chain attacks, so this constant moves her and nobody else, which is
    // what makes it safe to tune directly against an owner ordering. See CHAIN buff pricing in
    // scoreBaselineAffinity and internals §Rl.
    CHAINS_BUFF: 8,
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
// Crit damage on an anomaly agent: mostly, but NOT entirely, wasted. Anomaly damage does not
// crit, so the buff only reaches whatever direct damage the agent does on the side. The owner
// described this as "like ATK buffs on rupture" and put it near 15%, then ruled that the 30%
// already in the engine should stand — the important property is that it is NOT zero, and the
// exact figure is not worth a corpus-wide move. Recorded 2026-09-01.
//
// Used in BOTH tables that price crit damage: `resolveBaselineWeight`, which sets the L4 pair
// weight, and `getBuffRelevance`, which sets cohesion relevance. They independently held 0.3 and
// are now tied together so they cannot drift.
//
// The exception is DECLARED, not inferred: an anomaly agent that annotates `scaling.cd` is
// saying it genuinely wants crit damage, and the short-circuit at the top of the `cd` case
// catches it before this applies. Miyabi carries `cr: 3, cd: 3` and so reads 100%, which is
// correct — she cares a lot about crit damage. Do not special-case her by name; annotate the
// unit instead.
const ANOMALY_CRIT_DMG_EFFICIENCY = 0.3;

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
// See documentation/data-model/damage-and-burst.md for the full relative-damage table.
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
// for 26 of 60 units; see documentation/engine/ultimates-two-channel.md.
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
// documentation/data-model/damage-and-burst.md), and each axis has exactly one home:
//   frequency  `damage['ultimate:double']`       -> throughput, via getMaxBurstWeight above
//   magnitude  `damage['ultimate:strong'|'weak']` -> the PROVISION channel, via this table
//   scaling    `mechanics.scaling.ultimates`     -> the NEED channel, annotated values only
// Do not collapse them. Magnitude and frequency used to be manufactured into the need
// channel, which fabricated an ultimate need for every primary DPS and paid twice for the
// same free ultimate; see documentation/engine/ultimates-two-channel.md.
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
// NEED keys, and they are a SEPARATE NAMESPACE from the damage keys — plural here, singular
// there. `ablooms` reads `scaling.ablooms` and is declared by nobody, so it is dormant; the live
// abloom channel is the singular `abloom`, a `damage` key, matched against a supplier's
// `buffs.abloom` by the damage-type loop in scoreNeedFulfillment (Promeia's `buffs.abloom: 3` into
// Velina's `damage.abloom: 2` is 18 points). `vortex` is the same shape: `buffs.vortex` is priced
// via MULT.VORTEX_BUFF, `scaling.vortex` is declared by nobody. DO NOT "fix" the plurals to match
// the damage keys — they are not typos, and renaming them would not wire anything up, because the
// need side reads `scaling.*` and no unit declares `scaling.abloom` either. The real hazard runs
// the other way: a future unit declaring `scaling.abloom` intending a need would be silently
// ignored.
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
// See documentation/engine/ultimates-two-channel.md, before changing this.
const NATURALLY_AVAILABLE_NEEDS = new Set(['ultimates', 'chains']);
// Provision keys whose `buffs.<key>` form means "multiply this damage", NOT "provide this".
// Only the buff form is redirected; `utility.<key>` and `debuffs.<key>` stay provisions.
const PROVISION_KEYS_BUFFED_AS_DAMAGE = new Set(['chains']);
// HOW MUCH AN UNMET NEED COSTS, as a function of the weight the unit declared.
//
// `scaling.<key>: N` says how much the unit DEPENDS on that key, and the cohesion charge used
// to ignore N entirely: any weight >= 1 counted as one whole unmet need. That flattened two
// very different statements. Ye Shunguong's `veils: 2` is a design gate — without Sunna or
// Zhao she is severely hamstrung, and the full charge is right. Aria's ether-veil scaling is a
// BONUS for pairing her with Nangong or Sunna, better with both, and charging her the same as
// YSG cost `Aria/Remielle/Velina` 13% of its cohesion for a missing bonus.
//
// Convex on purpose (owner: weight 1 or 2 should not be penalised nearly as much as weight 3),
// so the curve separates "this team does not function" from "this team misses a bonus":
//
//   weight 1 -> 0.11    weight 2 -> 0.44    weight 3 -> 1.00
//
// Feeds BOTH sides of the reception ratio, so a unit with several needs of differing weight is
// judged on how much of its declared dependence is covered rather than on a headcount.
// Reads the COERCED WEIGHT, so `true` behaves as weight 1. That is the data model's own
// convention — documentation/data-model/scaling.md: `true`/`1` = minor, `2` = strong, `3` = defining — and
// the contract wins. An interim version special-cased `true` to full severity on the theory
// that a boolean means "depends on this" without grading; that contradicted the documented
// scale and is the reason issue 15 existed. If a unit's need is genuinely defining, the data
// should say `3`, not `true`.
const NEED_SEVERITY_EXPONENT = 2;
function needSeverity(weight) {
    return Math.min(1, Math.pow(weight / 3, NEED_SEVERITY_EXPONENT));
}
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

// "Can this unit's damage be resisted?" — a DPS role OR an active `subdps` pseudo-role.
// DELIBERATELY NARROW: used only by the element-resistance disqualification in L1, NOT as a
// general widening of isDPS. Norma is tagged `stun` with an active `subdps` pseudo-role, so
// isDPS(Norma) is false and she used to survive a boss that resists fire on nothing but the
// flat -80 stunner penalty. That is wrong for her specifically: a pure stunner's job is the
// stun window and survives a resisted element, but a subdps IS a damage dealer and her value
// craters. See the note above isBurstDPS for why DPS_ROLES itself must not absorb `subdps` —
// ultimate provision is limited to one primary carry and would break.
function isDamageDealer(unit) {
    return isDPS(unit) || hasSubDPSRole(unit);
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
//   { provisions }          same identifier forms as `hasUnit`, but also satisfied by a unit
//                           that merely PROVISIONS the need rather than embodying it — a
//                           `utility["<role>:<element>"]` surplus (e.g. Roxy's wind-anomaly
//                           procs) counts alongside an actual effective-role match (Velina)
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

// Like `unitMatchesIdentifier`, but also satisfied by a unit that merely PROVISIONS the
// identifier as a `utility["<role>:<element>"]` surplus, without embodying the role itself
// (e.g. Roxy provisions "anomaly:wind" via utility while being a stunner, not an anomaly agent).
function unitProvidesIdentifier(u, ident) {
    if (unitMatchesIdentifier(u, ident)) return true;
    return w(u.mechanics?.utility?.[ident]) > 0;
}

function evaluatePredicate(when, ctx) {
    if (!when) return true;
    if (when.hasUnit !== undefined) return (ctx.team || []).some(u => unitMatchesIdentifier(u, when.hasUnit));
    if (when.notPresent !== undefined) return !(ctx.team || []).some(u => unitMatchesIdentifier(u, when.notPresent));
    if (when.provisions !== undefined) return (ctx.team || []).some(u => unitProvidesIdentifier(u, when.provisions));
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
        || c.when.provisions !== undefined
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
        // documentation/engine/ultimates-two-channel.md.
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
            if (roles.includes('anomaly')) return ANOMALY_CRIT_DMG_EFFICIENCY;
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
 * channel; see documentation/engine/design-premise.md.
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

// ============================================================================
// ARCHETYPE FIT  (mechanics.archetypes)
// ============================================================================
//
// The engine spent eight attempts trying to DERIVE whether a support fits a team from its buff
// list, and a ratio over a support's own kit cannot separate "wrong tool" (Yuzuha's anomaly kit
// on a rupture carry) from "narrow but right" (Fiona lands one buff and is tier zero). So the
// answer is DECLARED instead: `mechanics.archetypes = { intended: [...], avoid: [...] }` names the
// carry archetypes a support is built for and the ones it is wrong for. Unlisted archetypes, and
// units with no annotation at all, are neutral.
//
// This is a deliberate, documented departure from the mechanics-emergent premise (see CLAUDE.md
// and documentation/data-model/declared-archetypes.md). It is applied as a SEPARATE additive term — it must never feed the
// cohesion multiplier, or the same judgement is charged twice, which is the compounding that made
// every earlier cohesion change violent.

// A team is built around its PRIMARY carry — the highest-value real DPS. Owner: "we don't build
// teams around pseudo-DPS agents... even on Miyabi/Vivian/Remielle, Rem is the support agent."
// So a pseudo-anomaly stunner (Nangong) is never the hub; only a unit TAGGED with a DPS role is a
// candidate, and among those the best tier wins (titled, then S-rank breaks ties).
function getPrimaryCarry(team) {
    const carries = team.filter(u => DPS_ROLES.some(r => u.tags.includes(r)));
    if (carries.length === 0) return null;
    return [...carries].sort((a, b) => {
        const ta = a.tier ?? 2.5, tb = b.tier ?? 2.5;
        if (ta !== tb) return ta - tb;
        if (isTitled(a) !== isTitled(b)) return isTitled(a) ? -1 : 1;
        if (isSRank(a) !== isSRank(b)) return isSRank(a) ? -1 : 1;
        return 0;
    })[0];
}

// The carry's own archetype(s): the DPS role tags it actually carries. Clean on every carry —
// exactly one of attack/anomaly/rupture/armorer in the common case.
function carryArchetypes(carry) {
    return DPS_ROLES.filter(r => carry.tags.includes(r));
}

// MONOSHOCK OVERRIDE. `getPrimaryCarry` picks by tier, so a team built around a quirky attacker
// that scales off anomaly procs — not a team built around anomaly reactions — can still label
// `anomaly` whenever its anomaly unit happens to outrank the attacker. That is wrong for
// calibration: monoshock teams belong on attack's scale, because the attacker is genuinely the
// hub. Uses the same definition as the monoshock branch of `scoreTeamStructure` (:2760, "Anomaly +
// Attacker + (Stun|Support)"), but on raw tags rather than activated roles, matching how
// `carryArchetypes` itself reads tags — self-contained and auditable without depending on
// `_activatedRoles` having been populated for this call.
//
// Measured against the full released corpus: 78 teams meet this definition, all 78 currently
// label `anomaly`. Teams that merely CONTAIN an anomaly unit and an attack unit without meeting
// the full predicate (1,103 of them) are ordinary anomaly teams with an attacker along and must
// NOT be overridden — only 78 of those 1,103 qualify here.
function isMonoshockTeam(team) {
    const hasAnomaly = team.some(u => u.tags.includes('anomaly'));
    const hasRupture = team.some(u => u.tags.includes('rupture'));
    if (!hasAnomaly || hasRupture) return false;
    const hasStunOrSupport = team.some(u => u.tags.includes('stun') || u.tags.includes('support'));
    if (!hasStunOrSupport) return false;
    return team.some(u => u.tags.includes('attack') && !!(u.mechanics?.scaling || {}).anomaly);
}

// The team's archetype for CALIBRATION purposes — one of DPS_ROLES, or null when there is no
// primary carry. This is deliberately separate from `carryArchetypes` (which feeds
// `scoreArchetypeFit` and must keep reading the carry's own tags unmodified): calibration needs
// the monoshock override, archetype fit does not, and conflating the two would change what
// `scoreArchetypeFit` charges a monoshock team's supports for.
//
// No unit in the current data carries more than one DPS-role tag, so `carryArchs[0]` is safe;
// the guard below exists so a future data entry that violates this fails loudly instead of
// silently picking whichever tag happens to sort first.
export function getTeamArchetype(team) {
    const carry = getPrimaryCarry(team);
    if (!carry) return null;
    const carryArchs = carryArchetypes(carry);
    if (carryArchs.length === 0) return null;
    if (carryArchs.length > 1) {
        console.warn(`getTeamArchetype: ${carry.name} carries multiple DPS-role tags ` +
            `(${carryArchs.join(', ')}) — this breaks the calibration archetype assumption.`);
    }
    if (carryArchs[0] === 'anomaly' && isMonoshockTeam(team)) return 'attack';
    return carryArchs[0];
}

// intended / neutral / avoided. `avoid` wins ties (they should never overlap in the data, but a
// mismatch is the more important claim). A unit with no annotation is always neutral.
function getArchetypeFit(unit, carryArchs) {
    const arch = unit.mechanics?.archetypes;
    if (!arch || carryArchs.length === 0) return 'neutral';
    const avoid = arch.avoid || [];
    const intended = arch.intended || [];
    if (carryArchs.some(a => avoid.includes(a))) return 'avoided';
    if (carryArchs.some(a => intended.includes(a))) return 'intended';
    return 'neutral';
}

// A unit that plays support infrastructure — the population whose archetype fit we judge, and log
// even when unannotated so a missing annotation is visible rather than silently neutral.
function isSupportLike(unit) {
    return unit.tags.includes('support') || unit.tags.includes('defense') ||
        (unit.mechanics?.pseudoRole || []).some(e => (typeof e === 'string' ? e : e?.role) === 'support');
}

// `intended` is ZERO on purpose. Fitting the carry's archetype is the BASELINE a support is
// expected to meet, not a bonus to be stacked — the owner's rarity-vs-importance point one level
// up. Measured: a positive intended bonus is not load-bearing for any fixture judgement (the avoid
// penalty carries all the discrimination) and it inflates well-matched teams past their ceilings
// (TESTs 14, 18). So only the mismatch is priced.
//
// `avoid` = -40 is calibrated, not a guess. Two live constraints bracket it tightly: TEST 15
// (`Nangong/Yixuan/Sunna` <= 265) needs the penalty deep enough, and TEST 25
// (`Yixuan/Lucia/Yuzuha` >= 130 on Wandering Hunter) needs it shallow enough. -40 lands both
// (261.1 and 130.7) with the fixture at 10/11. This term is scaled by the teamwork multiplier,
// so its effective bite is smaller on already-incohesive teams — matching the existing
// `synergy.avoid` role penalty it supersedes.
const ARCHETYPE_INTENDED_BONUS = 0;
const ARCHETYPE_AVOID_PENALTY = -40;

// Total archetype adjustment for a team, plus its debug trace. Applied once per support against
// the PRIMARY carry only. Returns 0 (and logs nothing scored) when there is no real carry.
function scoreArchetypeFit(team, debug) {
    const carry = getPrimaryCarry(team);
    if (debug) console.log('\n  ARCHETYPE FIT');
    if (!carry) {
        if (debug) console.log('    no primary carry — skipped');
        return 0;
    }
    const carryArchs = carryArchetypes(carry);
    let total = 0;
    for (const unit of team) {
        if (unit === carry) continue;
        if (!isSupportLike(unit) && !unit.mechanics?.archetypes) continue;
        const fit = getArchetypeFit(unit, carryArchs);
        let delta = 0;
        if (fit === 'intended') delta = ARCHETYPE_INTENDED_BONUS;
        else if (fit === 'avoided') delta = ARCHETYPE_AVOID_PENALTY;
        total += delta;
        if (debug) {
            const tag = unit.mechanics?.archetypes ? '' : ' (unannotated)';
            const sign = delta > 0 ? `+${delta}` : `${delta}`;
            console.log(`    ${unit.name} → ${carry.name} [${carryArchs.join('/') || 'none'}]: ` +
                `${fit}${delta ? ` ${sign}` : ''}${tag}`);
        }
    }
    return total;
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
            if (roles.includes('anomaly')) return ANOMALY_CRIT_DMG_EFFICIENCY;
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
// RARITY IS NOT IMPORTANCE. Almost every S-rank support buffs ATK at weight 3, so ATK is not
// what DISCRIMINATES between two supports — you pick Yuzuha over Astra on crit damage or on
// anomaly buffs, never on ATK. But that makes ATK common, not unimportant: it is the baseline
// every support is paid for, and a support whose ATK buff does not land has had the rug pulled
// out. Owner, 2026-09-01: "the baseline is 'I buff ATK and X,Y,Z' and you're picking which
// support is best based on XYZ because everyone is offering ATK."
//
// So a baseline buff landing answers "is this support doing their job?" — which is the question
// the flagship test exists to ask — even when it is not the unit's largest offering by damage
// weight. `sheer` is the rupture-side equivalent: Lucia carries `sheer: 3` and no ATK at all,
// doing "the comparative thing for rupture agents".
//
// Weight 3 is the bar, and it is load-bearing in both directions. Lucia's `sheer: 3` is a real
// baseline, so on an attack carry like Ye Shunguong it does NOT land and she keeps her penalty —
// that is the Lucia/YSG "wrong tool" case and it must stay broken. Pan Yinhu's `sheer: 2` is a
// token amount, below the bar, so he stays useless on an attack team.
const BASELINE_BUFF_KEYS = new Set(['atk', 'sheer']);
const BASELINE_BUFF_MIN_WEIGHT = 3;

const FLAGSHIP_BAND = 0.6;

// How much of a buff has to actually reach a consumer for it to count as having landed.
// Half: a buff arriving at RUPTURE_ATK_EFFICIENCY (0.33) has not found a home, it has been
// tolerated. A buff reaching only non-DPS teammates, at the 0.5 discount, still counts.
const FLAGSHIP_LAND_THRESHOLD = 0.5;

// What a unit is worth when the thing that DEFINES it lands on nobody. Lucia without her
// sheer buff is not a diminished T0, she is a worse Koleda; Yuzuha on a rupture team is not a
// slightly-off anomaly support, she is a wasted slot. Set low on purpose — this is where
// opportunity cost bites.
const FLAGSHIP_MISS_PENALTY = 0.4;

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
        // `dpsRel` is the arm's reach to an actual DAMAGE DEALER, no half-credit — the flagship
        // test needs it. Buffing the ice STUNNER's element is not the same as buffing the carry's:
        // judged on `rel`, Soukaku's ice arm scored exactly 0.50 on Lycaon/Yixuan/Soukaku through
        // ice-elemental Lycaon and falsely passed the flagship band.
        return { key, bw, rel: Math.max(dpsRelevance, otherRelevance * (hasDPS ? 0.5 : 1.0)), dpsRel: dpsRelevance };
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

    // A unit that is PLAYING support is judged as one, even when it also carries a DPS tag.
    // Remielle is tagged anomaly but is the support slot on a triple-anomaly team; the branch
    // below discards every "generic" buff (atk, cr, cd, dmg...) on the grounds that a carry
    // should not be judged on stat buffs it incidentally carries, and it floors cohesion at 0.65.
    // Both are right for a carry and wrong for her: her conditional ATK buff is not incidental,
    // it is the whole unit. Measured on this branch her cohesion was 100% whether or not the
    // triple-anomaly condition was met, so the engine never asked whether her defining buff
    // landed. Owner: "for damage-dealing calcs she is a subdps... for buff relevance she is
    // support. But generally speaking, support wins."
    //
    // isSupport() reads ACTIVATED roles, so a conditional support pseudo-role only counts when
    // its predicate holds — Cissia routes here only on a team with Seed. Affects exactly three
    // units: Remielle, Orphie, and Cissia-with-Seed.
    if (isDPS(supplier) && !isSupport(supplier)) {
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
    // `declared` marks an offering the unit is BUILT around — see the flagship test below.
    // `relevance` is what actually arrived; `achievable` is what COULD have arrived on this team
    // — the same relevance before any CONDITIONAL GATE (Remielle's ATK curve). They are equal for
    // every offering except a gated one, and the gap between the two is the only thing `fit`
    // charges. See the fit computation for why.
    const offer = (magnitude, relevance, declared = false, baseline = false, achievable, dpsRel) => {
        if (magnitude > 0) offerings.push({
            magnitude, relevance, declared, baseline,
            achievable: achievable === undefined ? relevance : achievable,
            // Reach to an actual DAMAGE DEALER, with NO half-credit for a non-carry teammate. Only
            // the flagship test consults it: a buff that "lands" on the stunner is not this support
            // doing its job for the carry. Defaults to `relevance` for offerings with no separate
            // carry reach (provisions, quick assists).
            dpsRel: dpsRel === undefined ? relevance : dpsRel,
        });
    };
    let coreWeight = 0;
    let coreEffective = 0;
    let coreImpact = 0;

    // Element buffs are a MENU, not separate offerings. Lighter carries fire AND ice so that
    // one of them matches whatever the team runs; charging him for the arm with no target
    // penalises the exact thing that makes him flexible. They are collected here and settled
    // together below, after the ordinary buffs.
    const elementMenu = [];

    // A team-scoped conditional that has not been unlocked is a MISS, not a smaller offering.
    // `resolveMapForUtil` hands back the value the team actually unlocked, so measuring THAT
    // value only ever asks "did the 2 land?" — to which the answer is trivially yes. Remielle's
    // cohesion was 100% whether or not her triple-anomaly condition was met, which is the engine
    // declining to ask whether her defining buff landed at all.
    //
    // So measure the buff at its FULL size and treat the shortfall as relevance that never
    // arrived. Her ATK buff is offered at 4 with half of it landing — the shape of the real
    // effect (owner: 1600 ATK down to 700 is 45%, which we round to 50%).
    //
    // Team-scoped only. A recipient-scoped conditional is already routed to its best consumer by
    // `resolveMapForUtil` and is not a shortfall at all — it is a buff correctly aimed elsewhere.
    const conditionalReach = {};
    for (const [key, spec] of Object.entries(supplier.mechanics?.buffs ?? {})) {
        if (!isTeamScopedConditional(spec)) continue;
        const full = maxConditionalValue(spec);
        if (full <= 0) continue;
        conditionalReach[key] = { full, ratio: Math.min(1, w(buffs[key]) / full) };
    }

    for (const [key, value] of Object.entries(buffs)) {
        if (COHESION_EXCLUDED_BUFFS.has(key)) continue; // dmg/vortex: flat L4 only, not cohesion
        const reach = conditionalReach[key];
        const bw = reach ? reach.full : w(value);
        // How much of a locked conditional actually reaches the team. 1 for everything else.
        const reachFactor = reach ? reach.ratio : 1;
        if (bw <= 0) continue;
        // Weight-1 element buffs (Nicole's ether) stay on the auto-credit path below, which
        // never consults relevance — routing them through the menu would change a unit this
        // phase is not about.
        if (bw >= 2 && ELEMENTS.includes(key) && !reach) {
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
            effectiveWeight += bw * impact * reachFactor;
            // Auto-credited, so conversion is full (1); only the gate limits delivery. achievable
            // is 1, delivered is reachFactor — the gap is the gated shortfall.
            offer(bw * impact, reachFactor, !!reach, false, 1);
            continue;
        }

        // "Did this buff find a user?" — a MAX over the team, never an average.
        //
        // Every buff key asks the same question: does anybody here convert this into damage. It
        // is not "how much of the team benefits", so dividing by the roster size is wrong. The
        // stat keys always did this correctly; the rest averaged, and that quietly punished a
        // support for the COMPOSITION OF HER OWN TEAM. Astra's generic damage buff is her largest
        // offering and `getBuffRelevance('dmg')` returns `dps ? 1 : 0` under a comment reading
        // "never misses on any DPS" — yet on Norma/Evelyn/Astra it was charged 0.50, because
        // Evelyn returned 1, Norma the stunner returned 0, and the two were averaged. She lost
        // 38 points on average across 5,286 team-boss rows for having a stunner on the team.
        //
        // Checked per key rather than blanket, the way issue 5 insists. Every key that reached
        // the averaging path — dmg, aftershock, disorders, abloom, def — is a per-consumer
        // capability question with exactly one natural answer: did ANY consumer want it. There
        // was no correct member of that path.
        //
        // A buff landing only on a non-carry is still worth half, which is what the DPS/other
        // split below encodes; that shape is unchanged, it is just applied to every key now.
        let dpsRelevance = 0;
        let otherRelevance = 0;
        for (const consumer of consumers) {
            const rel = getBuffRelevance(key, consumer);
            if (isDPS(consumer)) dpsRelevance = Math.max(dpsRelevance, rel);
            else otherRelevance = Math.max(otherRelevance, rel);
        }
        const hasDPS = consumers.some(c => isDPS(c));
        // conversionRel = how well this buff converts on this carry (the Fiona/screwdriver
        // question, no gate). maxRelevance = that, gated. achievable is conversionRel, delivered
        // is maxRelevance, so a partly-CONVERTING buff (Astra's cd at 0.30 on anomaly) contributes
        // equally to both sums and does not drag fit, while a partly-GATED buff still does.
        const conversionRel = Math.max(dpsRelevance, otherRelevance * (hasDPS ? 0.5 : 1.0));
        const maxRelevance = conversionRel * reachFactor;
        effectiveWeight += bw * impact * maxRelevance;
        offer(bw * impact, maxRelevance, !!reach,
              BASELINE_BUFF_KEYS.has(key) && bw >= BASELINE_BUFF_MIN_WEIGHT, conversionRel,
              dpsRelevance * reachFactor);
        // Only the stat keys feed the "core" accumulators; that distinction is about which buffs
        // constitute a support's central stat package, not about how relevance is measured.
        if (STAT_BUFF_KEYS.has(key)) {
            coreWeight += bw;
            coreEffective += bw * maxRelevance;
            coreImpact += bw * maxRelevance * BUFF_IMPACT[key];
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
            offer(arm.bw * armImpact, arm.rel, false, false, undefined, arm.dpsRel);
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
                //
                // `chains` is the SECOND key in that family, fixed 2026-09-01. Owner: "Of course
                // anomaly teams can use free chains; every DPS loves a free chain." Judged by
                // declared need it was landing almost nowhere — only Evelyn and Sigrid annotate
                // `scaling.chains`, so Astra's and Norma's chain provision read as a TOTAL MISS on
                // every team without one of those two. Astra appears in 5,286 team-boss rows.
                //
                // The declared scalers are not being short-changed by this: they already earn the
                // extra through the L4 need channel. This is only about cohesion no longer calling
                // a universally-useful provision a mismatch.
                const rel = key === 'ultimates'
                    ? (isDPS(consumer) && !hasSubDPSRole(consumer) && getUltimateMagnitude(consumer) > 0 ? 1 : 0)
                    : key === 'chains'
                    ? (isDPS(consumer) ? 1 : 0)
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
            const hasBeneficiary = consumers.some(c => isDPS(c) && !isStunlessUnit(c));
            // A stunless carry does not make the stunner a bad fit. Ye Shunguong inherits the
            // stun damage multiplier without opening a window herself, so Qingyi's daze finds
            // no consumer — but that is YSG's property, not Qingyi's mismatch, and the freed
            // slot is already priced by the stun-shill credit a stunless team earns. Charging
            // her for it read the game's premier stun unit at 63% on a team she suits, and put
            // her 70 points behind Lycaon, who offers the same package and escapes only
            // because he carries an explicit scaling.buffs override.
            const noOneCanUseStuns = consumers.some(isDPS)
                && consumers.filter(isDPS).every(isStunlessUnit);
            if (!noOneCanUseStuns) {
                totalWeight += dazeContribution;
                effectiveWeight += dazeContribution * (hasBeneficiary ? 1 : 0);
                offer(dazeContribution, hasBeneficiary ? 1 : 0);
            }
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
    // Cohesion asks ONE question: IS THIS UNIT DOING ITS JOB ON THIS TEAM?
    //
    // Not "how much did it bring". That distinction is the whole point of the Fiona/Marissa
    // reasoning and it was nearly lost twice:
    //
    //   Qingyi on YSG/Sunna    delivers 2.0, her one buff lands, it IS her entire job  → fine
    //   Yuzuha on Yixuan/Lucia delivers 1.9, her defining kit lands on nobody          → waste
    //
    // Those two are almost identical in SIZE and opposite in JOB. A measure driven by size
    // scores them the same, which is how a perfectly-employed stunner read 63%. Size is not
    // ignored — it is already paid twice, in the unit's tier credit and in what each of its
    // buffs is worth to each teammate — it simply must not be charged a third time as a
    // team-wide multiplier.
    //
    // The multiplier itself stays, and that is deliberate: a team slot is scarce, so a member
    // who contributes nothing does not merely fail to help, it makes the team bad. That is
    // opportunity cost, and the geometric mean is how the engine expresses it. What changes is
    // only what feeds it.
    //
    //   fit       of the kit this team can use at all, how much is actually arriving
    //   flagship  did the thing that DEFINES this unit find a home
    //
    // Lucia is T0 because of her sheer buff. On Sigrid it misses, so she is delivering
    // Koleda's package — and the flagship collapse is what stops her being paid as a T0 for it.
    // Only what this team can USE is charged. Fiona brings five enormous buffs, four of which
    // have no target on any given team, and she is still tier zero — nobody was ever going to
    // want all five. Charging the misses would punish breadth, which is how a tiny-kit support
    // like Nicole started out-fitting Astra. If NOTHING lands, everything is charged, and the
    // flagship collapse below lands on top of that.
    // FIT IS MEASURED AGAINST WHAT WAS ACHIEVABLE, NOT AGAINST WHAT WAS BROUGHT.
    //
    // `relevance` below 1 had two different causes and the old ratio charged both identically:
    //
    //   CONVERSION EFFICIENCY — Aria converts 30% of a crit-damage buff into damage. Astra
    //   delivered every bit of the 30% that was ever available. She failed at nothing; this is
    //   the Fiona case one step short of a total miss, and archetype fit now judges "wrong tool"
    //   separately, so fit must not also punish it.
    //
    //   AN UNMET GATE — Remielle's ATK unlocks at three anomaly bodies and the team supplied two.
    //   The team WANTED the whole buff and got half. That is a real shortfall and the team's doing.
    //
    // The old form divided delivered magnitude by BROUGHT magnitude over offerings with
    // relevance > 0. That filter is a cliff: a buff the team cannot use at all was dropped as
    // inapplicable and cost nothing, while a buff the team could PARTLY use was charged for the
    // remainder — so making a buff strictly WORSE (relevance 0.30 → 0) raised the team. The acid
    // test failed by 94.6 points on Astra's crit damage.
    //
    // Dividing by ACHIEVABLE removes the cliff by construction. An offering the team cannot use
    // contributes zero to both sums; one it can partly use contributes its share to both. What
    // survives in the gap is exactly the GATED shortfall — the only miss the team is responsible
    // for. No filter, and none is needed. Discrimination that this ratio used to attempt badly now
    // lives in archetype fit (wrong tool) and the flagship test (defining buff missed).
    const chargedAchievable = offerings.reduce((sum, o) => sum + o.magnitude * o.achievable, 0);
    const chargedDelivered = offerings.reduce((sum, o) => sum + o.magnitude * o.relevance, 0);
    const fit = chargedAchievable > 0 ? chargedDelivered / chargedAchievable : 1;

    // A flagship has to SUBSTANTIALLY land, not merely be nonzero. Yuzuha's ATK reaches a
    // rupture carry at a third, and counting that as "my flagship found a home" is how an
    // anomaly support read as a reasonable pick for Yixuan.
    // A DECLARED flagship overrides the size test. A team-scoped conditional is the designer
    // saying "this unit is built around this" — Remielle's ATK curve is gated on three anomaly
    // bodies, and her M6, the highest unlock in the game, exists purely to remove that gate.
    // That is how drastic the difference is, so the gate cannot be judged on damage-weight:
    // ATK is priced cheaply because it scales poorly in general, which makes her defining buff
    // look like a small offering next to her anomaly buff and lets a half-locked Remielle read
    // as a fine fit. When a declared offering exists it decides the flagship test by itself.
    //
    // STRICTLY greater than the threshold: at two anomaly bodies her buff unlocks exactly half,
    // and half is a miss, not a landing. Owner: 1600 ATK down to 700 "is 45%, which we have
    // rounded to 50%" — and "did my flagship buff land? DEFINITIVELY NO."
    const declaredOfferings = offerings.filter(o => o.declared);
    const flagship = offerings.reduce((m, o) => Math.max(m, o.magnitude), 0);
    // A DECLARED flagship still overrides everything — Remielle's gated ATK is decided above and
    // is not rescued by being an ATK buff.
    //
    // Otherwise the flagship has landed if EITHER the unit's baseline buff landed (see
    // BASELINE_BUFF_KEYS) OR something within the damage-weighted band did. Soukaku is why the
    // first clause exists: her data reads `atk: 3, ice: 3`, the two are equally central, but
    // priced by damage the ice buff is 3.00 and the ATK buff 1.77 — so the band asked whether
    // 1.77 >= 0.6 x 3.00 = 1.80 and answered no, BY 0.03. Her ATK buff lands fully on Ye
    // Shunguong and she was charged the full miss penalty anyway. The dead ice arm is the Fiona
    // case: a unit is not punished for carrying something this particular team cannot use.
    // BOTH clauses require reaching an actual DAMAGE DEALER (dpsRel), not a stunner or defence unit
    // at half-credit. The flagship question is "did this support do its job for the CARRY", and the
    // owner's whole reframing was that a support's strongest relationship can be with the STUNNER
    // rather than the carry (Soukaku's ice on Lycaon/Yixuan) — which is not the support fitting the
    // team. A declared conditional still overrides everything; its own relevance already reflects
    // its (recipient-routed) target.
    const baselineLanded = offerings.some(
        o => o.baseline && o.dpsRel >= FLAGSHIP_LAND_THRESHOLD);
    const flagshipLanded = declaredOfferings.length > 0
        ? declaredOfferings.every(o => o.relevance > FLAGSHIP_LAND_THRESHOLD)
        : (baselineLanded || flagship === 0 || offerings.some(
            o => o.magnitude >= FLAGSHIP_BAND * flagship && o.dpsRel >= FLAGSHIP_LAND_THRESHOLD));

    let baseUtil = fit;
    if (!flagshipLanded) baseUtil *= FLAGSHIP_MISS_PENALTY;
    const delivered = effectiveWeight;   // retained for the breakdown; no longer scores anything
    if (out) {
        out.delivered = delivered;
        out.fit = fit;
        out.flagship = flagship;
        out.flagshipLanded = flagshipLanded;
    }

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

    // Resistance reads DAMAGE DEALERS, not just DPS-role units, so a subdps whose element the
    // boss resists is disqualified alongside a primary carry. `isEffectiveSupport` still
    // exempts Remielle and Orphie, who carry a subdps pseudo-role but play as supports.
    const bossResistances = getBossResistances(boss);
    for (const unit of team.filter(isDamageDealer)) {
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
    // A team with NO support/defense agent at all. Its own tier because it is a different and
    // worse failure than merely being unconventional: an unconventional-but-viable team has made a
    // stylistic choice, a supportless team has given up its largest source of damage
    // amplification. The value is only a MAP KEY — structureScore feeds the teamwork multiplier
    // and is never added to the raw score — so -1 costs nothing on its own; the harsher factor in
    // STRUCTURE_FACTOR is the whole effect. Split out 2026-09-01 because the shared 0.85 was not
    // enough to stop `Nangong/Miyabi/Vivian`, whose raw L4 synergy is enormous (234 on Butcher),
    // outranking supported teams the owner places below it.
    NO_SUPPORT: -1,
    // A team with a carry but NO STUNNER, graded by what the carry loses without a stun
    // window. The Starlight Billy / Pan Yinhu case: `Billy/Pan/Lucia` and `Dialyn/Billy/Lucia`
    // both classified CONVENTIONAL at 1.0, so two supports and no stunner earned the identical
    // structural credit as stunner-plus-support, and Pan then won on raw supply (366.1 to
    // 365.8 on Priest). documentation/archetypes/rupture.md already states the rupture archetype as
    // *stunner + rupture DPS + Lucia or Pan Yinhu* — Pan is the SUPPORT slot, not the stunner.
    //
    // Two tiers, not one, per the owner's ordering: an attacker without a stunner is
    // generally bad because an attacker's damage lives inside the stun window; a rupture
    // carry without one is worse than with one but not as bad, and rupture-with-double-support
    // stays clearly ahead of a stunnerless attacker. Anomaly is deliberately absent — anomaly
    // teams lean on reactions rather than burst, so they need supports more than stunners and
    // their existing tiers are correct. A `stunless` carry (Ye Shunguong) never reaches these.
    NO_STUN_RUPTURE: -2,
    NO_STUN_ATTACK: -3,
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
// Demotion is to the dedicated `NO_SUPPORT` tier (was `UNCONVENTIONAL_VIABLE` until 2026-09-01).
// It needed its own factor: at the shared 0.85, `Nangong/Miyabi/Vivian` still outranked supported
// teams the owner places below it, because its raw L4 synergy is big enough to absorb the hit.
// The hit is deliberately large (loses the +35 structure bonus, then -20% on the total).
//
// `isEffectiveSupport || isEffectiveDefense` reads activated pseudo-roles, which is what makes
// Orphie, Remielle, and Cissia-alongside-Seed count as the team's support.
function scoreTeamStructure(team, debug) {
    const classified = classifyTeamStructure(team, debug);
    if (team.some(u => isEffectiveSupport(u) || isEffectiveDefense(u))) return classified;
    // Exemption: in a totalize + double-stun comp the SECOND STUNNER *is* the support. Totalize
    // damage is stun uptime, so a second stunner is feeding the carry's damage the way a support
    // otherwise would. Deliberate, not an oversight.
    if (secondStunnerActsAsSupport(team)) {
        if (debug) console.log('    Structure: ^ kept — no support, but the second stunner serves as one (totalize)');
        return classified;
    }
    // The demotion USED TO BE GATED on the team already classifying CONVENTIONAL_BONUS, which
    // meant a supportless team was scored BETTER for also being unconventional.
    // `Nangong/Alice/Miyabi` classifies as double-anomaly-plus-stunner (UNCONVENTIONAL_VIABLE,
    // 0.85) and so never reached the 0.80 no-support tier: on Fiend it beat
    // `Nangong/Alice/Sunna` 456.9 to 456.5, which is the Alice/Jane/Miyabi family of ranking
    // complaints. The gate is gone; the demotion now applies to every classification.
    //
    // Take the HARSHER of the two factors rather than overriding, so a supportless
    // WILDLY_UNCONVENTIONAL team is not PROMOTED from 0.35 up to 0.80.
    if ((STRUCTURE_FACTOR.get(classified) ?? 0.35) <= STRUCTURE_FACTOR.get(STRUCTURE.NO_SUPPORT)) {
        if (debug) console.log('    Structure: ^ kept — no support, but the classified tier is already harsher');
        return classified;
    }
    if (debug) console.log('    Structure: ^ DEMOTED to NO-SUPPORT tier — no support or defense agent');
    return STRUCTURE.NO_SUPPORT;
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

    // A CARRY THAT DOES NOT WANT THE STUN WINDOW AT ALL. Read off the carry lists rather than
    // assumed to be an attacker: Ye Shunguong is the only stunless unit today and she happens to
    // be `attack`, but nothing stops a rupture or armorer carry being stunless, and such a team
    // must not be charged a no-stunner tier for a window it never wanted. Every other stunless
    // read in the engine is already role-agnostic (`stun-infra` baseline, the recovery-debuff
    // gate, the L3 stun-shill exemption); this was the one place that assumed a role.
    //
    // Anomaly is deliberately EXCLUDED. Anomaly has no no-stun tier to be exempted from, and a
    // stunless anomaly agent would have knock-on effects on reaction cadence that deserve their
    // own decision rather than being swept in here.
    const stunlessCarry = [...attackers, ...ruptureUnits, ...armorerUnits].some(isStunlessUnit);

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

    // Rupture + Stunner + Support/Defense.
    // `nRup === 1`, not `>= 1`: rupture NEVER accepts a second rupture carry (owner ruling —
    // unlike anomaly, which wants two bodies). Both of these branches used `>= 1`, so two
    // rupture carries plus a stunner plus a support scored a full CONVENTIONAL 1.0.
    if (nRup === 1 && nStun >= 1 && nSup >= 1 && nAtk === 0 && nAno === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (rupture + stunner + support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
    }

    // Rupture + 2x Support/Defense — reached only when nStun === 0, because the branch above
    // already claims any rupture team that has a stunner AND a support. So this IS the
    // stunnerless rupture shape, and it must not be CONVENTIONAL: see STRUCTURE.NO_STUN_RUPTURE.
    if (nRup === 1 && nSup >= 2 && nAtk === 0 && nAno === 0) {
        if (stunlessCarry) {
            if (debug) console.log('    Structure: CONVENTIONAL (stunless rupture + double support)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: NO-STUN rupture (rupture + double support, no stunner)');
        return STRUCTURE.NO_STUN_RUPTURE;
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

    // Stunless attacker + 2x Support/Defense (YSG-type compositions).
    // Also reached only when nStun === 0 — the attacker + stunner + support branch at the top
    // claims the rest. A stunless carry is CONVENTIONAL because she does not need the window;
    // an ordinary attacker without one has lost what she scales on, hence NO_STUN_ATTACK
    // rather than the merely-unconventional 0.85 this used to hand out.
    if (nAtk === 1 && nSup >= 2) {
        if (stunlessCarry) {
            if (debug) console.log('    Structure: CONVENTIONAL (stunless attacker + double support)');
            return STRUCTURE.CONVENTIONAL_BONUS;
        }
        if (debug) console.log('    Structure: NO-STUN attacker (attacker + double support, no stunner)');
        return STRUCTURE.NO_STUN_ATTACK;
    }

    // Anomaly + Attacker + (Stun|Support) — Monoshock variant
    // Valid if the attacker has anomaly scaling; boss matchup (Layer 3) handles
    // whether both DPS agents align with weaknesses
    if (nAno >= 1 && nAtk >= 1 && (nStun >= 1 || nSup >= 1) && nRup === 0) {
        // `scaling.anomaly` ONLY. `am` and `ap` are STATS — anomaly mastery and anomaly
        // proficiency — not a statement that the unit's kit runs on anomaly mechanics, and
        // conflating the two let any attacker with a stat line into the monoshock carve-out.
        // The units that genuinely belong here are Harumasa and Sigrid, both of whom declare
        // `scaling.anomaly`. No current attacker qualified on `am`/`ap` alone, so this is a
        // correctness fix with no scoring change today; it stops the next one slipping in.
        const attackerHasAnomalyScaling = attackers.some(u => {
            const scaling = u.mechanics?.scaling || {};
            return !!scaling.anomaly;
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
        // SAME ELEMENT IS NOT INTERACTION. Two attackers of one element used to keep the
        // 0.85 tier on the theory that they share buffs, but two carries of the same element
        // cannot disorder with each other and still cannot both hold the field. Owner ruling:
        // a second attacker is legitimate only when it is explicitly a subdps or a
        // pseudosupport — unlike anomaly, which genuinely wants two bodies.
        // This is what kept `Norma/Ellen/Sigrid` (both ice) and
        // `Nekomata/Ye Shunguong/Sunna` (both physical) mid-ladder. A pseudo-support attacker
        // (Orphie) needs no clause here: the `attackers` filter above already excludes any
        // unit with an active support or defense role.
        if (hasSubDPS) {
            if (debug) console.log('    Structure: UNCONVENTIONAL viable (double attacker, second is a subdps)');
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
    // A SECONDARY dps (a subdps standing beside a primary of the same type) already has its TIER
    // halved below. Its RANK was not halved, which was an inconsistency: the same unit was rated
    // "half a damage dealer" for tier and "a whole premium S-rank" for rank. Vivian beside Miyabi
    // read T1 -> +9 (halved) but still banked the full +22 of S-rank/limited credit.
    const secondaryDPSUnits = new Set();
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
        if (isSecondaryAttacker || isSecondaryAnomaly) secondaryDPSUnits.add(unit);
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
        // NOT halved for a plain secondary DPS, despite the tier halving above. Tried 2026-09-01
        // and reverted: it lowers EVERY Vivian team uniformly, but the Miyabi ladder interleaves
        // them — `Miyabi/Vivian/Remielle` and `Miyabi/Vivian/Astra` must stay ABOVE certain Nangong
        // teams while `Miyabi/Vivian/Yuzuha` must drop BELOW others. A uniform lever cannot change
        // their relative order, so it closed the target gap by 11 and broke 4 other rungs.
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
            // NO PENALTY for an off-element stunner. Removed 2026-09-01.
            //
            // The bonus above is defensible: an on-element stunner's own damage is amplified by
            // the boss's weakness. A symmetric penalty is not — an off-element stunner has not
            // lost anything relative to baseline, he simply does not collect the bonus. Charging
            // both made the swing between two stunners 30 points on a unit whose job is dazing,
            // and that is what reordered Evelyn's stunners on fire-weak Pompey.
            //
            // The evidence: on the NEUTRAL boss, where this term does not fire at all, the ladder
            // is already exactly the owner's — Norma > Dialyn > Lighter > Ju Fufu. On Pompey the
            // ±15 swing lifted Lighter (fire) past Dialyn, which aggregated player statistics say
            // is wrong. A term that is right in its presence and wrong in its magnitude reorders
            // only where it fires, which is the signature to look for.
            //
            // A resisted element still costs 80 above; that is a real damage loss, not a missed
            // bonus, and it is unchanged.
            const penalty = 0;
            score -= penalty;
            if (debug) console.log(`    ${unit.name} stun off-element: no penalty`);
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

    // Chain damage BUFF -> any DPS, priced by the consumer's chain MAGNITUDE. Koleda's
    // `buffs.chains: 1` multiplies the chains a carry already has, so unlike the provision above
    // it lands on EVERY dps: getChainMagnitude's unannotated baseline is 1.0 because every DPS
    // has a chain attack, and it rises to 1.45 for a carry whose chains hit hardest (Evelyn,
    // Norma, Pyrois) and 1.3 for Starlight Billy. It still returns 0 for an unannotated support,
    // so buffing Sunna's chains is correctly worth nothing.
    //
    // Rated at MULT.DAMAGE_TYPE_BUFF, the engine's existing rate for "supplier buffs a damage type
    // the consumer deals", NOT at MULT.CHAINS_PROVISION. The provision rate is deliberately tiny
    // (0.4) because gifting one extra chain is a small thing; multiplying every chain the carry
    // throws is not the same statement, and pricing the buff at the provision rate would have
    // made Koleda WORSE than the bug did.
    const chainBuffWeight = w(supplierBuffs.chains);
    if (chainBuffWeight > 0) {
        const val = chainBuffWeight * getChainMagnitude(consumer) * MULT.CHAINS_BUFF;
        if (val > 0) {
            score += val;
            dbg('chain-buff', val);
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

        // A BUFF NAMED AFTER A PROVISION KEY IS NOT A PROVISION. You hand a carry extra chain
        // attacks through `utility.chains` (Astra, Norma); you multiply the damage of the chains
        // it already has through `buffs.chains` (Koleda). The two share a word and nothing else.
        // Reading the buff as a provision paid Koleda a fraction of a `chains` NEED she cannot
        // satisfy — `need(chains): 4.2 (covers 33%)` beside Evelyn — while never crediting the
        // buff itself at all. The buff is priced in scoreBaselineAffinity instead; see
        // CHAIN_BUFF_KEY there. Same distinction the engine already draws for
        // `buffs.disorders` (a polarity-damage buff) versus `utility.disorders` (forced
        // occurrences).
        const buffIsDamageBuff = PROVISION_KEYS_BUFFED_AS_DAMAGE.has(key);
        let supplyWeight = Math.max(
            buffIsDamageBuff ? 0 : w(supplierBuffs[key]),
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

    // DAMAGE-TYPE BUFFS. The supplier buffs a damage type the consumer actually deals:
    // Orphie's `buffs.aftershock` onto Trigger's `damage.aftershock`, Promeia's `buffs.abloom`
    // onto Velina's `damage.abloom`.
    //
    // THIS IS NOT A NEED OR PROVISION CHANNEL, whatever the old naming suggested. Supplier side
    // reads `buffs`, consumer side reads `damage`, and no `scaling.<type>` is consulted at all —
    // these keys are not in NEED_FULFILLMENT_KEYS. Contrast the genuine cross-namespace bug that
    // `PROVISION_KEYS_BUFFED_AS_DAMAGE` fixes, where `buffs.chains` WAS being read as provision
    // supply against `scaling.chains`.
    //
    // Polarity is a subclass of disorders: buffs.disorders also satisfies damage.polarity.
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
            // ROLE-WEIGHTED by how much damage the consumer actually deals, the same way the
            // generic `atk` buff is (`resolveBaselineWeight('atk')` returns `getBasicDamage/3`).
            // Without it a support was paid the same for buffing a STUNNER's damage type as a
            // carry's, and paid more when the stunner's annotation happened to be larger: Orphie's
            // `buffs.aftershock: 2` earned 18.0 on Trigger (`damage.aftershock: 3`) against 6.0 on
            // Harumasa, the actual carry (`damage.aftershock: 1`). Owner: the benefit should scale
            // to the consumer's damage weight — a stunner reads 2 rather than a DPS's 3.
            //
            // A support reads 0 and so gains nothing here, which is consistent: the `atk` channel
            // already zeroes Astra for the same reason. A declared `damage.basic` override still
            // wins, so Sunna and Yuzuha read 0.33 rather than 0.
            const damageShare = Math.min(1, getBasicDamage(consumer) / 3);
            let val = buffWeight * dw * MULT.DAMAGE_TYPE_BUFF * damageShare;
            if (damageType === 'polarity' && isVortexBoss(options?.boss)) {
                val *= POLARITY_VORTEX_DISCOUNT;
            }
            score += val;
            if (debug) console.log(`        buff(damage:${damageType}): ${val.toFixed(1)}${damageType === 'polarity' && isVortexBoss(options?.boss) ? ' (vortex discount)' : ''}`);
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

// A "+"-joined `synergy.units` entry is a CONJUNCTIVE group: it pays only when EVERY unit named
// in it is on the team, and nothing when only part of the group shows up. It exists for carries
// whose real partner is a PAIR rather than a unit - Alice wants Remielle *and* Velina together,
// and neither alone is the thing that makes her work. Worth more than a single-name declaration
// because satisfying it costs both remaining slots.
//
// Deliberately a data declaration rather than an emergent result, like `mechanics.archetypes`
// and the single-name pairs already are. The alternative was pricing anomaly-buildup cadence,
// which is far too granular for this engine.
const CONJUNCTIVE_SYNERGY_BONUS = 55;

function scoreAdditionalSynergies(team, debug) {
    let score = 0;

    if (debug) console.log('\n  LAYER 5: ADDITIONAL SYNERGIES');

    // Conjunctive group declarations. Checked before the single-name loop below, which cannot
    // match a "+"-joined entry (it compares whole strings against one teammate name).
    for (const unit of team) {
        for (const entry of (unit.synergy?.units || [])) {
            if (typeof entry !== 'string' || !entry.includes('+')) continue;
            const names = entry.split('+').map(n => n.trim()).filter(Boolean);
            if (names.length < 2) continue;
            const allPresent = names.every(n => team.some(t => t !== unit && t.name === n));
            if (!allPresent) continue;
            score += CONJUNCTIVE_SYNERGY_BONUS;
            if (debug) console.log(`    ${unit.name} + [${names.join(', ')}]: +${CONJUNCTIVE_SYNERGY_BONUS} (conjunctive group synergy)`);
        }
    }

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
    // Harsher than merely-unconventional. Calibrated against the Miyabi ladder: at 0.85 the
    // supportless `Nangong/Miyabi/Vivian` still outranked supported teams on all four bosses
    // (tightest margin needed 0.812 on Marionettes), because its raw L4 synergy is large enough to
    // survive the demotion. 0.80 clears all four with margin.
    [STRUCTURE.NO_SUPPORT, 0.80],
    // See the STRUCTURE.NO_STUN_* comment. 0.92 puts `Billy/Pan Yinhu/Lucia` at 336.8 on
    // Priest, clearing `Dialyn/Billy/Lucia` (365.8) by 29 — a real gap rather than the 0.3
    // it had. 0.75 for the attacker case is harsher than merely-unconventional 0.85 because
    // an attacker with no stun window has lost the thing it scales on.
    [STRUCTURE.NO_STUN_RUPTURE, 0.92],
    [STRUCTURE.NO_STUN_ATTACK, 0.75],
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
                const severity = needSeverity(sw);
                needsTotal += severity;
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
                    if (getDisorderSupply(unit, team, twReactions) > 0) needsMet += severity;
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
                    if (supplyWeight > 0) { needsMet += severity; break; }
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
                    needsTotal += 1;
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
                        needsTotal += 1;
                    }
                }
            }
            if (needsTotal > 0 && needsMet < needsTotal - 1e-9) {
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
    // A support whose buffs barely land is not really serving as one, so the team loses its
    // conventional credit. Gated on FACTOR rather than on `=== CONVENTIONAL_BONUS`: when the
    // no-stunner tiers were added, `NO_STUN_RUPTURE` (0.92) slipped through the old identity
    // check and a stunnerless rupture team with an ill-fitting support went 0.85 -> 0.92,
    // i.e. UP — `Yixuan/Lucia/Nicole` gained 33 points on Fiend. Take the HARSHER of the two,
    // so this can only ever demote.
    if ((STRUCTURE_FACTOR.get(structureScore) ?? 0.35) > STRUCTURE_FACTOR.get(STRUCTURE.UNCONVENTIONAL_VIABLE)) {
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

    // Archetype fit: does the support infrastructure suit the primary carry's archetype? Applied
    // FLAT, AFTER the teamwork multiplier — deliberately not scaled by it. "Wrong tool for this
    // carry" is a property of the pairing, not of how cohesive the rest of the team is; scaling it
    // by teamwork would perversely punish a mismatch LESS on an otherwise-cohesive team, which is
    // backwards. Sunna's stun-multiplier genuinely lands on rupture Yixuan, so her cohesion reads
    // high and a teamwork-scaled penalty barely moved her — the flat form is what makes the
    // wrong-tool verdict bite reliably. Still separate from cohesion (see scoreArchetypeFit).
    const archetype = scoreArchetypeFit(team, debug);
    score = Math.round((rawScore * teamwork + archetype) * 10) / 10;

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
        trace.archetype = archetype;
        trace.carryArchetype = getTeamArchetype(team);
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
