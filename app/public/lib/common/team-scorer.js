/**
 * Shared team scoring logic for Zenless Zone Zero
 * Used by both matchups.js and deadly-assault.js
 * 
 * Mechanics-driven scoring engine (5-layer architecture)
 * Browser-compatible ES module version
 */

import { ELEMENTS, DPS_ROLES } from './constants.js';

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
    ANOMALY_BUFF: 2,
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
    DISORDER_BONUS: 12,
    DIAMETRIC: 3,
};

const RUPTURE_ATK_EFFICIENCY = 0.33;

const BURST_DAMAGE_TYPES = ['enhanced', 'ultimate:strong', 'ultimate:double', 'chain', 'totalize'];
const NEED_FULFILLMENT_KEYS = [
    'disorders', 'ablooms', 'chains', 'ultimates', 'veils',
    'quick-assists', 'interrupt-resistance', 'vortex'
];

const VORTEX_TIERS = { ice: 3, fire: 2, physical: 1, ether: 1, electric: 1 };
const VORTEX_DEFAULT_TIER = 0.08;
const VORTEX_BASE = 16;
const POLARITY_VORTEX_DISCOUNT = 0.25;
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
    return unit.tags.find(tag => ELEMENTS.includes(tag));
}

export function hasDefensiveAssist(unit) {
    return unit.tags.includes("assist:defensive");
}

export function isOnField(unit) {
    const explicit = unit.mechanics?.onfield;
    if (explicit !== undefined) return !!explicit;
    if (isDPS(unit) || isStun(unit)) return true;
    const activated = unit._activatedRoles || [];
    return activated.some(r => DPS_ROLES.includes(r) || r === 'stun');
}

// ============================================================================
// MECHANICS HELPERS
// ============================================================================

function w(value) {
    if (value === true) return 1;
    if (typeof value === 'number') return value;
    return 0;
}

export function getEffectiveRoles(unit) {
    if (unit._activatedRoles) return unit._activatedRoles;
    const roles = [];
    for (const role of ['attack', 'anomaly', 'rupture', 'stun', 'support', 'defense']) {
        if (unit.tags.includes(role)) roles.push(role);
    }
    const pseudoRole = unit.mechanics?.pseudoRole;
    if (pseudoRole) {
        for (const pr of pseudoRole.split(',').map(s => s.trim())) {
            if (pr && !roles.includes(pr)) roles.push(pr);
        }
    }
    return roles;
}

function computeActivatedRoles(unit, team) {
    const roles = [];
    for (const role of ['attack', 'anomaly', 'rupture', 'stun', 'support', 'defense']) {
        if (unit.tags.includes(role)) roles.push(role);
    }
    const pseudoRole = unit.mechanics?.pseudoRole;
    if (pseudoRole) {
        for (const pr of pseudoRole.split(',').map(s => s.trim())) {
            if (!pr || roles.includes(pr)) continue;
            if (DPS_ROLES.includes(pr)) {
                const hasActivator = team.some(t => t !== unit && t.tags.includes(pr));
                if (!hasActivator) continue;
            }
            roles.push(pr);
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

function teamHasImplicitDisorders(team) {
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    if (anomalyAgents.length < 2) return false;
    const elements = anomalyAgents.map(u => {
        const base = getElement(u);
        return u.mechanics?.elementalVariant ? base + '-variant' : base;
    });
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

function getAnomalyElement(unit) {
    const base = getElement(unit);
    return unit.mechanics?.elementalVariant ? base + '-variant' : base;
}

function getVortexTierForElement(unit, bossAnomaly) {
    if (unit.mechanics?.elementalVariant) return VORTEX_DEFAULT_TIER;
    const el = getElement(unit);
    if (el === 'wind' && bossAnomaly && bossAnomaly !== 'wind') {
        return VORTEX_TIERS[bossAnomaly] ?? VORTEX_DEFAULT_TIER;
    }
    return VORTEX_TIERS[el] ?? VORTEX_DEFAULT_TIER;
}

function computeAnomalyReactions(team, boss) {
    const bossAnomaly = getBossAnomalyState(boss);
    const anomalyAgents = team.filter(u => getEffectiveRoles(u).includes('anomaly'));
    const reactions = new Map();

    for (const unit of anomalyAgents) {
        const element = getAnomalyElement(unit);
        let bestVortexTier = 0;
        let hasDisorder = false;

        if (bossAnomaly) {
            if (element !== bossAnomaly) {
                if (bossAnomaly === 'wind' || element === 'wind') {
                    bestVortexTier = getVortexTierForElement(unit, bossAnomaly);
                } else {
                    hasDisorder = true;
                }
            }
        } else {
            for (const partner of anomalyAgents) {
                if (partner === unit) continue;
                const partnerEl = getAnomalyElement(partner);
                if (element === partnerEl) continue;

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

function hasSubDPSRole(unit) {
    const pr = unit.mechanics?.pseudoRole;
    return pr ? pr.split(',').map(s => s.trim()).includes('subdps') : false;
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
    if (roles.includes('stun'))    Object.assign(baseline, { daze: 1 });
    if (isDPSByRoles(roles)) {
        const damage = unit.mechanics?.damage || {};
        if (!hasSubDPSRole(unit)) {
            let implicitUlt = 1;
            if (damage['ultimate:strong']) implicitUlt = Math.max(implicitUlt, 2);
            if (damage['ultimate:double']) implicitUlt = Math.max(implicitUlt, 3);
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
            if (roles.includes('attack') || roles.includes('rupture')) return 2;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'cd':
            if (scaling?.cd) return w(scaling.cd);
            if (roles.includes('attack') || roles.includes('rupture')) return 2;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'stun-infra':
            if (isStunlessUnit(consumer)) return 0;
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.5;
            if (roles.includes('stun')) {
                const pseudo = consumer.mechanics?.pseudoRole || '';
                if (DPS_ROLES.some(r => pseudo.includes(r))) return 0.5;
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
    const damage = unit.mechanics?.damage || {};
    const explicit = Math.max(0, ...BURST_DAMAGE_TYPES.map(type => w(damage[type])));
    if (explicit > 0) return explicit;
    const roles = getEffectiveRoles(unit);
    return isDPSByRoles(roles) ? 1 : 0;
}

const BUFF_UTIL_FLOOR = 0;

function getBuffRelevance(key, consumer) {
    const roles = getEffectiveRoles(consumer);
    const element = getElement(consumer);
    const dps = isDPSByRoles(roles);

    switch (key) {
        case 'atk':
            if (!dps) return 0;
            return roles.includes('rupture') ? RUPTURE_ATK_EFFICIENCY : 1;
        case 'anomaly':
            return roles.includes('anomaly') ? 1 : 0;
        case 'sheer':
            return roles.includes('rupture') ? 1 : 0;
        case 'pen':
            return (dps && !roles.includes('rupture')) ? 1 : 0;
        case 'cr':
            if (consumer.mechanics?.scaling?.cr) return 1;
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'cd':
            if (consumer.mechanics?.scaling?.cd) return 1;
            if (roles.includes('attack') || roles.includes('rupture')) return 1;
            if (roles.includes('anomaly')) return 0.3;
            return 0;
        case 'stun-multiplier':
            return dps ? 1 : 0;
        case 'chains':
            return 1;
        default:
            if (consumer.mechanics?.damage?.[key]) return 1;
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

function computeBuffUtilization(supplier, team) {
    const consumers = team.filter(t => t !== supplier);
    const nConsumers = consumers.length;

    if (isDPS(supplier)) {
        const buffs = supplier.mechanics?.buffs || {};
        const debuffs = supplier.mechanics?.debuffs || {};
        const GENERIC_DPS_BUFFS = new Set(['atk', 'cr', 'cd', 'pen', 'stun-multiplier']);
        const evaluatableBuffs = Object.entries(buffs).filter(
            ([key, value]) => !GENERIC_DPS_BUFFS.has(key) && w(value) >= 2
        );
        const evaluatableDebuffs = Object.entries(debuffs).filter(
            ([key, value]) => w(value) >= 2
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
        return 0.65 + 0.35 * rawUtil;
    }

    const buffs = supplier.mechanics?.buffs || {};
    const debuffs = supplier.mechanics?.debuffs || {};
    const utility = supplier.mechanics?.utility || {};
    let totalWeight = 0;
    let effectiveWeight = 0;
    let coreWeight = 0;
    let coreEffective = 0;
    let coreImpact = 0;

    for (const [key, value] of Object.entries(buffs)) {
        const bw = w(value);
        if (bw <= 0) continue;
        totalWeight += bw;

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
        const dw = w(value);
        if (dw <= 0) continue;
        totalWeight += dw;
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
    return Math.min(1.0, Math.max(adjustedRatio, threshold, coreRatio));
}

// ============================================================================
// LAYER 1: DISQUALIFICATIONS
// ============================================================================

function checkDisqualifications(team, boss, debug) {
    const dpsUnits = team.filter(isDPS);

    if (dpsUnits.length === 0) {
        if (debug) console.log('  DISQUALIFIED: No DPS unit');
        return -1;
    }

    const pureDpsCount = dpsUnits.filter(u => !isSupport(u) && !isDefense(u) && !isStun(u)).length;
    if (pureDpsCount >= 3) {
        if (debug) console.log('  DISQUALIFIED: Triple DPS');
        return -1;
    }

    if (boss.anti && boss.anti.length > 0) {
        for (const antiType of boss.anti) {
            if (dpsUnits.some(u => u.tags.includes(antiType))) {
                if (debug) console.log(`  DISQUALIFIED: DPS matches boss anti-type ${antiType}`);
                return -1;
            }
        }
    }

    for (const unit of dpsUnits) {
        if (boss.resistances.includes(getElement(unit))) {
            if (isSupport(unit) || isDefense(unit)) continue;
            if (debug) console.log(`  DISQUALIFIED: ${unit.name} element resisted by boss`);
            return -1;
        }
    }

    const defensiveAssistCount = team.filter(hasDefensiveAssist).length;
    if (defensiveAssistCount < boss.assists) {
        if (debug) console.log(`  DISQUALIFIED: ${defensiveAssistCount}/${boss.assists} defensive assists`);
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
    const attackers = team.filter(u => isAttacker(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const anomalyUnits = team.filter(u => isAnomaly(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const ruptureUnits = team.filter(u => isRupture(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const stunUnits = team.filter(isStun);
    const supportLike = team.filter(u => isSupport(u) || isDefense(u));
    const dpsUnits = team.filter(isDPS);

    const nAtk = attackers.length;
    const nAno = anomalyUnits.length;
    const nRup = ruptureUnits.length;
    const nStun = stunUnits.length;
    const nSup = supportLike.length;

    // --- CONVENTIONAL COMPOSITIONS ---

    // Attacker + Stunner + Support/Defense
    if (nAtk === 1 && nStun >= 1 && nSup >= 1 && nAno === 0 && nRup === 0) {
        if (debug) console.log('    Structure: CONVENTIONAL (attacker + stunner + support)');
        return STRUCTURE.CONVENTIONAL_BONUS;
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

    const dpsUnits = team.filter(u => isDPS(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const attackers = team.filter(u => isAttacker(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const anomalyUnits = team.filter(u => isAnomaly(u) && !isSupport(u) && !isDefense(u) && !isStun(u));
    const supportUnits = team.filter(isSupport);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isDefense);

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
        const forcedSecondary =
            (isAttacker(unit) && isForcedSecondaryDPS(unit, attackers)) ||
            (isAnomaly(unit) && isForcedSecondaryDPS(unit, anomalyUnits)) ||
            (isRupture(unit) && isForcedSecondaryDPS(unit, team.filter(isRupture)));
        if (forcedSecondary) forcedSecondaryUnits.add(unit);
        let tierMult = (isSecondaryAttacker || isSecondaryAnomaly || forcedSecondary) ? 0.5 : 1.0;
        const unitReaction = reactions.get(unit);
        const reactionDisabled = isSubDPS && isAnomaly(unit) &&
            !(unitReaction?.bestVortexTier > 0 || unitReaction?.hasDisorder);
        if (reactionDisabled) {
            tierMult *= 0.5;
            reactionDisabledUnits.add(unit);
        }

        let tierBonus = 0;
        if (tier <= 0.5)      tierBonus = (65 - (tier * 20)) * tierMult;
        else if (tier <= 1.5) tierBonus = (25 - ((tier - 1) * 10)) * tierMult;
        else if (tier <= 2)   tierBonus = -(lenient ? 15 : 40);
        else if (tier <= 3)   tierBonus = -(lenient ? 40 : 130);
        else                  tierBonus = -(lenient ? 60 : 130);
        score += tierBonus;

        if (isTitled(unit)) {
            const titledBonus = forcedSecondary ? Math.round(20 * tierMult) : 20;
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
        if (totalizeWeight > 0) {
            const teammates = team.filter(t => t !== unit);
            let stunInfra = 0;
            for (const t of teammates) {
                const tRoles = getEffectiveRoles(t);
                if (tRoles.includes('stun')) {
                    stunInfra += 1;
                } else {
                    const hasHighDaze = w(t.mechanics?.utility?.daze) >= 2;
                    if (hasHighDaze) stunInfra += 0.3;
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
        if (tier <= 0.5)      tierBonus = 23 - (tier * 8);
        else if (tier <= 1.5) tierBonus = 9 - ((tier - 1) * 4);
        else if (tier <= 2)   tierBonus = -(lenient ? 5 : 14);
        else if (tier <= 3)   tierBonus = -(lenient ? 20 : 60);
        else                  tierBonus = -(lenient ? 40 : 100);

        let rankBonus = 0;
        if (isStun(unit)) {
            if (isSRank(unit)) { rankBonus += 10; if (isLimited(unit)) rankBonus += 5; }
            else if (isARank(unit)) rankBonus = -5;
        } else {
            if (isSRank(unit)) { rankBonus += 10; if (isLimited(unit)) rankBonus += 8; }
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
            rankBonus += 20;
            if (isTitled(unit)) rankBonus += 15;
            if (isLimited(unit)) rankBonus += 10;
        } else if (isARank(unit)) {
            const tier = unit.tier ?? 2.5;
            rankBonus = (tier >= 2) ? -(lenient ? 25 : 80) : -10;
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
    
    const dpsUnits = team.filter(isDPS);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isDefense);

    if (debug) console.log('\n  LAYER 3: BOSS MATCHUP');

    // --- Shill preference ---
    if (boss.shill) {
        const isDPSShill = DPS_ROLES.includes(boss.shill);
        if (isDPSShill) {
            const hasShilledDPS = dpsUnits.some(u => u.tags.includes(boss.shill) && !isSupport(u) && !isDefense(u));
            if (hasShilledDPS) {
                score += 15;
                if (debug) console.log(`    Shill match (${boss.shill}): +15`);
            }
        } else {
            if (!team.some(u => u.tags.includes(boss.shill))) {
                if (debug) console.log(`    DISQUALIFIED: Missing required role ${boss.shill}`);
                return { score: -1, disqualified: true };
            }
            score += 15;
            if (debug) console.log(`    Non-DPS shill match (${boss.shill}): +15`);
        }
    }
    
    // --- Favored units ---
    const shillIntensity = boss.shillIntensity ?? 1;
    if (boss.favored && boss.favored.length > 0) {
        let favoredCount = 0;
        for (const unit of team) {
            if (boss.favored.includes(unit.name)) {
                favoredCount++;
                const multiplier = favoredCount === 1
                    ? shillIntensity
                    : 1 + (shillIntensity - 1) * 0.5;
                const bonus = Math.round(35 * multiplier);
                score += bonus;
                if (debug) console.log(`    Favored: ${unit.name} +${bonus} (intensity ${shillIntensity}, #${favoredCount})`);
            }
        }
    }
    
    // --- DPS element weakness/resistance ---
    const l3Reactions = computeAnomalyReactions(team, boss);
    for (const unit of dpsUnits) {
        const element = getElement(unit);

        if (boss.weaknesses.includes(element)) {
            const isSubDPS = hasSubDPSRole(unit);
            const unitReaction = l3Reactions.get(unit);
            const reactionDisabled = isSubDPS && isAnomaly(unit) &&
                !(unitReaction?.bestVortexTier > 0 || unitReaction?.hasDisorder);
            let bonus = isSRank(unit)
                ? (isSubDPS ? 25 : 40)
                : (isSubDPS ? 10 : 20);
            if (reactionDisabled) bonus = Math.round(bonus * 0.5);
            score += bonus;
            if (debug) console.log(`    ${unit.name} on-element (${element}): +${bonus}${reactionDisabled ? ' (reaction-disabled)' : ''}`);

            if (isTitled(unit) && boss.shill && DPS_ROLES.includes(boss.shill) && !unit.tags.includes(boss.shill)) {
                score += 30;
                if (debug) console.log(`    ${unit.name} titled on-element vs shill mismatch: +30`);
            }
        }
    }

    if (boss.weaknesses.length > 0) {
        const primaryDPS = dpsUnits.filter(u => !hasSubDPSRole(u));
        const onCount = primaryDPS.filter(u => boss.weaknesses.includes(getElement(u))).length;
        const offCount = primaryDPS.length - onCount;

        if (offCount > 0 && primaryDPS.length > 0) {
            const offRatio = offCount / primaryDPS.length;
            const singleWeakness = boss.weaknesses.length === 1;
            const basePenalty = singleWeakness ? 45 : 30;
            const hasTitled = primaryDPS.some(u => isTitled(u) && !boss.weaknesses.includes(getElement(u)));
            const titledReduction = hasTitled ? 0.5 : 1.0;
            const applied = Math.round(basePenalty * offRatio * titledReduction);
            score -= lenient ? Math.floor(applied / 2) : applied;
            if (debug) console.log(`    Off-element DPS penalty: -${lenient ? Math.floor(applied / 2) : applied} (${offCount}/${primaryDPS.length} off, base=${basePenalty}${hasTitled ? ', titled' : ''})`);
        }
    }

    // --- Stunner element ---
    for (const unit of stunUnits) {
        const element = getElement(unit);
        if (boss.resistances.includes(element)) {
            score -= 80;
            if (debug) console.log(`    ${unit.name} stun element resisted: -80`);
        }
        if (boss.weaknesses.includes(element)) {
            const util = computeBuffUtilization(unit, team);
            const scaledBonus = Math.round(15 * util);
            score += scaledBonus;
            if (debug) console.log(`    ${unit.name} stun on-element: +${scaledBonus} (util ${Math.round(util * 100)}%)`);
        } else if (!boss.resistances.includes(element) && boss.weaknesses.length > 0) {
            score -= 15;
            if (debug) console.log(`    ${unit.name} stun off-element: -15`);
        }
    }

    // --- Pseudo-role vs boss anti-type ---
    if (boss.anti && boss.anti.length > 0) {
        for (const unit of team) {
            if (isDPS(unit)) continue;
            const pr = unit.mechanics?.pseudoRole;
            if (!pr) continue;
            const pseudoRoles = pr.split(',').map(s => s.trim());
            for (const antiType of boss.anti) {
                if (pseudoRoles.includes(antiType)) {
                    score -= 30;
                    if (debug) console.log(`    ${unit.name} pseudo-role '${antiType}' matches boss anti: -30`);
                }
            }
        }
    }

    // --- Defense element ---
    for (const unit of defenseUnits) {
        const element = getElement(unit);
        if (boss.weaknesses.includes(element)) {
            score += 3;
            if (debug) console.log(`    ${unit.name} defense on-element: +3`);
        }
    }

    // --- Damage-relevant resistance for support/defense units ---
    for (const unit of team) {
        const element = getElement(unit);
        if (!boss.resistances.includes(element)) continue;
        if (!isSupport(unit) && !isDefense(unit)) continue;
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
    if (boss.assists >= 2) {
        const extra = team.filter(hasDefensiveAssist).length - boss.assists;
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
    const supplierBuffs = supplier.mechanics?.buffs || {};
    const supplierDebuffs = supplier.mechanics?.debuffs || {};
    const consumerRoles = getEffectiveRoles(consumer);
    const consumerElement = getElement(consumer);
    const firedCategories = new Set();
    const dbg = (cat, val) => {
        if (val > 0) firedCategories.add(cat);
        if (debug && val > 0) console.log(`        ${cat}: ${val.toFixed(1)}`);
    };

    // ATK buffs → all DPS
    if (supplierBuffs.atk) {
        const cw = resolveBaselineWeight(consumer, 'atk');
        if (cw > 0) {
            const isRup = consumerRoles.includes('rupture');
            const supply = isRup ? w(supplierBuffs.atk) * RUPTURE_ATK_EFFICIENCY : w(supplierBuffs.atk);
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

    // Stun-multiplier buffs → all DPS
    if (supplierBuffs['stun-multiplier']) {
        const cw = isDPSByRoles(consumerRoles) ? 1 : 0;
        if (cw > 0) {
            const val = w(supplierBuffs['stun-multiplier']) * cw * MULT.STUN_MULT_BUFF;
            score += val;
            dbg('stun-multiplier', val);
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
    const supplierUtility = supplier.mechanics?.utility || {};
    const ultimatesWeight = w(supplierUtility.ultimates);
    if (ultimatesWeight > 0 && isDPSByRoles(consumerRoles) && !hasSubDPSRole(consumer)) {
        const burstWeight = getMaxBurstWeight(consumer);
        const val = ultimatesWeight * burstWeight * MULT.ULTIMATES_PROVISION;
        score += val;
        dbg('ultimates', val);
    }

    return { score, firedCategories };
}

// --- Need Fulfillment ---

function scoreNeedFulfillment(supplier, consumer, debug, options = {}) {
    let score = 0;
    const scaling = getEffectiveScaling(consumer);
    const supplierBuffs = supplier.mechanics?.buffs || {};
    const supplierDebuffs = supplier.mechanics?.debuffs || {};
    const supplierUtility = supplier.mechanics?.utility || {};

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
        if (supplyWeight > 0) {
            const fulfillment = Math.min(1, supplyWeight / scalingWeight);
            const val = supplyWeight * scalingWeight * MULT.NEED_FULFILLMENT * fulfillment;
            score += val;
            if (debug) console.log(`        need(${key}): ${val.toFixed(1)}${fulfillment < 1 ? ` (gated ${Math.round(fulfillment * 100)}%)` : ''}`);
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
    const consumerDamage = consumer.mechanics?.damage || {};
    for (const [damageType, damageWeight] of Object.entries(consumerDamage)) {
        const dw = w(damageWeight);
        if (dw === 0) continue;
        let buffWeight = w(supplierBuffs[damageType]);
        if (damageType === 'polarity') {
            buffWeight = Math.max(buffWeight, w(supplierBuffs.disorders));
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
        const buffs = s.mechanics?.buffs || {};
        const debuffs = s.mechanics?.debuffs || {};
        const atkCdWeight = Math.max(w(buffs.atk), w(buffs.cd));
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
    if (boss && boss.weaknesses?.length > 0) {
        for (const consumer of team) {
            const roles = getEffectiveRoles(consumer);
            if (!isDPSByRoles(roles)) continue;
            const element = getElement(consumer);
            const base = consumerScores.get(consumer.name) || 0;
            if (base <= 0) continue;
            if (boss.weaknesses.includes(element)) {
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
            }
            if (needsTotal > 0 && needsMet < needsTotal) {
                const reception = needsMet / needsTotal;
                const receptionUtil = 0.6 + 0.4 * reception;
                const weight = Math.min(0.5, needsTotal * 0.25);
                logSum += weight * Math.log(Math.max(receptionUtil * receptionUtil, 0.01));
                totalWeight += weight;
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
        if (pseudo && !isDPS(unit)) {
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
                for (const pr of pseudo.split(',').map(s => s.trim())) {
                    if (DPS_ROLES.includes(pr) && !(unit._activatedRoles || []).includes(pr)) {
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
    const baseScore = lenient ? 200 : 100;
    let score = baseScore;

    for (const unit of team) {
        unit._activatedRoles = computeActivatedRoles(unit, team);
    }

    if (debug) {
        const teamLabel = team.map(u => u.name).join(' / ');
        console.log(`\n${'='.repeat(60)}`);
        console.log(`SCORING: ${teamLabel}`);
        console.log(`Boss: ${boss.name}`);
        console.log(`Base score: ${baseScore}`);
    }

    const cleanupRoles = () => { for (const u of team) delete u._activatedRoles; };

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
        const supLike = team.filter(u => isSupport(u) || isDefense(u));
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

    // Field-time economy (stunners have brief rotations that don't compete for DPS field time)
    const onFieldCount = team.filter(isOnField).length;
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

    // Layer 4: Mechanical Synergy
    const antiRupture = boss.anti?.includes('rupture') || false;
    score += scoreMechanicalSynergy(team, debug, { antiRupture, boss });

    // Layer 5: Additional Synergies
    score += scoreAdditionalSynergies(team, debug);

    // Apply teamwork multiplier (replaces additive structure scoring)
    const rawScore = score;
    let maxDiametricPairs = 0;
    let maxDiametricFloor = 0;
    const antiRuptureBoss = boss.anti?.includes('rupture') || false;
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
