/**
 * Shared team scoring logic for Zenless Zone Zero: mechanics-driven 5-layer scoring engine,
 * used by both matchups.js and deadly-assault.js (browser-compatible ES module).
 */

import { ELEMENTS, DPS_ROLES, STAT_KEYS, CLASSES } from './constants.js';
import { isValidTeam } from './team-builder.js';

// CONSTANTS

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
    // Supplier buffs a damage type the consumer deals (e.g. Orphie's aftershock buff onto
    // Trigger's damage.aftershock) — not a need/provision channel. Do not rename to
    // DAMAGE_NEED. [BUFF-01]
    DAMAGE_TYPE_BUFF: 3,
    TOTALIZE_QTY: 5,
    STUN_EMERGENCE: 1.0,
    ELEMENT_BUFF: 2,
    ELEMENT_DEBUFF: 2,
    // `buffs.buildup` — anomaly buildup RATE. `buffs.disorders` is deliberately priced at the
    // same rate; they are different mechanics that happen to be worth the same per point.
    BUILDUP_BUFF: 1.6,
    // `buffs["anomaly:<element>"]` — extra damage against enemies carrying that element's
    // anomaly, and on the procs themselves. Narrower than a plain element buff (the team has to
    // actually land that element) and correspondingly worth more when it does.
    ANOMALY_ELEMENT_BUFF: 2.5,
    // How much a proc-damage buff amplifies a VORTEX built on that proc. A vortex's damage IS
    // proc damage, so this is the same buff arriving through a second door, not a new one.
    PROC_BUFF_VORTEX_SCALE: 0.15,
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
    // Deliberately its own dial rather than borrowing DAMAGE_TYPE_BUFF: Koleda is the only unit
    // that buffs chain attacks, so this constant moves her and nobody else. [BUFF-03]
    CHAINS_BUFF: 8,
    STUN_MULT_BUFF: 2,
    TOTALIZE_PENALTY: 38,
    DISORDER_BONUS: 6,
    DIAMETRIC: 3,
    VORTEX_BUFF: 4,
    REPLACEMENT_COST: 0.5,
    // DEF buff → DEF-scaling consumers (armorer's primary stat). Higher than ATK_BUFF because
    // DEF is the defining stat for these units, analogous to SHEER_BUFF for rupture.
    DEF_BUFF: 2.5,
    // Generic damage buff/debuff (`dmg`): universal multiplier on ALL damage, applied last —
    // never misses. A debuff is worth less than a buff (single-enemy vs team-wide). Calibration dial.
    DMG_BUFF: 1.5,
    DMG_DEBUFF: 1.2,
};

const RUPTURE_ATK_EFFICIENCY = 0.33;
// Armorers do NOT scale off ATK at all (0%) — ATK buffs are worthless to them. Their only
// stat levers are crit rate and defense.
const ARMORER_ATK_EFFICIENCY = 0;
// Crit damage on an anomaly agent is mostly wasted (anomaly damage doesn't crit) but not
// entirely — 0 to 1.0. Used by both resolveBaselineWeight and getBuffRelevance so they cannot
// drift; a declared `scaling.cd` overrides it (Miyabi). [BUFF-02]
const ANOMALY_CRIT_DMG_EFFICIENCY = 0.3;

// Maim: only armorers detonate the shared Gash pool into a burst (parallel to a disorder). See
// documentation/concepts/armorer-laceration-gash-maim.md ("Gash into Maim").
const MAIM_BASE = 8;
const MAIM_ENABLER_BONUS = 6;
// Element-scoped anomaly scaling (e.g. Roxy/Pyrois `scaling["anomaly:wind"]`): bonus per
// same-element anomaly source on the team. Linear — oversupply always helps. A wind
// pseudo-anomaly (Roxy) counts herself; a non-anomaly consumer (Pyrois) needs teammates.
const ANOMALY_ELEMENT_MULT = 4;
// Extra anomaly procs declared as `utility["anomaly:<element>"]`: additional procs of that
// element beyond the unit's own rotation (Alice's physical polarity assaults). Element-scoped
// so it composes with the head-count it augments — a generic `scaling.anomaly` consumer absorbs
// procs of any element, an element-scoped one only matching ones. Weighted below 1: a proc is a
// surplus on a body, not a second body.
const ANOMALY_PROC_SUPPLY = 0.5;

// Disorder supply from ONE distinct cycling element, in the same units as a `utility.disorders`
// annotation, so cycling and polarity provision are directly additive (see getDisorderSupply).
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
// A stun shill satisfied by a stunless carry rather than a stunner: the requirement is met
// without spending a slot on one, so the freed slot takes a second support instead. Calibrated
// against what that replacement support would have contributed. [ARCH-01]
const STUNLESS_SHILL_CREDIT = 48;

// BURST THROUGHPUT: what a unit dumps into a stun window, as a SUM over the instruments it can
// fire there, not a MAX (the same ordinal means different things on different keys — see
// documentation/data-model/damage-and-burst.md). Unannotated does NOT mean "no burst": every
// instrument has a role-derived baseline, since `damage` records only what is DISTINCTIVE.
const BURST_ULTIMATE = { weak: 1.05, support: 1.0, stun: 2.11, base: 2.25, 1: 2.8, 2: 3.0, 3: 4.1 };
const BURST_CHAIN = { support: 0.4, stun: 0.74, base: 0.8, 1: 0.9, 2: 1.0, 3: 1.05 };
const BURST_ENHANCED = { 1: 1.6, 2: 2.1, 3: 3.0 };
const BURST_TOTALIZE = { 1: 1.0, 2: 2.0, 3: 3.0 };
// Luminize — the lumen-only damage type. For Remielle it is the anomaly rebound: three tracked
// mutations, Refringe-boosted, multiplied by her Proficiency and delivered as one hit. It is a
// real burst instrument and was read by NOTHING at all before this, so her headline damage type
// contributed zero to her own burst. Priced on the `enhanced` scale, its closest documented
// analogue, rather than on a guess at something larger.
const BURST_LUMINIZE = { 1: 1.6, 2: 2.1, 3: 3.0 };
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

// FREQUENCY keys (`ultimate:double`, `chain:extra`): how many times an instrument fires in one
// window, read only here — never provision or need. `chain:extra` is Evelyn's self-provisioned
// chains, kept out of `utility.chains` since provision requires supplier !== consumer. [ULT-01]

// ULTIMATE MAGNITUDE: how big this unit's own ultimate is, and what a FREE one is worth to
// them (the PROVISION channel only — frequency and scaling are separate axes, see [ULT-01]
// and documentation/data-model/damage-and-burst.md). Tracks in-game modifier tiers: 3=6000%+,
// 2=4500%+, 1=4200%+, unannotated ~3000-3600%; the 1.0->1.1 step is what separates Evelyn from
// Ellen for a free ultimate.
const ULTIMATE_MAGNITUDE = { 0: 1.0, 1: 1.1, 2: 1.25, 3: 2.0 };

// CHAIN MAGNITUDE: the chain analogue of ULTIMATE_MAGNITUDE — how big this unit's own chain
// attack is, and what a FREE chain is worth to them (provision channel only). Steps are
// shallow since chain modifiers span far less ground than ultimate ones. A non-DPS returns 0
// from getChainMagnitude before this table is consulted.
const CHAIN_MAGNITUDE = { 0: 1.0, 1: 1.15, 2: 1.3, 3: 1.45 };
// NEED keys — a SEPARATE NAMESPACE from the damage keys (plural here, singular there:
// `ablooms` vs `abloom`, `vortex` scaling vs `vortex` buff). The plurals are not typos; do not
// rename them to match. [SCAL-01]
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
    //Variants — frost is a genuinely poor vortex element, not a nil one. It sat at 0.001 for a
    //while, which was synthetic suppression of Miyabi rather than a statement about frost; the
    //real reason she dislikes wind is that vortex damage scales on the proccing agent's Anomaly
    //Proficiency and hers is low. 0.8 must stay strictly below VORTEX_PRIMARY_MIN — see there.
    "ice:frost" : 0.8, 
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

// A vortex tier is a DAMAGE ratio out of the game. A team's VALUE is not linear in any one
// damage channel — the score sums many channels and then soft-caps — so the spread is compressed
// before it is paid. Same argument and same shape as buff delivery, which prices a buff at the
// square root of its L4 coefficient because "a support's share of a team's damage is not linear
// in its pair coefficient" [COH-03].
//
// Anchored at 2 because fire, physical and ether all sit there and therefore do not move at all;
// only the outliers compress. ice 4.5 -> 3.00, electric 1 -> 1.41, the variants 0.8 -> 1.26, so
// the ice:ether ratio falls from 2.25 to 1.50.
//
// Applied to the PAYOUT only. The stored tier stays raw so that frost keeps reading 0.8 against
// VORTEX_PRIMARY_MIN; compressing the stored value would lift it to 1.26, clear the threshold,
// and silently delete the wasted-vortex charge. [VTX-04]
const VORTEX_VALUE_ANCHOR = 2;
function vortexValue(tier) {
    if (tier <= 0) return 0;
    return VORTEX_VALUE_ANCHOR * Math.sqrt(tier / VORTEX_VALUE_ANCHOR);
}

// Frost sits at 0.8 against a threshold of 1.0, so the whole "Miyabi wastes Velina" judgement
// (rankings TEST 62) rests on a gap of 0.2. Raising frost to 1.0 or lowering this threshold
// would silently delete that cohesion charge and hand Nangong/Miyabi/Velina roughly +70 —
// silently, because nothing else reads the comparison. Fail loudly instead.
if (VORTEX_TIERS['ice:frost'] >= VORTEX_PRIMARY_MIN) {
    throw new Error(
        `VORTEX_TIERS['ice:frost'] (${VORTEX_TIERS['ice:frost']}) must stay below ` +
        `VORTEX_PRIMARY_MIN (${VORTEX_PRIMARY_MIN}), or the wasted-vortex cohesion charge on a ` +
        `Miyabi + wind team stops firing. If frost genuinely deserves to clear the threshold, ` +
        `that is a deliberate re-ruling of rankings TEST 62, not a tuning tweak.`);
}
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
// Needs exempt from L5 cohesion penalties — deliberate, not an L4/L5 inconsistency. Ultimates
// and chains arrive naturally and almost nothing can provision them, so reward the upside
// without billing its absence. See documentation/engine/ultimates-two-channel.md.
const NATURALLY_AVAILABLE_NEEDS = new Set(['ultimates', 'chains']);
// Provision keys whose `buffs.<key>` form means "multiply this damage", NOT "provide this".
// Only the buff form is redirected; `utility.<key>` and `debuffs.<key>` stay provisions.
const PROVISION_KEYS_BUFFED_AS_DAMAGE = new Set(['chains']);
// HOW MUCH AN UNMET NEED COSTS, as a function of the declared weight — convex, so weight 1-2
// is not penalized nearly as much as weight 3 (0.11 / 0.44 / 1.00). Reads the coerced weight,
// so `true` behaves as weight 1 per the data model's convention. [SCAL-02]
const NEED_SEVERITY_EXPONENT = 2;
function needSeverity(weight) {
    return Math.min(1, Math.pow(weight / 3, NEED_SEVERITY_EXPONENT));
}
// What one quick assist is worth to a unit with no special use for it — a statement about
// SIZE, not landing (a quick assist never misses). Must agree with the cohesion weight in
// computeBuffUtilization.
const QUICK_ASSIST_VALUE = 0.25;

// `:` IS A CLASSIFIER. `X:Y` names a subclass of `X`, the same way `unit.species` uses it — so
// `anomaly:wind` and `anomaly:electric` are both anomalies and both feed a plain `anomaly` need.
// Anything asking for the general class should therefore find its subclasses.
//
// TWO STEMS ARE NOT CLASSIFIERS, and getting this wrong would resurrect a defect the burst model
// was built to remove. `ultimate:strong` (magnitude), `ultimate:weak` and `ultimate:double`
// (frequency) are ORTHOGONAL AXES, not subclasses of one "ultimate" quantity, and aggregating
// them once fabricated an ultimate need for 26 of 60 units. See
// documentation/data-model/damage-and-burst.md ("Why the axes must stay apart"). [CLS-01]
const NON_CLASSIFIER_STEMS = new Set(['ultimate']);

/** The general class a possibly-classified key belongs to. `abloom:free` -> `abloom`. */
function classifierBase(key) {
    const i = key.indexOf(':');
    if (i < 0) return key;
    const stem = key.slice(0, i);
    return NON_CLASSIFIER_STEMS.has(stem) ? key : stem;
}

/** Total weight a unit declares for a damage class, summing every subclass of it. */
function damageOfClass(unit, cls) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    let total = 0;
    for (const [key, val] of Object.entries(damage)) {
        if (classifierBase(key) === cls) total += w(val);
    }
    return total;
}

// ROLE CLASSIFICATION HELPERS

export function isDPS(unit) {
    if (unit._activatedRoles) return DPS_ROLES.some(r => unit._activatedRoles.includes(r));
    return DPS_ROLES.some(role => unit.tags.includes(role));
}

// "Can this unit's damage be resisted?" — a DPS role OR an active `subdps` pseudo-role.
// Deliberately narrower than isDPS: a subdps IS a damage dealer even when tagged `stun`
// (Norma), so element-resistance disqualification must catch her too. [FUND-01]
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

// BOSS VARIATION RESOLUTION

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

// BOSS ACCESSORS
// These functions centralize access to boss properties that were moved into
// the mechanics block. Using accessors here allows variation resolution to be
// applied transparently without touching call sites.

export function getBossWeaknesses(boss) { return boss.mechanics?.weaknesses ?? []; }
export function getBossResistances(boss) { return boss.mechanics?.resistances ?? []; }
export function getBossShill(boss) { return boss.mechanics?.shill ?? null; }
export function getBossAnti(boss) { return boss.mechanics?.anti ?? []; }
export function getBossAssists(boss) { return boss.mechanics?.assists ?? 0; }
export function getBossChainParry(boss) { return boss.mechanics?.chainParry === true; }
export function getBossShillIntensity(boss) { return boss.mechanics?.shillIntensity ?? 1; }
export function getBossControl(boss) { return boss.mechanics?.control ?? 0; }

// MECHANICS HELPERS

function w(value) {
    if (value === true) return 1;
    if (typeof value === 'number') return value;
    return 0;
}

// UNIFIED CONDITIONAL FRAMEWORK — one predicate vocabulary shared by pseudoRole activation and
// conditional-valued buffs/debuffs/damage/scaling/utility. See
// documentation/data-model/predicates.md for the full vocabulary.

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
// How much of a CODEPENDENT unit's kit this team actually switches on. Fulfilment is read off
// the unit's own team-scoped conditionals, so it needs no new annotation and no per-unit
// special case — the condition the designer already wrote down IS the composition need.
// A codependent unit with no conditional buff (Ye Shunguong) reads 1 and is untouched. [CODEP-01]
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
 * What a codependent unit's contributions are worth on this team. Blended toward a floor
 * rather than run to zero. [CODEP-01]
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

// The gauge a unit fills with its own rotation, or null if it fills none — an element-VARIANT
// string, kept as the SINGLE SOURCE OF TRUTH for both what a unit contributes and what it is
// excluded from reacting with. See documentation/concepts/anomaly-reactions.md.
function getOwnGaugeElement(unit) {
    if (isNativeLumen(unit)) return null;
    return getEffectiveRoles(unit).includes('anomaly') ? getElementVariant(unit) : null;
}

// Which elements does this unit put on the enemy's anomaly gauges? Its own gauge element, PLUS
// any `utility["anomaly:<element>"]` proc regardless of role — a proc lands and reacts whether
// or not its owner is an anomaly agent, matching how the anomaly-quantity channel already reads
// this key role-blind. Lumen contributes nothing: Attribute Mutation morphs damage, no gauge.
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

/**
 * The team's total `buffs["anomaly:<element>"]` weight for one element.
 *
 * Counts the buffer itself, unlike the supplier -> consumer pair loop, which structurally cannot:
 * Jane's buff lands on Jane's own physical procs, and a pair loop that excludes self would never
 * see the largest part of what she does. [BUFF-05]
 */
function teamProcDamageBuff(team, element) {
    if (!element) return 0;
    const base = element.split(':')[0];
    let total = 0;
    for (const u of team) {
        for (const [key, val] of Object.entries(u.mechanics?.buffs || {})) {
            if (classifierBase(key) !== 'anomaly' || key === 'anomaly') continue;
            if (key.slice('anomaly:'.length) === base) total += w(val);
        }
    }
    return total;
}

// PROC PERSISTENCE — how much of the time an anomaly proc is actually standing on the target.
//
// A disorder CONSUMES both procs that made it; a vortex leaves them standing. So an ability that
// only fires when a proc is already present — every `damage.abloom` except Velina's expiring
// cyclones — is worth less beside a heavy disorder engine than beside a wind partner.
//
// This is a DISCOUNT, not an anti-synergy, and the floor is what keeps it one. Miyabi and Vivian
// are a superb disorder package even though Vivian's abloom is proc-dependent: her disorder
// value dwarfs her abloom, and nothing here should suggest otherwise.
const PROC_PERSISTENCE_FLOOR = 0.7;
const PROC_PERSISTENCE_SATURATION = 4;   // disorder supply at which the discount bottoms out

function computeProcPersistence(team, boss) {
    const bossAnomaly = getBossAnomalyState(boss);
    // A wind-anomaly boss re-applies its own gauge constantly and reacts by VORTEX, which
    // preserves procs. Nothing is being cleared.
    if (bossAnomaly === 'wind') return 1;

    const teamElements = new Set();
    for (const u of team) for (const el of getProcElements(u)) teamElements.add(el);
    // A wind partner means the team's reactions are vortexes, which leave procs standing.
    if ([...teamElements].some(el => el.split(':')[0] === 'wind')) return 1;

    // No second element means no reaction at all, so nothing consumes this agent's procs — a
    // solo anomaly carry has PERFECT persistence, which is easy to get backwards.
    const nonWind = [...teamElements].filter(el => el.split(':')[0] !== 'wind');
    if (nonWind.length < 2 && !(bossAnomaly && !teamElements.has(bossAnomaly))) return 1;

    const cadence = Math.min(1, (nonWind.length - 1) / (PROC_PERSISTENCE_SATURATION - 1));
    return 1 - (1 - PROC_PERSISTENCE_FLOOR) * cadence;
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

    // Vortex events are gated by the WIND agent's cyclones, which is a limited resource the
    // non-wind agents share. A second non-wind element therefore does not add vortex events, it
    // splits them — so a poor vortex element in the pool genuinely dilutes what the wind agent
    // produces. The tier is the MEAN of the distinct non-wind elements the team lands, not the
    // max over them: a max lets the best element hide the worst and triple-counts a shared
    // resource. [VTX-01]
    const windPresent = [...teamElements].some(el => el.split(':')[0] === 'wind');
    const nonWindPool = windPresent
        ? [...teamElements].filter(el => el.split(':')[0] !== 'wind')
        : [];
    const pooledVortexTier = nonWindPool.length
        ? nonWindPool.reduce((sum, el) => sum + getVortexTierForVariant(el), 0) / nonWindPool.length
        : 0;

    for (const unit of anomalyAgents) {
        const baseElement = getElement(unit);
        let vortexTier = 0;
        let ownVortexTier = 0;
        let vortexProcElements = [];
        const disorderElements = new Set();

        // Lumen agents don't build anomaly gauges via Attribute Mutation — their damage
        // morphs to a teammate's element but does not fill the corresponding anomaly gauge.
        // Therefore lumen units produce no anomaly reactions (no disorder, no vortex).
        if (isNativeLumen(unit)) {
            reactions.set(unit, { vortexTier: 0, ownVortexTier: 0, vortexProcElements: [], hasDisorder: false, disorderElements });
            continue;
        }

        if (bossAnomaly) {
            // Boss anomaly states are named by BASE element, so this comparison stays base.
            if (baseElement !== bossAnomaly && bossAnomaly !== 'lumen') {
                if (bossAnomaly === 'wind' || baseElement === 'wind') {
                    // No pooling here. A wind-state boss consumes EVERY proc the team applies,
                    // so vortex events scale with proc count rather than with one agent's
                    // cyclones. Nothing is shared, so nothing dilutes.
                    vortexTier = getVortexTierForElement(unit, bossAnomaly);
                    ownVortexTier = vortexTier;
                    vortexProcElements = [getOwnGaugeElement(unit) ?? baseElement];
                } else {
                    disorderElements.add(bossAnomaly);
                }
            }
        } else {
            const element = getOwnGaugeElement(unit);
            let reactsWithWind = false;
            for (const partnerEl of teamElements) {
                // A unit cannot react with the gauge it fills itself.
                if (partnerEl === element) continue;
                const partnerBase = partnerEl.split(':')[0];
                // Same-element pairs do nothing, and that includes wind + wind.
                if (baseElement === 'wind' && partnerBase === 'wind') continue;

                if (baseElement === 'wind' || partnerBase === 'wind') {
                    reactsWithWind = true;
                } else {
                    disorderElements.add(partnerEl);
                }
            }
            if (reactsWithWind) {
                vortexTier = pooledVortexTier;
                // Which element's proc this agent's vortexes consume — its own if it is not the
                // wind agent, otherwise the pool it fires off. Used to find a matching
                // proc-damage buff at payout.
                vortexProcElements = (baseElement === 'wind') ? [...nonWindPool] : [element];
                // A wind agent has no vortex element of its own — its vortexes fire off whatever
                // partner proc is standing, so the pool IS its own tier.
                ownVortexTier = (baseElement === 'wind')
                    ? pooledVortexTier
                    : getVortexTierForVariant(element);
            }
        }

        reactions.set(unit, {
            vortexTier,
            ownVortexTier,
            vortexProcElements,
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
    for (const [, r] of reactions) { if (r.vortexTier > 0) return true; }
    return false;
}

function teamHasAnyReaction(reactions) {
    return teamHasAnyDisorder(reactions) || teamHasAnyVortex(reactions);
}

function teamHasPolarity(team) {
    return team.some(u => w(u.mechanics?.utility?.disorders) > 0);
}

// How much disorder does the team actually put in front of `unit`? Two sources, ADDED, never
// netted off each other: element cycling (one rung per distinct disordering element, off the
// reaction detector's own set) and solo polarity generation (a teammate's `utility.disorders`,
// no second anomaly agent required). Self excluded, matching the `supplier !== consumer`
// convention. See documentation/concepts/disorder-supply.md and [DISO-01].
// Does anyone supply `element` in PARALLEL with `unit`'s own rotation, rather than competing
// for field time? An off-field agent fills its gauge while the carry attacks, so disorders
// arrive roughly twice as fast (see documentation/concepts/disorder-supply.md). Existential
// over the team, not a property of a pair — one parallel source is enough.
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
        // disorders land on the TARGET, so it still benefits from teammates cycling without
        // it — read the richest stream on the team.
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

// Disorder supply a CONSUMER can actually convert: full credit up to the need, then strictly
// diminishing but never zero (a capped fight makes huge surplus statistically insignificant,
// never quite worthless). Logarithmic, scaled to the need so the curve joins the linear part
// smoothly with no cliff. Deliberately a DIFFERENT shape from effectiveDisorderWeakSupply below
// — oversupply keeps helping a consumer, the boss-weakness bonus genuinely hard-caps. Do not
// unify them. See documentation/concepts/disorder-supply.md.
//
//   need=3:  E(3)=3.000  E(4)=3.766  E(5)=4.271  E(6)=4.648  E(8)=5.200  E(1000)=12.75
const DISORDER_SURPLUS_SCALE = 0.5;

export function effectiveDisorderSupply(supply, need) {
    if (need <= 0) return 0;
    if (supply <= need) return supply;
    const k = DISORDER_SURPLUS_SCALE * need;
    return need + k * Math.log(1 + (supply - need) / k);
}

// Disorder supply for a boss's `weak: disorders` bonus. Unlike the consumer side this really
// hard-caps at 5 sources: full credit to the reference weight, then a marginal rate falling
// linearly to zero at the cap.
//
//   E(3)=3.00  E(4)=3.75  E(5)=4.00  E(6)=4.00  E(7)=4.00
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
        // NO IMPLICIT `ultimates` HERE, DELIBERATELY — a unit must never be given a need it
        // did not declare. See documentation/engine/ultimates-two-channel.md.
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
 * Total burst a unit dumps into one stun window, summed across every instrument it fires, then
 * scaled by role into impact. See the BURST_* tables above.
 *
 * NON-DPS UNITS RETURN 0 UNLESS THEY ANNOTATE AN INSTRUMENT — crediting every support for an
 * ultimate/chain they technically fire would pay a small unearned bonus on every team. The
 * annotation is the statement that this unit's burst is worth noticing (Rina's
 * `ultimate:strong: 2`). Same "never give a unit something it did not declare" rule as the need
 * channel; see documentation/engine/design-premise.md.
 */
// BASIC DAMAGE. A plain baseline of how much damage a unit puts out, independent of any
// special mechanism. It answers one question the rest of the `damage` map cannot: how do we
// know Sunna deals more damage than most supports — more than Astra, who deals none?
//
// Every other key in `damage` names a MECHANISM; `basic` is magnitude, not mechanism, and is
// deliberately NOT part of burst throughput (Sunna's damage accrues off-field, so it must not
// contend for a stun window she never uses). Inherited from role, overridable in units.json:
//
//   3   any DPS role (attack / anomaly / rupture / armorer), or subdps
//   2   stun
//   1   defense
//   0   support
//
// Resolved against EFFECTIVE roles, so it is a property of the unit ON THIS TEAM — Soukaku
// swings from 0 to 3 when Miyabi is present, because she is played as a DPS only then. Max
// across roles, so Caesar (defense-tagged, pseudo-stun) reads 2 rather than 1.
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

// BASE STATS  (mechanics.stats)
// What a unit's stat line looks like, as opposed to what it NEEDS (`scaling`) or what it hands
// out (`buffs`). Scale is the house 0-3 convention WITH HALF STEPS, like `tier`; a value above 3
// is legal for a unit deliberately off the conventional scale (Remielle's `atk: 4`).
//
// Keyed by CLASS, not by role. A unit's class is the one thing it IS and it never changes; a
// stat line is a property of the unit, not of the team it is on. `subdps` is a ROLE and is
// deliberately absent — being played as a sub-DPS changes how much damage you deal, which is
// why BASIC_DAMAGE_BY_ROLE does have a `subdps` entry, but it does not change your ATK stat.
//
// This is NOT the same question as `damage.basic`, and the two must not be collapsed. Most
// S-rank supports' buffs are computed from their OWN stat line — Yuzuha needs 3000 ATK to hand
// out her full +1200, Remielle 4000 for her +1600 — so `stats.atk` on a support is the ENGINE of
// their buff. `damage.basic` is the separate, very low modifier turning that ATK into damage
// they personally deal. Support reads atk 3 here and basic 0 there, and both are correct.
// Lucia and Zhao are the exception that proves it: their buffs run off HP, so they override ATK
// down and carry `hp: 3`. A future support buffing off a third stat needs the same override.
//
// Half steps must only ever be used ARITHMETICALLY. Several tables in this file are
// integer-INDEXED with no fallback (BURST_ULTIMATE, CHAIN_MAGNITUDE, ...); a 2.5 handed to one
// of those yields undefined and then NaN. Never key a table by a stat value.
const STAT_BASELINE_BY_CLASS = {
    attack:  { atk: 3,   def: 1, hp: 1, cr: 3,   cd: 3,   pen: 1, am: 0, ap: 0 },
    anomaly: { atk: 2,   def: 1, hp: 1, cr: 0.5, cd: 0.5, pen: 1, am: 2, ap: 2 },
    rupture: { atk: 1,   def: 1, hp: 3, cr: 2,   cd: 3,   pen: 0, am: 0, ap: 0 },
    armorer: { atk: 0,   def: 3, hp: 1, cr: 3,   cd: 0,   pen: 1, am: 0, ap: 0 },
    stun:    { atk: 2,   def: 1, hp: 1, cr: 1,   cd: 1,   pen: 0, am: 0, ap: 0 },
    defense: { atk: 2,   def: 2, hp: 2, cr: 0.5, cd: 0.5, pen: 0, am: 0, ap: 0 },
    support: { atk: 3,   def: 1, hp: 1, cr: 0,   cd: 0,   pen: 0, am: 0, ap: 0 },
};

/**
 * This unit's level in one base stat, inherited from its class unless the unit declares
 * `mechanics.stats[key]`. Normally 0-3; higher is legal for an off-scale unit.
 *
 * NOTE: nothing consumes this yet. It is authored ahead of the scoring work that reads it so
 * that adding the data and reading the data are two separately measurable changes.
 */
export function getStat(unit, key) {
    const declared = unit.mechanics?.stats?.[key];
    if (declared !== undefined) return w(declared);
    return getStatBaseline(unit, key);
}

/**
 * The single class a unit natively IS, read from its tags. Every unit has exactly one.
 */
export function getNativeClass(unit) {
    for (const tag of unit.tags) {
        if (STAT_BASELINE_BY_CLASS[tag]) return tag;
    }
    return null;
}

/**
 * What this unit's NATIVE class implies for one stat, ignoring any override.
 *
 * Native class only — never a pseudo-role, and never `getEffectiveRoles`. A pseudo-role changes
 * what a unit DOES on a team; it does not restat the unit. Soukaku beside Miyabi is playing an
 * anomaly agent, and her stat line is still a support's.
 *
 * The corollary is that this function takes no team and cannot vary by one, unlike almost
 * everything else in this file. That is the property to protect: a base stat is fixed, and the
 * team-dependent part of a stat lives downstream (a unit's EFFECTIVE Anomaly Proficiency rises
 * with the Mastery its team supplies; its base `ap` does not).
 *
 * A pseudo-role unit is genuinely between its two classes and rarely matches either, so it
 * declares the overrides that matter rather than inheriting an average — Nangong and Soukaku
 * both do.
 */
export function getStatBaseline(unit, key) {
    const cls = getNativeClass(unit);
    if (!cls) {
        warnOnceNoClass(unit);
        return 0;
    }
    return STAT_BASELINE_BY_CLASS[cls][key] ?? 0;
}

// A unit with no class tag reads 0 for every stat, which is silent and wrong. Warn once per
// unit rather than throwing: this sits on the scoring path, which runs tens of thousands of
// times per calibration pass.
const _warnedNoClass = new Set();
function warnOnceNoClass(unit) {
    if (_warnedNoClass.has(unit.name)) return;
    _warnedNoClass.add(unit.name);
    console.warn(`getStatBaseline: ${unit.name} has no class tag, so every base stat reads 0. ` +
        `Expected exactly one of: ${CLASSES.join(', ')}.`);
}

// ANOMALY PROFICIENCY — the damage side of the anomaly stat pair.
//
// Mastery raises the buildup RATE (how fast you reach a proc); Proficiency decides how much
// DAMAGE a proc does. Vortex damage is the element's multiplier times the AP of the agent who
// applied the non-wind proc, so AP is what separates two anomaly agents of the same element.
//
// Some agents convert Mastery into Proficiency — Alice, Promeia and Vivian all declare
// `scaling.am`, which is exactly that statement: "the more Mastery you feed me, the harder my
// procs hit". So their EFFECTIVE proficiency rises with the buildup their team supplies, while
// Miyabi, who declares no `scaling.am`, gains nothing from a buildup buffer. [AP-01]
const BASELINE_ANOMALY_AP = 2;      // the anomaly class's own `ap`, so a stock agent reads 1.0
const AM_TO_AP_MAX = 1.0;           // full conversion is worth one whole step of AP
const AM_SUPPLY_FOR_FULL = 3;       // buildup supply at which the conversion saturates

// How much of anomaly-QUANTITY supply is presence versus proficiency.
//
// `scaling.anomaly` is a need for proc COUNT — the docs describe Remielle's as "a high volume of
// teammate procs" — so quantity is the primary term and Proficiency MODULATES it rather than
// replacing it. Hence presence-weighted rather than an even split: a body that procs at all
// contributes, and how hard it procs adjusts that contribution.
//
// Purely AP-scaled was measured and is wrong on both counts: it reads the field as if it named
// damage rather than volume, and it knocked Miyabi/Remielle/Vivian off the owner-stated
// number-two rung (rankings TEST 82, mechanics TEST 24).
//
// WARNING: that rung passes on well under a point at EVERY value of this constant (measured:
// -0.2 at 0.5, +0.2 at 0.6, +0.4 here, +0.6 at 0.7). Do not read a passing TEST 82 as evidence
// that this number is right — the rung is decided by noise. The structural reason is recorded in
// documentation/notes/known-pitfalls.md; briefly, Remielle's Luminize rebound fires off her own
// meter rather than inside a stun window, but the burst model only pays burst inside a window,
// so on a stunless team her biggest hit scores nothing at all.
const ANOMALY_SUPPLY_PRESENCE = 0.65;

/**
 * This unit's effective Anomaly Proficiency on this team: its base `ap`, plus whatever its
 * declared Mastery appetite converts from the team's buildup supply.
 *
 * Reads the RAW `scaling` map on purpose. `getEffectiveScaling` synthesises `{ am: 2, ap: 1 }`
 * for every anomaly agent, so reading the effective map would hand Miyabi a Mastery appetite she
 * never declared and invert the whole model. Do not "helpfully" switch it.
 */
function computeEffectiveAP(unit, team) {
    const baseAP = getStat(unit, 'ap');
    const appetite = w(unit.mechanics?.scaling?.am ?? 0);
    if (appetite <= 0) return baseAP;
    let supply = 0;
    for (const mate of team) {
        if (mate === unit) continue;              // a unit does not buff itself
        supply += w(mate.mechanics?.buffs?.buildup ?? 0);
    }
    if (supply <= 0) return baseAP;
    const conversion = AM_TO_AP_MAX
        * Math.min(1, appetite / 3)
        * Math.min(1, supply / AM_SUPPLY_FOR_FULL);
    return baseAP + conversion;
}

/**
 * Effective AP expressed relative to a stock anomaly agent, so it multiplies a payout without
 * changing that payout's units. A baseline agent returns exactly 1.0.
 */
function apFactor(unit) {
    const ap = unit._effectiveAP;
    if (ap === undefined) return 1;               // not on a scored team; contribute nothing
    return ap / BASELINE_ANOMALY_AP;
}

/**
 * How hard this unit's anomaly procs hit. Normally that is just its Proficiency — but a unit
 * whose procs are DECLARED to run on crit instead reads its crit line, gated by crit rate.
 *
 * Miyabi is the whole reason this is not simply AP. Her proc damage is ATK times crit damage at
 * effectively 100% crit rate, a far bigger multiplier than an average agent's Proficiency, which
 * is why she is simultaneously the best disorder carry in the game and a poor vortex partner:
 * disorder reads proc damage, vortex reads AP alone. Same underlying fact, opposite conclusions.
 *
 * Declared, never inferred: the discriminator is `scaling.cr` / `scaling.cd`, which is the same
 * declaration the anomaly crit-damage efficiency rule already keys off. [BUFF-02] [AP-02]
 */
function computeProcDamage(unit, effectiveAP) {
    const scaling = unit.mechanics?.scaling;
    const declaresCrit = w(scaling?.cr ?? 0) > 0 || w(scaling?.cd ?? 0) > 0;
    if (!declaresCrit) return effectiveAP;
    const critDriven = getStat(unit, 'cd') * Math.min(1, getStat(unit, 'cr') / 3);
    return Math.max(effectiveAP, critDriven);
}

/**
 * What one anomaly body is worth to a proc-QUANTITY consumer: part presence, part Proficiency.
 * A stock agent returns exactly 1.0. See ANOMALY_SUPPLY_PRESENCE.
 */
function anomalySupplyWeight(unit) {
    return ANOMALY_SUPPLY_PRESENCE + (1 - ANOMALY_SUPPLY_PRESENCE) * apFactor(unit);
}

/** Proc damage relative to a stock anomaly agent. A baseline agent returns exactly 1.0. */
function procDamageFactor(unit) {
    const pd = unit._procDamage;
    if (pd === undefined) return 1;
    return pd / BASELINE_ANOMALY_AP;
}

// The table must cover every class and price every stat. A missing class silently reads 0 for
// the whole unit; a missing stat silently reads 0 for that key. Same class of hole that
// BUFF_IMPACT's load-time assertion exists to catch.
for (const cls of CLASSES) {
    if (!STAT_BASELINE_BY_CLASS[cls]) {
        throw new Error(`STAT_BASELINE_BY_CLASS is missing the class "${cls}".`);
    }
    for (const key of STAT_KEYS) {
        if (STAT_BASELINE_BY_CLASS[cls][key] === undefined) {
            throw new Error(`STAT_BASELINE_BY_CLASS.${cls} is missing a baseline for "${key}".`);
        }
    }
}
for (const cls of Object.keys(STAT_BASELINE_BY_CLASS)) {
    if (!CLASSES.includes(cls)) {
        throw new Error(`STAT_BASELINE_BY_CLASS has "${cls}", which is not a class. ` +
            `Roles such as "subdps" do not carry stat defaults — see constants.js.`);
    }
}

// ARCHETYPE FIT  (mechanics.archetypes)
// A deliberate, documented departure from the mechanics-emergent premise: support fit is
// DECLARED, not derived. Applied as a SEPARATE additive term — must never feed the cohesion
// multiplier, or the same judgement is charged twice. See
// documentation/data-model/declared-archetypes.md.

// A team is built around its PRIMARY carry — a pseudo-DPS agent (Nangong) is never the hub.
// See documentation/data-model/declared-archetypes.md ("How it scores"). [ARCH-02]
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

// MONOSHOCK OVERRIDE: a team built around a quirky attacker that scales off anomaly procs
// belongs on attack's scale for CALIBRATION, not anomaly's, even though `getPrimaryCarry` picks
// by tier. Uses the same definition as the monoshock branch of `classifyTeamStructure`, but on
// raw tags rather than activated roles, so it is self-contained and auditable. [ARCH-03]
function isMonoshockTeam(team) {
    const hasAnomaly = team.some(u => u.tags.includes('anomaly'));
    const hasRupture = team.some(u => u.tags.includes('rupture'));
    if (!hasAnomaly || hasRupture) return false;
    const hasStunOrSupport = team.some(u => u.tags.includes('stun') || u.tags.includes('support'));
    if (!hasStunOrSupport) return false;
    return team.some(u => u.tags.includes('attack') && !!(u.mechanics?.scaling || {}).anomaly);
}

// The team's archetype for CALIBRATION purposes — deliberately separate from `carryArchetypes`
// (which feeds `scoreArchetypeFit` and must keep reading the carry's own tags unmodified), since
// conflating the two would change what a monoshock team's supports are charged for. [ARCH-03]
// The guard below fails loudly if a future data entry carries more than one DPS-role tag,
// rather than silently picking whichever sorts first.
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

// `intended` is ZERO on purpose: fitting the carry's archetype is the BASELINE a support is
// expected to meet, not a bonus to stack. `avoid` = -40 is calibrated against two live test
// constraints, not a guess. [ARCH-04]
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

// BURST WINDOW CONTENTION: some carries need the stun window to THEMSELVES to reach their
// ceiling. `scaling.greedy` measures how much of the window a unit needs — EXECUTION
// DIFFICULTY, not damage size — so the greedy list is not the biggest-burst list. ONLY GREED
// ABOVE 1 CONTENDS. See documentation/data-model/scaling.md ("scaling.greedy").
const GREED_CONTENTION_FLOOR = 1;

/** How much of the stun window this unit needs to itself, 0-3. */
function getGreed(unit) {
    return w(unit.mechanics?.scaling?.greedy);
}

/**
 * How much burst window this team is short of, in greed units. Zero unless at least TWO units
 * need the window above the floor; the greediest keeps it, everyone else's greed is squeezed
 * out. The value-scaling is unverifiable on today's roster — see
 * documentation/issues/deferred/low-greed-value-scaling-cannot-be-tested-on-todays-roster.md.
 */
function getBurstContention(team) {
    const greeds = team.map(getGreed).filter(g => g > GREED_CONTENTION_FLOOR);
    if (greeds.length < 2) return 0;
    return greeds.reduce((sum, g) => sum + g, 0) - Math.max(...greeds);
}

/**
 * Can this team's greedy carry actually cash in a longer stun window? Two gates, both about
 * whether the window is real rather than about the carry: no contention (paying the extension
 * bonus while also charging contention double-counted the same claim), and somebody has to
 * open the window (a recovery debuff with no stunner lands once in a fight by accident; this
 * gate withholds only the greedy EXTRA, not the base recovery credit). [SCAL-03]
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
    const luminize = w(damage.luminize);
    const chainMag = w(damage.chain);
    const armorer = roles.includes('armorer');

    // A non-DPS with nothing declared contributes no burst worth pricing.
    if (!dps && !strong && !weak && !enhanced && !totalize && !luminize && !chainMag && !w(damage.maim)) return 0;

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
    if (luminize > 0) sum += BURST_LUMINIZE[Math.min(3, luminize)];
    if (armorer || w(damage.maim) > 0) sum += BURST_MAIM;

    return (sum * getBurstRoleFactor(roles)) / BURST_NORM;
}

/**
 * Value of a free CHAIN ATTACK to this unit, from chain MAGNITUDE alone — the exact analogue
 * of getUltimateMagnitude. Returns 0 for a non-DPS, so a chain provisioner earns no credit for
 * gifting a chain to someone who cannot punish with it.
 */
export function getChainMagnitude(unit) {
    const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
    const annotated = w(damage.chain);
    // An ANNOTATION OVERRIDES THE ROLE DEFAULT, exactly as it does for ultimate magnitude. Only
    // an UNANNOTATED non-DPS is the waste case (gifting Sunna a chain).
    if (annotated === 0 && !isBurstDPS(getEffectiveRoles(unit))) return 0;
    return CHAIN_MAGNITUDE[Math.min(3, annotated)] ?? 1.0;
}

/**
 * Value of a free ultimate to this unit, from ultimate MAGNITUDE alone. Feeds the provision
 * channel; the need channel reads `scaling.ultimates` and nothing else. Returns 0 when the
 * unit's ultimate is not a real burst (`ultimate:weak` with no `ultimate:strong`) — LOAD-
 * BEARING for Sigrid and Pyrois. [ULT-02]
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
// Armorer damage-lever dependency: CR and Laceration primary, PEN and defense shred secondary.
// See documentation/concepts/armorer-laceration-gash-maim.md ("Damage-lever dependency").
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
// Ultimates price partial supply as a straight FRACTION OF THE NEED MET, not a flat discount —
// squared below because `scalingWeight` already appears once in the need product. See
// documentation/engine/l4-components.md ("Supply gates fulfilment").
const FRACTIONAL_COVERAGE_KEYS = new Set(['ultimates']);

function getBuffRelevance(key, consumer) {
    const roles = getEffectiveRoles(consumer);
    const element = getElement(consumer);
    const dps = isDPSByRoles(roles);

    // `anomaly:<element>` is a dynamic key family, so it cannot sit in the switch and must never
    // join STAT_BUFF_KEYS — that set is fixed and guarded by a load-time throw, and a dynamic
    // member would land in BUFF_IMPACT as undefined. It buffs damage against a target carrying
    // that anomaly, so it lands on any damage dealer. Whether the TEAM actually lands the
    // element is not visible from here (no team argument), and is checked where it is paid.
    if (classifierBase(key) === 'anomaly' && key !== 'anomaly') {
        return dps ? 1 : 0;
    }

    switch (key) {
        case 'atk': {
            // Scaled by how much damage the consumer actually deals, matching the L4 need
            // weight in resolveBaselineWeight — the two readings of this fact must agree.
            const scale = getBasicDamage(consumer) / 3;
            if (scale <= 0) return 0;
            if (roles.includes('rupture')) return RUPTURE_ATK_EFFICIENCY * scale;
            if (roles.includes('armorer')) return ARMORER_ATK_EFFICIENCY * scale;
            return scale;
        }
        case 'buildup':
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
            if (damageOfClass(consumer, 'abloom') > 0) return 1;
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

const STAT_BUFF_KEYS = new Set(['atk', 'buildup', 'sheer', 'laceration', 'pen', 'cr', 'cd', 'stun-multiplier', ...ELEMENTS]);

// How much damage one point of each buff is worth, sourced from MULT so L4 and cohesion cannot
// disagree about a buff's price again. [BUFF-04] Every key in STAT_BUFF_KEYS must appear; the
// assertion below fails loudly at load if one is added without a price.
const BUFF_IMPACT = {
    atk: MULT.ATK_BUFF,
    cr: MULT.CR_BUFF,
    cd: MULT.CD_BUFF,
    sheer: MULT.SHEER_BUFF,
    laceration: MULT.LACERATION_BUFF,
    buildup: MULT.BUILDUP_BUFF,
    pen: MULT.PEN_BUFF,
    'stun-multiplier': MULT.STUN_MULT_BUFF,
    // Elements were already reaching MULT.ELEMENT_BUFF through the old fallthrough, so they
    // are unchanged — but listed, so a change to ELEMENT_BUFF cannot silently desync them.
    ...Object.fromEntries(ELEMENTS.map(e => [e, MULT.ELEMENT_BUFF])),
};

// Debuffs are priced the same way, from the same source — a defence shred and a recovery
// debuff are damage amplifiers exactly as an ATK buff is.
const DEBUFF_IMPACT = {
    defense: MULT.DEFENSE_DEBUFF,
    recovery: MULT.RECOVERY_DEBUFF,
    dmg: MULT.DMG_DEBUFF,
    ...Object.fromEntries(ELEMENTS.map(e => [e, MULT.ELEMENT_DEBUFF])),
};

// Cohesion asks what FRACTION of a support's kit is landing, so only the RELATIVE size of
// these values matters. Divided by MULT.ELEMENT_BUFF so a buff worth 2 keeps its existing
// weight and everything else moves relative to it.
const IMPACT_UNIT = MULT.ELEMENT_BUFF;

// MULT's values are L4 PAIR-TERM coefficients, not a damage scale — L4 soft-caps the whole
// layer, so a huge spread (sheer to ATK) is survivable there but saturates cohesion's uncapped
// ratio. Delivery therefore uses the SQUARE ROOT of the coefficient, which compresses the
// spread while keeping a buff worth IMPACT_UNIT anchored at exactly 1.0. [COH-03]
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

// Provisions, priced from what L4 actually pays for them. Only ultimates and chains have a real
// provision channel to read a price from; every other provision is deliberately left at 1, paid
// only through the need channel which fires for the rare consumer who declares one. See
// documentation/data-model/utility.md.
const PROVISION_IMPACT = {
    ultimates: MULT.ULTIMATES_PROVISION,
    chains: MULT.CHAINS_PROVISION,
};

// Defensive provisions are EXEMPT from the delivery measure — negligible next to a damage buff,
// and pricing them would let one masquerade as a support's flagship. See
// documentation/data-model/utility.md. (`shields` and `heal:*` are already outside
// NEED_FULFILLMENT_KEYS and never reached here.)
const DEFENSIVE_PROVISIONS = new Set(['veils', 'interrupt-resistance']);

// RARITY IS NOT IMPORTANCE: ATK is the baseline every support is paid for, not what
// discriminates between two supports, so a baseline buff landing answers "is this support
// doing their job?" even when it is not the unit's largest offering. `sheer` is the
// rupture-side equivalent. See documentation/data-model/buffs-and-debuffs.md ("Baseline
// buffs, and why rarity is not importance"). Weight 3 is the bar in both directions — Pan
// Yinhu's `sheer: 2` is a token amount and does not qualify.
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
// positive signal is already paid in L4 baseline affinity. It stays out of cohesion. `dmg`
// used to be excluded alongside it, and no longer is. See
// documentation/data-model/buffs-and-debuffs.md ("`dmg` used to be excluded and no longer is").
const COHESION_EXCLUDED_BUFFS = new Set(['vortex']);

function getScalingBuffs(unit) {
    const explicit = unit.mechanics?.scaling?.buffs;
    if (explicit !== undefined) return w(explicit);
    if (unit.tags.includes('support') || unit.tags.includes('defense')) return 3;
    if (unit.tags.includes('stun')) return 2;
    return 0;
}

/**
 * Decide which of a supplier's element buffs are charged against its cohesion — a MENU, not
 * separate offerings. See [COH-02] above computeBuffUtilization's element-menu settlement.
 *
 * Exported so the rule can be asserted directly, since it cannot be observed through a team's
 * score alone.
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
        // test needs it, since buffing the ice STUNNER's element is not buffing the carry's.
        return { key, bw, rel: Math.max(dpsRelevance, otherRelevance * (hasDPS ? 0.5 : 1.0)), dpsRel: dpsRelevance };
    });
    const live = arms.filter(a => a.rel > 0);
    if (live.length > 0) return live;
    return [arms.reduce((biggest, a) => (a.bw > biggest.bw ? a : biggest))];
}

/**
 * What a quick-assist provision is worth to a team's cohesion — charged and credited alike,
 * since it is a small benefit that ALWAYS lands. See documentation/data-model/utility.md.
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

    // A unit that is PLAYING support is judged as one, even when it also carries a DPS tag —
    // Remielle is tagged anomaly but is the support slot on a triple-anomaly team. isSupport()
    // reads ACTIVATED roles, so a conditional support pseudo-role only counts when its predicate
    // holds (Cissia routes here only on a team with Seed). Affects Remielle, Orphie, and
    // Cissia-with-Seed. [COH-01]
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

    // A team-scoped conditional that has not been unlocked is a MISS, not a smaller offering —
    // measure the buff at its FULL size and treat the shortfall as relevance that never arrived.
    // Team-scoped only: a recipient-scoped conditional is already routed to its best consumer by
    // `resolveMapForUtil` and is a buff correctly aimed elsewhere, not a shortfall. [COH-01]
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

        // "Did this buff find a user?" — a MAX over the team, never an average (a buff landing
        // only on a non-carry is still worth half, via the DPS/other split below). See
        // documentation/data-model/buffs-and-debuffs.md ("Relevance is combined ... as a MAX").
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

    // Settle the element menu: charge only the arms that LAND, crediting each in full; if NONE
    // land, the largest is charged as dead weight. For a single-element-buff unit this is
    // identical to charging it directly (Soukaku's lone ice buff still takes its hit). Lighter
    // is the only unit with more than one element buff, so he is the only one this can move.
    // [COH-02]
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

            // Quick assists are a SMALL benefit that ALWAYS lands — charge the SIZE, not the
            // declared need, or offering one reads as a phantom shortfall. See
            // documentation/data-model/utility.md.
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
                // `ultimates` and `chains` are paid through the PROVISION channel, which lands on
                // any carry who can use one at all, not only on units that declare the matching
                // `scaling` need (which already earn extra through the L4 need channel). See
                // documentation/data-model/utility.md and
                // documentation/engine/deliberately-unmodeled.md (relayed provision, e.g.
                // Dialyn -> Astra -> Sigrid).
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

    // Daze: a stunner gets a flat 3 for opening the window, plus whatever daze it annotates. A
    // NON-stunner who annotates daze (Sunna) gets only the annotated part.
    if (!isDPS(supplier)) {
        const opensWindow = isStun(supplier);
        const dazeContribution = (opensWindow ? 3 : 0) + w(utility.daze);
        if (dazeContribution > 0) {
            const hasBeneficiary = consumers.some(c => isDPS(c) && !isStunlessUnit(c));
            // A stunless carry does not make the stunner a bad fit — that is the carry's
            // property, not the stunner's mismatch. See documentation/notes/adjudications.md
            // ("Qingyi on YSG/Sunna").
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

    // Cohesion asks ONE question — IS THIS UNIT DOING ITS JOB ON THIS TEAM? — not "what fraction
    // of your kit was wasted". `fit` is the kit this team can use, how much of it is actually
    // arriving; `flagship` (below) is whether the thing that DEFINES this unit found a home. A
    // plain fraction answers neither and always rewards deleting a mismatched buff. `fit` is
    // measured against what was ACHIEVABLE, not what was brought, so a partly-CONVERTING buff
    // (Aria's crit damage) is not charged for its ceiling while a partly-GATED one (Remielle's
    // ATK) still is. See documentation/notes/known-pitfalls.md ("The Fiona and Marissa cases").
    const chargedAchievable = offerings.reduce((sum, o) => sum + o.magnitude * o.achievable, 0);
    const chargedDelivered = offerings.reduce((sum, o) => sum + o.magnitude * o.relevance, 0);
    const fit = chargedAchievable > 0 ? chargedDelivered / chargedAchievable : 1;

    // A flagship has to SUBSTANTIALLY land, not merely be nonzero (strictly above
    // FLAGSHIP_LAND_THRESHOLD). A DECLARED offering (a team-scoped conditional, e.g. Remielle's
    // gated ATK) overrides the size test entirely — the designer is saying "this unit is built
    // around this" — since a cheaply-priced stat like ATK would otherwise look like a small
    // offering next to a flashier buff. See documentation/data-model/buffs-and-debuffs.md
    // ("Baseline buffs" and "Two things the flagship test requires").
    const declaredOfferings = offerings.filter(o => o.declared);
    const flagship = offerings.reduce((m, o) => Math.max(m, o.magnitude), 0);
    // Otherwise the flagship has landed if EITHER the unit's baseline buff landed (see
    // BASELINE_BUFF_KEYS) OR something within the damage-weighted band did — a dead second arm
    // (Soukaku's ice with no ice consumer) is the Fiona case and is not punished on its own.
    // BOTH clauses require reaching an actual DAMAGE DEALER (dpsRel): a support's strongest
    // relationship can be with the STUNNER rather than the carry, and that is not the support
    // fitting the team.
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
    // using it (`ultimate:weak` with no `ultimate:strong`), not merely when nobody scales for
    // it — most need-fulfillment keys are niche and that is the normal case. See
    // documentation/data-model/utility.md.
    if (w(utility.ultimates) >= 3) {
        const anyUsableUltimate = consumers.some(c => {
            if (!isDPS(c) || hasSubDPSRole(c)) return false;
            const cDmg = c._resolvedDamage || c.mechanics?.damage || {};
            return !(w(cDmg['ultimate:weak']) > 0 && w(cDmg['ultimate:strong']) === 0);
        });
        if (!anyUsableUltimate) baseUtil *= PROVISION_WHIFF_PENALTY;
    }
    // KNOWN GAP: a partially-landing stat buff is not charged — Sunna's atk:3 reaches a rupture
    // carry at relevance 0.33, so carrying it can lower utilization below not having it at all.
    // Proportional charging was tried and breaks the calibrated support ordering (TEST 9); the
    // real fix needs the fit ratio to become authoritative over the absolute-supply threshold.
    return 1 - (1 - baseUtil) * (scalingBuffs / 3);
}

// LAYER 1: DISQUALIFICATIONS

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
            // unresisted the player will morph to it instead. Unreachable in practice (L1 runs
            // inside a morph pass, where the sentinel is already false); kept as redundant, not
            // wrong.
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

// LAYER 1.5: TEAM STRUCTURE

const STRUCTURE = {
    CONVENTIONAL_BONUS: 35,
    UNCONVENTIONAL_VIABLE: 0,
    // A team with NO support/defense agent at all — a different, worse failure than merely
    // being unconventional. A MAP KEY only: structureScore feeds the teamwork multiplier and is
    // never added to the raw score, so the harsher STRUCTURE_FACTOR entry is the whole effect.
    // See documentation/engine/layers.md ("No support or defense is its own tier").
    NO_SUPPORT: -1,
    // A team with a carry but NO STUNNER, graded by carry role — two tiers, not one. See
    // documentation/engine/layers.md ("No stunner is its own tier too").
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
// choice. `isEffectiveSupport || isEffectiveDefense` reads activated pseudo-roles, so Orphie,
// Remielle, and Cissia-alongside-Seed all count as the team's support. See
// documentation/engine/layers.md ("No support or defense is its own tier").
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
    // Take the HARSHER of the two factors rather than overriding, so a supportless
    // WILDLY_UNCONVENTIONAL team is not PROMOTED up to the no-support tier. See
    // documentation/engine/layers.md ("No support or defense is its own tier").
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

    // A CARRY THAT DOES NOT WANT THE STUN WINDOW AT ALL — read off the carry lists (role-
    // agnostic), not assumed to be an attacker. Anomaly is deliberately excluded: it has no
    // no-stun tier to be exempted from. See documentation/engine/layers.md ("No stunner is its
    // own tier too").
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
        // `scaling.anomaly` ONLY — `am`/`ap` are stats, not a statement the kit runs on anomaly
        // mechanics. See documentation/engine/layers.md ("Which compositions accept a second
        // carry", monoshock row).
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
        // SAME ELEMENT IS NOT INTERACTION: a second attacker is legitimate only as an explicit
        // subdps or pseudo-support, unlike anomaly, which genuinely wants two bodies. See
        // documentation/engine/layers.md ("Which compositions accept a second carry").
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

// LAYER 2: INHERENT QUALITY

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
    // halved below; its RANK is halved too, for consistency. See
    // documentation/notes/known-pitfalls.md ("Do not halve sub-DPS rank...").
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
            !(unitReaction?.vortexTier > 0 || unitReaction?.hasDisorder) &&
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
    // `basic` is inherited from role (BASIC_DAMAGE_BY_ROLE); paying that baseline again here
    // would double-count tier/rank/burst credit. What is NEWS is a unit whose damage EXCEEDS
    // its role — Sunna (support baseline 0) attacks off-field, so `damage.basic: 1` is the one
    // point of difference paid here.
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
        // NOT halved for a plain secondary DPS, despite the tier halving above — see
        // documentation/notes/known-pitfalls.md ("Do not halve sub-DPS rank...").
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

// LAYER 3: BOSS MATCHUP

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

    // Disorders weakness (e.g. Butcher): bonus scales with team disorder generation and
    // saturates, sharing `getTeamDisorderSupply` with the rest of the engine (hard cap of 5
    // sources). See documentation/concepts/disorder-supply.md.
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
            // Proc-dependent abloom is discounted by how often a proc is actually standing;
            // `abloom:free` (Velina's expiring cyclones) needs no proc and is paid in full.
            const damage = unit._resolvedDamage || unit.mechanics?.damage || {};
            for (const [key, val] of Object.entries(damage)) {
                if (classifierBase(key) !== 'abloom') continue;
                totalAbloom += (key === 'abloom:free')
                    ? w(val)
                    : w(val) * computeProcPersistence(team, boss);
            }
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
                !(unitReaction?.vortexTier > 0 || unitReaction?.hasDisorder) &&
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
            // NO PENALTY for an off-element stunner: an on-element stunner's damage is amplified
            // by the boss's weakness, but the absence of that bonus is not a loss to charge for.
            // See documentation/notes/adjudications.md ("The Evelyn stunner ladder on fire-weak
            // Pompey"). A resisted element still costs 80 above — that is a real damage loss.
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

// LAYER 4: MECHANICAL SYNERGY

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

    // Anomaly BUILDUP buffs (Yuzuha, Nangong, Remielle, Velina) → anomaly agents.
    // Buildup is the rate at which procs accrue. It is NOT proc damage — that is
    // `buffs["anomaly:<element>"]`, a separate key. [BUFF-05]
    if (supplierBuffs.buildup) {
        const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
        if (cw > 0) {
            const val = w(supplierBuffs.buildup) * cw * MULT.BUILDUP_BUFF;
            score += val;
            dbg('buildup', val);
        }
    }

    // Element-scoped anomaly buffs: extra damage against enemies afflicted with that element's
    // anomaly, and on the procs themselves. Grace and Rina (electric) are how monoshock is meant
    // to pay off — Harumasa scales on shock procs and these two make each one hit harder. Jane
    // is the physical case.
    //
    // Gated on the TEAM actually landing that element, not on the consumer's own element: the
    // buff is about the state of the target, so anyone hitting a shocked enemy benefits. That is
    // also how it reaches a vortex — a vortex's damage IS proc damage, so buffing the proc
    // buffs the vortex built on it, which is what Jane really does. [BUFF-05]
    for (const [buffKey, buffVal] of Object.entries(supplierBuffs)) {
        if (classifierBase(buffKey) !== 'anomaly' || buffKey === 'anomaly') continue;
        const element = buffKey.slice('anomaly:'.length);
        const team = options?.team ?? [];
        let teamLandsElement = false;
        for (const u of team) {
            for (const el of getProcElements(u)) {
                if (el.split(':')[0] === element) { teamLandsElement = true; break; }
            }
            if (teamLandsElement) break;
        }
        if (!teamLandsElement) continue;
        const cw = getBasicDamage(consumer) / 3;
        if (cw <= 0) continue;
        const val = w(buffVal) * cw * MULT.ANOMALY_ELEMENT_BUFF;
        score += val;
        dbg(buffKey, val);
    }

    // Disorder damage buff → anomaly agents, only when team generates disorders
    // On vortex bosses, natural disorders are suppressed; discount proportionally
    if (supplierBuffs.disorders && options?.hasDisorderGeneration) {
        const discount = options?.disorderBuffDiscount ?? 1;
        if (discount > 0) {
            const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
            if (cw > 0) {
                const val = w(supplierBuffs.disorders) * cw * MULT.BUILDUP_BUFF * discount;
                score += val;
                dbg('disorder-buff', val);
            }
        }
    }

    // Vortex buff → anomaly agents that actually generate vortex reactions this fight.
    // Tier-scaled so ice-vortex consumers (Promeia) benefit more than lower-tier ones.
    if (supplierBuffs.vortex) {
        const reaction = options?.reactions?.get(consumer);
        if (reaction?.vortexTier > 0) {
            const cw = resolveBaselineWeight(consumer, 'anomaly-affinity');
            if (cw > 0) {
                const tierScale = Math.min(1.0, reaction.vortexTier / MAX_VORTEX_TIER);
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
            // A GREEDY carry (>= 2) gets more out of a longer window than anyone else — the
            // reason Lighter beats Trigger as Evelyn's stunner. See documentation/data-model/
            // scaling.md ("scaling.greedy").
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

    // Ultimates provision → primary DPS only (subdps don't consume the burst window), priced by
    // the consumer's ultimate MAGNITUDE. A weak ultimate yields magnitude 0 and self-zeroes; a
    // conditional `ultimate:strong` lifts it via _resolvedDamage (Pyrois's wind case). See
    // documentation/engine/l4-components.md and documentation/engine/ultimates-two-channel.md.
    const supplierUtility = resolveValueMap(supplier.mechanics?.utility, _ctx);
    const ultimatesWeight = w(supplierUtility.ultimates);
    if (ultimatesWeight > 0 && isDPSByRoles(consumerRoles) && !hasSubDPSRole(consumer)) {
        const val = ultimatesWeight * getUltimateMagnitude(consumer) * MULT.ULTIMATES_PROVISION;
        score += val;
        dbg('ultimates', val);
    }

    // Chain provision -> any DPS (unlike ultimates, not a limited one-per-window resource, so
    // subdps are included), priced by the consumer's chain MAGNITUDE. Separate from
    // `need(chains)`, which pays units that get something BEYOND the chain's own damage
    // (Evelyn, Sigrid). See documentation/data-model/mechanics-overview.md.
    const chainsWeight = w(supplierUtility.chains);
    if (chainsWeight > 0) {
        const val = chainsWeight * getChainMagnitude(consumer) * MULT.CHAINS_PROVISION;
        if (val > 0) {
            score += val;
            dbg('chains', val);
        }
    }

    // Chain damage BUFF (Koleda's `buffs.chains`) -> any DPS, priced by chain MAGNITUDE. Unlike
    // the provision above this lands on every DPS, since it multiplies chains the carry already
    // has. Rated at its own MULT.CHAINS_BUFF dial, not the provision rate. [BUFF-03]
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

        // Disorders are priced ONCE, team-wide, in the L4 team-level section rather than per
        // supplier — see documentation/concepts/disorder-supply.md. No unit `converts` or
        // `replaces` disorders, so those branches lose nothing.
        if (key === 'disorders') continue;

        // A BUFF NAMED AFTER A PROVISION KEY IS NOT A PROVISION (the Koleda case — see
        // documentation/data-model/mechanics-overview.md). The buff form is priced in
        // scoreBaselineAffinity instead.
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

    // DAMAGE-TYPE BUFFS: the supplier buffs a damage type the consumer actually deals (Orphie's
    // `buffs.aftershock` onto Trigger's `damage.aftershock`). NOT a need or provision channel —
    // supplier side reads `buffs`, consumer side reads `damage`, no `scaling.<type>` involved.
    // See documentation/data-model/mechanics-overview.md. Polarity is a subclass of disorders:
    // buffs.disorders also satisfies damage.polarity.
    const consumerDamage = consumer._resolvedDamage || consumer.mechanics?.damage || {};
    for (const [damageType, damageWeight] of Object.entries(consumerDamage)) {
        const dw = w(damageWeight);
        if (dw === 0) continue;
        let buffWeight = w(supplierBuffs[damageType]);
        // A buff on the general class satisfies any subclass of it: Promeia's `buffs.abloom`
        // must still reach Velina's `damage['abloom:free']`. [CLS-01]
        const damageClass = classifierBase(damageType);
        if (damageClass !== damageType) {
            buffWeight = Math.max(buffWeight, w(supplierBuffs[damageClass]));
        }
        // Buffing an ability that needs a live proc is worth less on a team that keeps clearing
        // them. `abloom:free` is exempt — it fires whether or not a proc is standing.
        let procScale = 1;
        if (damageClass === 'abloom' && damageType !== 'abloom:free') {
            procScale = computeProcPersistence(options?.team || [], options?.boss);
        }
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
            // ROLE-WEIGHTED by how much damage the consumer actually deals, same as the generic
            // `atk` buff — without it a stunner's damage type was paid like a carry's. See
            // documentation/notes/adjudications.md ("Orphie beating Sunna for Harumasa").
            const damageShare = Math.min(1, getBasicDamage(consumer) / 3);
            let val = buffWeight * dw * MULT.DAMAGE_TYPE_BUFF * damageShare * procScale;
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

    // The buff half of the buff x defense-shred pair, swapped for an armorer's actual levers
    // (PEN, CR, Laceration) since ATK/CD are mostly dead to them. See
    // documentation/engine/diametric-synergy.md ("The armorer exception").
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

        if (reaction.vortexTier > 0) {
            // A vortex's damage is the element multiplier times the AP of the agent whose proc
            // was consumed. Scaling the PAYOUT, never `reaction.vortexTier` itself: the stored
            // tier is read by the wasted-vortex gate against VORTEX_PRIMARY_MIN, and folding AP
            // in there would let a high-AP agent clear that threshold on a bad element. [VTX-03]
            // A proc-damage buff feeds the vortex built on that proc — Jane does not buff
            // vortexes directly, she buffs the physical procs they are made of, and Grace does
            // the same for shock. This is also the only place her buff reaches her OWN procs.
            let procBuff = 0;
            for (const el of (reaction.vortexProcElements || [])) {
                procBuff = Math.max(procBuff, teamProcDamageBuff(team, el));
            }
            const procBuffScale = 1 + MULT.PROC_BUFF_VORTEX_SCALE * procBuff;
            const vortexBonus = VORTEX_BASE * vortexValue(reaction.vortexTier) * apFactor(unit) * procBuffScale;
            consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + vortexBonus);
            if (debug) console.log(`    Vortex bonus: ${unit.name} +${vortexBonus.toFixed(1)} (tier ${reaction.vortexTier.toFixed(2)} -> ${vortexValue(reaction.vortexTier).toFixed(2)}, ap x${apFactor(unit).toFixed(2)})`);
        }

        // Flat "a disorder happened, and this agent's own procs are part of it" bonus — this is
        // disorder DAMAGE, and every anomaly agent in the reaction earns it.
        //
        // It used to skip anyone who declares a disorders need, on the grounds that they were
        // "paid through the need channel instead". That was a fair simplification while both
        // channels were flat, and it is wrong now that they answer different questions: this one
        // prices the damage a disorder does, the need channel prices the consumer's CONVERSION
        // of disorders into something else. Miyabi does both, and skipping her here meant the
        // agent with the hardest-hitting procs in the game earned nothing for them. [AP-02]
        if (reaction.hasDisorder) {
            // A disorder's damage comes off the combined damage of the two procs that made it,
            // so it scales with how hard this agent's procs hit. [AP-02]
            const disorderBonus = MULT.DISORDER_BONUS * procDamageFactor(unit);
            consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + disorderBonus);
            if (debug) console.log(`    Implicit disorder: ${unit.name} +${disorderBonus.toFixed(1)} (proc dmg x${procDamageFactor(unit).toFixed(2)})`);
        }
    }

    // Disorder need, priced ONCE against the team's aggregate disorder supply, looping the whole
    // team (not just anomaly agents) since a disorder is a team-wide event on the target. See
    // documentation/concepts/disorder-supply.md.
    for (const unit of team) {
        const need = w(getEffectiveScaling(unit).disorders);
        if (need <= 0) continue;
        const supply = getDisorderSupply(unit, team, reactions);
        if (supply <= 0) continue;
        const effective = effectiveDisorderSupply(supply, need);
        // Undersupply still hurts, via a continuous ramp rather than a flat step — see
        // documentation/concepts/disorder-supply.md ("Undersupply").
        const coverage = Math.min(1, supply / need);
        const damp = UNDERSUPPLY_FACTOR + (1 - UNDERSUPPLY_FACTOR) * coverage;
        // Deliberately NOT scaled by proc damage. This channel prices the consumer's own
        // CONVERSION — Miyabi turning disorders into enhanced attacks — which is driven by how
        // many disorders arrive, not by how hard they hit. Two things went wrong when it was
        // scaled: a non-anomaly consumer (mechanics TEST 17's synthetic Nicole, `ap` 0) had its
        // whole payout zeroed, and multiplying a supply-driven term by a constant amplified
        // supply differences enough to invert the Yanagi/Burnice rung. Disorder DAMAGE is priced
        // in the flat channel above; this is a different question. [AP-02]
        const val = effective * need * MULT.NEED_FULFILLMENT * damp;
        consumerScores.set(unit.name, (consumerScores.get(unit.name) || 0) + val);
        if (debug) console.log(`    Disorder need: ${unit.name} +${val.toFixed(1)} (supply ${supply} → ${effective.toFixed(2)} effective, need ${need}${coverage < 1 ? `, undersupplied x${damp.toFixed(2)}` : ''})`);
    }

    // Refringe bonus: a lumen agent's Lumiflux is consumed when a non-lumen anomaly teammate
    // procs, dealing extra damage; cascades to partners with active reactions. See
    // documentation/concepts/lumen.md.
    const lumenAnomalyAgents = anomalyDPS.filter(isNativeLumen);
    if (lumenAnomalyAgents.length > 0) {
        const nonLumenAnomalyPartners = anomalyDPS.filter(u => !isNativeLumen(u));
        for (const partner of nonLumenAnomalyPartners) {
            const reaction = reactions.get(partner);
            let bonus = REFRINGE_BONUS;
            if (reaction?.hasDisorder) bonus += REFRINGE_DISORDER_CASCADE;
            if (reaction?.vortexTier > 0) bonus += REFRINGE_VORTEX_CASCADE;
            // Refringe is a lumen mechanic and scales on Proficiency, like everything else
            // Remielle does — not on the teammate's raw proc damage. See [AP-03].
            //
            // Blended the same way as anomaly-quantity supply: a proc being boosted at all is an
            // event worth something regardless of the stat line, and its damage on top is
            // AP-scaled. Straight multiplication was too sharp here for the same reason and on
            // the same rung — it cost Miyabi/Remielle/Vivian its owner-stated number-two slot.
            bonus *= anomalySupplyWeight(partner);
            consumerScores.set(partner.name, (consumerScores.get(partner.name) || 0) + bonus);
            if (debug) {
                const parts = [`base ${REFRINGE_BONUS}`];
                if (reaction?.hasDisorder) parts.push(`disorder +${REFRINGE_DISORDER_CASCADE}`);
                if (reaction?.vortexTier > 0) parts.push(`vortex +${REFRINGE_VORTEX_CASCADE}`);
                parts.push(`ap x${anomalySupplyWeight(partner).toFixed(2)}`);
                console.log(`    Refringe: ${partner.name} +${bonus.toFixed(1)} (${parts.join(', ')})`);
            }
        }
    }

    // Maim reaction bonus, awarded to armorers alone (only they detonate the shared Gash pool).
    // The shared-pool cap is modelled by capping the builder count. See
    // documentation/concepts/armorer-laceration-gash-maim.md ("Gash into Maim").
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
    // `scaling.anomaly` is generic (any effective anomaly agent); `scaling["anomaly:wind"]` is
    // element-scoped (see documentation/data-model/scaling.md). Supply is a WEIGHTED count
    // (bodies plus proc surplus at ANOMALY_PROC_SUPPLY per weight), linear — oversupply always
    // helps.
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
                // Lumen fills no anomaly gauge, so it supplies no anomaly quantity — not even to
                // itself (documentation/concepts/lumen.md).
                // Weighted by the contributor's PROFICIENCY, not counted as a head. Remielle's
                // Luminize rebound multiplies by Anomaly Proficiency, so two bodies are not worth
                // the same if one has far more of it. This is what makes Velina and Aria better
                // rebound partners than Miyabi.
                //
                // AP, deliberately, NOT proc damage. Miyabi's procs hit like a truck because they
                // run on crit, but Luminize and Refringe scale on Proficiency alone and hers is
                // low — which is exactly why the owner calls her one of Remielle's weakest
                // partners. Using proc damage here inverted that and made her Remielle's BEST,
                // overtaking Nangong/Miyabi/Yuzuha and breaking rankings TEST 79 and 82. Disorder
                // is the channel that reads proc damage; this one does not. [AP-03]
                if (!isNativeLumen(u)
                    && getEffectiveRoles(u).includes('anomaly')
                    && (element === null || getElement(u) === element)) supply += anomalySupplyWeight(u);
                for (const [ukey, uval] of Object.entries(u.mechanics?.utility || {})) {
                    if (!ukey.startsWith('anomaly:')) continue;
                    if (element !== null && ukey.slice('anomaly:'.length) !== element) continue;
                    supply += ANOMALY_PROC_SUPPLY * w(uval) * anomalySupplyWeight(u);
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

// LAYER 5: ADDITIONAL SYNERGIES

// A "+"-joined `synergy.units` entry is a CONJUNCTIVE group: pays only when EVERY named unit is
// on the team. See documentation/data-model/unit-object.md ("synergy.units").
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

// TEAMWORK MULTIPLIER

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
        // Armorer damage-lever dependency, graded by total supply rather than a yes/no check —
        // see documentation/concepts/armorer-laceration-gash-maim.md. Applies to every armorer,
        // buff-carrying or not.
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
        // Needs are evaluated for EVERY unit, whether or not it also supplies buffs — a support
        // can depend on disorders exactly the way a hypercarry does. Gating this on "supplies
        // nothing" used to silently switch off the whole consumer-side evaluation (including the
        // wasted-vortex check below) whenever the unit carried even a token buff.
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
                // consumer, via the same supply the L4 need channel prices — one measure,
                // consulted in both places. See documentation/concepts/disorder-supply.md.
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
            // Native anomaly tag, not the effective role: charges a unit for its own anomaly
            // output going nowhere, which only makes sense when anomaly IS its job — a pseudo-
            // anomaly stunner (Roxy) is valued as an enabler, not a reaction generator. Native
            // lumen is exempt: it cannot react at all. See [LUM-01].
            if (hasSubDPSRole(unit) && unit.tags.includes('anomaly') && !isNativeLumen(unit)) {
                const unitReaction = twReactions.get(unit);
                const hasReaction = unitReaction?.vortexTier > 0 || unitReaction?.hasDisorder;
                if (!hasReaction) {
                    needsTotal += 1;
                }
                // Wasted vortex: subdps generates vortex but no native primary anomaly DPS
                // benefits from it. See documentation/engine/cohesion.md ("Wasted vortex").
                if (unitReaction?.vortexTier > 0) {
                    const primaryNativeAnomaly = team.filter(t =>
                        t !== unit && t.tags.includes('anomaly') && !hasSubDPSRole(t)
                    );
                    // OWN tier, deliberately, not the pooled one. The question is whether
                    // any carry's own element makes vortex worth building around — a property of
                    // that carry, not of the team's diluted pool. Reading the pooled value here
                    // would let a good partner element lift Miyabi over VORTEX_PRIMARY_MIN and
                    // silently delete this charge, worth about +70 to Nangong/Miyabi/Velina.
                    // [VTX-02]
                    const bestPrimaryTier = primaryNativeAnomaly.reduce((best, t) => {
                        return Math.max(best, twReactions.get(t)?.ownVortexTier ?? 0);
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
        // scaling.buffs === 0 means whether this unit's buffs land is not part of its job
        // (Lycaon's ice debuff, Claret's own buff) — computeBuffUtilization returns a flat 1.0,
        // which must not wash out this same unit's needs penalty above.
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
        // A pseudo-support whose stat buffs don't actually align with a teammate is not really
        // playing support; discount her pseudo-DPS credit instead. [TWM-01]
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
        // A DPS that opts into scaling.buffs > 0 (SAnby) still takes the lighter DPS weight
        // below — computeBuffUtilization already damps by scaling.buffs/3, so charging it again
        // here would double-count it. [TWM-01]
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

// SYNERGY AVOID CHECK

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
            // wrong for a whole archetype rather than for one teammate.
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

// MAIN SCORING FUNCTION

export function scoreTeamForBoss(team, boss, options = {}) {
    // `trace`, when supplied, is an object this call fills with the per-layer contributions.
    // It is pure observability — nothing read back out of it affects the score — and exists so
    // `score-dump.mjs` can attribute a score movement to a layer without re-running `--debug`
    // team by team.
    const { lenient = false, debug = false, trace = null } = options;

    // Lumen units morph their damage to a teammate's element via Attribute Mutation. Try every
    // morph combination and keep the best score; under debug/trace, re-run the WINNING combo so
    // the reported trace matches the returned score. See documentation/concepts/lumen.md.
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
            // No non-lumen teammate means nothing to morph to; assigning null still clears the
            // sentinel, which is what stops this from recursing forever.
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

    // Effective Anomaly Proficiency, once per pass. It depends on team composition (the buildup
    // supply) but not on the boss, and not on the reaction set — which is why it can be resolved
    // here rather than threaded through computeAnomalyReactions' four call sites.
    for (const unit of team) {
        unit._effectiveAP = computeEffectiveAP(unit, team);
        unit._procDamage = computeProcDamage(unit, unit._effectiveAP);
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
            delete u._effectiveAP;
            delete u._procDamage;
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
    // A support whose buffs barely land is not really serving as one; downgrade to unconventional.
    // Gated on FACTOR, not identity, and takes the HARSHER of the two so this can only demote.
    // See documentation/engine/teamwork-multiplier.md ("the mismatched-support override").
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
    // FLAT, AFTER the teamwork multiplier, deliberately not scaled by it — see
    // documentation/data-model/declared-archetypes.md and documentation/engine/teamwork-multiplier.md.
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

// LEGACY EXPORTS (backwards compatibility)

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
