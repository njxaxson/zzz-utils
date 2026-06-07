/**
 * Pull Recommendations Engine
 * Shared analysis logic for gap detection and recommendation scoring.
 * Used by both the web UI (pull-recommendations.js) and CLI debug tool (pull-debug.js).
 */

import { ELEMENTS, DPS_ROLES } from './constants.js';
import {
    hasSubDPSRole,
    getElement,
    getEffectiveScaling,
    getEffectiveRoles
} from './team-scorer.js';
import { getTeams } from './team-builder.js';

export { ELEMENTS };
export const DPS_ARCHETYPES = DPS_ROLES;

const NATURALLY_AVAILABLE_KEYS = new Set(['chains', 'ultimates']);
const FOUNDATIONAL_STAT_KEYS = new Set([
    'cr', 'cd', 'atk', 'pen', 'hp', 'def', 'ap', 'am'
]);
const CODEPENDENT_SKIP_KEYS = new Set([
    ...NATURALLY_AVAILABLE_KEYS, ...FOUNDATIONAL_STAT_KEYS, 'codependent'
]);

// ============================================================================
// HELPERS
// ============================================================================

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

export function isSubdps(unit) {
    return hasSubDPSRole(unit);
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

// ============================================================================
// MECHANICS EVALUATION HELPERS
// ============================================================================

function w(value) {
    if (value === true) return 1;
    if (typeof value === 'number') return value;
    return 0;
}

/**
 * Lightweight L4-style pairwise mechanical fit score.
 * Evaluates how well supplier's buffs/debuffs/utility serve consumer's needs.
 */
function mechanicsFitScore(supplier, consumer) {
    let score = 0;
    const sBuf = supplier.mechanics?.buffs || {};
    const sDebuf = supplier.mechanics?.debuffs || {};
    const sUtil = supplier.mechanics?.utility || {};
    const cTags = consumer.tags;
    const cMech = consumer.mechanics || {};
    const cScaling = getEffectiveScaling(consumer);
    const cDamage = cMech.damage || {};
    const cElement = getUnitElement(consumer);
    const sElement = getUnitElement(supplier);

    const isAtkDPS = cTags.includes('attack');
    const isAnoDPS = cTags.includes('anomaly');
    const isRupDPS = cTags.includes('rupture');
    const isDPS = isAtkDPS || isAnoDPS || isRupDPS;
    if (!isDPS) return 0;

    const atkW = w(sBuf.atk);
    if (atkW > 0 && isDPS) {
        score += atkW * (isRupDPS ? 0.33 : 1) * 2;
    }
    if (w(sBuf.anomaly) > 0 && isAnoDPS) score += w(sBuf.anomaly) * 3;
    if (w(sBuf.sheer) > 0 && isRupDPS) score += w(sBuf.sheer) * 5;
    const crW = w(sBuf.cr), cdW = w(sBuf.cd);
    if (crW > 0) score += crW * (isAnoDPS ? 0.3 : 2);
    if (cdW > 0) score += cdW * (isAnoDPS ? 0.3 : 2);
    if (w(sBuf.pen) > 0 && isDPS && !isRupDPS) score += w(sBuf.pen) * 2;
    if (w(sDebuf.defense) > 0 && isDPS && !isRupDPS) score += w(sDebuf.defense) * 3;
    if (w(sDebuf.recovery) > 0 && isDPS) {
        const burst = Math.max(1, ...Object.values(cDamage).map(v => typeof v === 'number' ? v : 1));
        score += w(sDebuf.recovery) * burst;
    }
    const isStunless = cMech.utility?.stunless === true;
    if (!isStunless && (isAtkDPS || isRupDPS)) {
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

    // Damage types that represent actual game mechanics one unit can produce for another.
    // Generic descriptors like ultimate:strong / enhanced just describe the unit's own kit
    // and do NOT imply the supplier is generating that mechanic for the consumer.
    const MECHANIC_DAMAGE_TYPES = new Set(['aftershock', 'abloom', 'chain', 'chains', 'polarity', 'totalize']);
    const sDamage = supplier.mechanics?.damage || {};
    for (const [dmgType, dmgVal] of Object.entries(cDamage)) {
        const dw = w(dmgVal);
        if (dw === 0) continue;
        let buffW = w(sBuf[dmgType]);
        if (dmgType === 'polarity') buffW = Math.max(buffW, w(sBuf.disorders));
        if (buffW > 0) score += buffW * dw * 2;
        const supplyDmg = w(sDamage[dmgType]);
        if (supplyDmg > 0 && MECHANIC_DAMAGE_TYPES.has(dmgType)) score += supplyDmg * dw * 2;
    }

    // Vortex buff → anomaly consumers (contextual bonus; no reactions context here,
    // so gate on consumer being anomaly as a conservative proxy).
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

    return score;
}

// ============================================================================
// CODEPENDENT SCALING — TEAM DEPENDENCY CHECK
// ============================================================================

/**
 * Check whether a candidate DPS unit's specialist scaling needs can be met
 * by the player's roster. Gated on mechanics.scaling.codependent.
 *
 * @returns {{ hasUnmetDependency: boolean, cannotFormTeam: boolean,
 *             notes: Array<{ text: string, providers: Array<{id,name}> }> }}
 */
export function checkTeamDependencies(candidate, ownedUnits, allUnits) {
    const empty = { hasUnmetDependency: false, cannotFormTeam: false, notes: [] };

    if (!candidate.mechanics?.scaling?.codependent) return empty;

    const isDPSUnit = DPS_ARCHETYPES.some(a => candidate.tags.includes(a));
    if (!isDPSUnit || isSubdps(candidate)) return empty;

    const scaling = getEffectiveScaling(candidate);
    const notes = [];
    let hasUnmetDependency = false;

    const selfBuffs = candidate.mechanics?.buffs || {};
    const selfUtil = candidate.mechanics?.utility || {};

    // Step 1: specialist scaling provider check
    for (const [key, level] of Object.entries(scaling)) {
        if (CODEPENDENT_SKIP_KEYS.has(key)) continue;
        const scalingW = w(level);
        if (scalingW === 0) continue;

        // P22: skip self-provided needs
        const selfSupply = Math.max(w(selfBuffs[key]), w(selfUtil[key]));
        if (selfSupply >= scalingW) continue;

        const met = ownedUnits.some(u => {
            const buf = u.mechanics?.buffs || {};
            const debuf = u.mechanics?.debuffs || {};
            const util = u.mechanics?.utility || {};
            return Math.max(w(buf[key]), w(debuf[key]), w(util[key])) >= scalingW;
        });

        if (!met) {
            hasUnmetDependency = true;
            const providers = allUnits
                .filter(u => {
                    if (u.id === candidate.id) return false;
                    if (!u.limited || u.rank !== 'S') return false;
                    const buf = u.mechanics?.buffs || {};
                    const debuf = u.mechanics?.debuffs || {};
                    const util = u.mechanics?.utility || {};
                    return Math.max(w(buf[key]), w(debuf[key]), w(util[key])) >= scalingW;
                })
                .sort((a, b) => a.tier - b.tier)
                .map(u => ({ id: u.id, name: u.name }));
            notes.push({
                text: `Needs ${providers.map(p => p.name).join(' or ')} to reach full potential`,
                providers
            });
        }
    }

    // Step 2: disorder feasibility (for units with scaling.disorders)
    const disorderScaling = w(scaling.disorders);
    if (disorderScaling > 0 && !CODEPENDENT_SKIP_KEYS.has('disorders')) {
        const candidateBaseEl = getElement(candidate)?.split(':')[0] || getUnitElement(candidate);
        const hasDisorderPartner = ownedUnits.some(u => {
            const uEl = getElement(u)?.split(':')[0] || getUnitElement(u);
            if (uEl === candidateBaseEl || uEl === 'wind' || uEl === 'unknown') return false;
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
                    const uEl = getElement(u)?.split(':')[0] || getUnitElement(u);
                    if (uEl === candidateBaseEl || uEl === 'wind' || uEl === 'unknown') return false;
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
        const candidateBaseEl = getElement(candidate)?.split(':')[0] || getUnitElement(candidate);
        const hasTeamWithDisorder = validTeams.some(team =>
            team.some(u => {
                if (u.id === candidate.id) return false;
                const uEl = getElement(u)?.split(':')[0] || getUnitElement(u);
                if (uEl === candidateBaseEl || uEl === 'wind' || uEl === 'unknown') return false;
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

    return { hasUnmetDependency, cannotFormTeam, notes };
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

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

/**
 * Run the full pull recommendation analysis.
 * @param {Array} allUnits
 * @param {Object} unitStates - { unitId: { owned: boolean } }
 * @param {Array} ownedUnits
 * @param {Object} [options]
 * @param {number} [options.maxRecommendations=5]
 * @returns {{ assessment, recommendations, coverage, allGaps, compositeScore, calibration }}
 */
export function analyze(allUnits, unitStates, ownedUnits, { maxRecommendations = 5 } = {}) {
    const ownedDPS = { attack: [], anomaly: [], rupture: [] };
    const ownedSubdps = { anomaly: [], attack: [] };
    const ownedSupports = [];
    const ownedStunners = [];
    const ownedByElement = {};
    for (const el of ELEMENTS) ownedByElement[el] = [];

    for (const unit of ownedUnits) {
        for (const arch of DPS_ARCHETYPES) {
            if (unit.tags.includes(arch)) {
                ownedDPS[arch].push(unit);
                const el = getUnitElement(unit);
                if (el !== 'unknown' && !ownedByElement[el].some(u => u.id === unit.id)) {
                    ownedByElement[el].push(unit);
                }
            }
        }
        if (isSubdps(unit)) {
            if (unit.tags.includes('anomaly')) ownedSubdps.anomaly.push(unit);
            if (unit.tags.includes('attack')) ownedSubdps.attack.push(unit);
        }
        if (unit.tags.includes('support') || unit.tags.includes('defense')) {
            ownedSupports.push(unit);
        }
        if (unit.tags.includes('stun')) {
            ownedStunners.push(unit);
        }
    }

    const allOwnedDPS = [
        ...new Set([...ownedDPS.attack, ...ownedDPS.anomaly, ...ownedDPS.rupture])
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
        dpsQuality.attack, dpsQuality.anomaly, dpsQuality.rupture,
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

    detectDPSGaps(gaps, dpsQuality, ownedDPS, unownedLimitedS, sortWithDPS);
    detectSupportGaps(gaps, ownedSupports, ownedDPS, dpsQuality, unownedLimitedS);
    detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortWithDPS);
    detectStunnerElementGap(gaps, ownedStunners, elementQuality, unownedLimitedS, sortWithDPS);
    detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortWithDPS);
    detectAnomalyPartnerGap(gaps, ownedUnits, ownedDPS, ownedSubdps, unownedLimitedS, dpsQuality);
    detectElementGaps(gaps, elementQuality, unownedLimitedS, sortWithDPS);
    detectSynergies(gaps, ownedUnits, unownedLimitedS, unitByName, ownedByName, dpsQuality, elementQuality);
    const unitGapScoreOverrides = new Map(); // individual unit scores for mech-synergy gaps
    detectMechanicalSynergies(gaps, ownedUnits, unownedLimitedS, dpsQuality, elementQuality, unitGapScoreOverrides);
    detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortWithDPS);

    for (const gap of gaps) {
        gap.rawScore = gap.score;
        gap.score = Math.max(
            Math.round(gap.score * calibration),
            compositeScore > 70 ? Math.round(gap.rawScore * 0.35) : 0
        );
    }

    gaps.sort((a, b) => b.score - a.score);

    // For loaded rosters where calibration compresses everything below absolute thresholds,
    // use relative priority: the top remaining gap becomes High, comparable ones Medium.
    // gap.priority is stored on each gap so external consumers (e.g. banner tile verdicts)
    // use the same logic rather than re-deriving from raw scores with absolute thresholds.
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

    // ── Unit-centric aggregation ─────────────────────────────────────────────
    // Each unowned candidate collects all the gaps it appears in, with a per-unit
    // contribution score (individual mech-fit for mech-synergy gaps; gap.score for
    // everything else, both calibrated for apples-to-apples comparison).
    //
    // Each unit's PRIMARY GAP is the gap where it scores highest — that is the one
    // display card it belongs to. Secondary gaps surface as "Also:" reasons on that card.
    // This eliminates all dedup complexity: a unit lives in exactly one card.

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

    // Update mech-synergy gap reasons to match the units that actually ended up in each card.
    // Without this, a gap's stored reason reflects the full detection-phase group (which may include
    // units that migrated to other cards as their primary), causing stale names in "Also:" text.
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

    const recommendations = [];
    for (const card of sortedCards) {
        if (recommendations.length >= maxRecommendations) break;

        const cardProfiles = card.profiles.slice(0, 5);
        const cardUnits = cardProfiles.map(p => p.unit);

        // Card priority = highest composite priority among its units
        const cardPriority = cardProfiles
            .map(p => getCompositePriority(p))
            .reduce((best, p) => PRIORITY_VALS[p] > PRIORITY_VALS[best] ? p : best, 'Low');
        const cardPriorityRank = GAP_PRIORITY_RANK[cardPriority] ?? 0;

        const isMechSynergyCard = card.gap.id.startsWith('mech-synergy-') && card.gap.bestPairName;

        // For mech-synergy cards, use the actual recommended agent name(s) as the title —
        // "Lighter, Norma" is clearer than "Synergy with Evelyn" since the framing is
        // who to pull, not who they pair with (the reason covers that).
        const displayTitle = isMechSynergyCard
            ? cardUnits.map(u => u.name).join(', ')
            : card.gap.title;

        // Mech-synergy reason reflects the actual units in this card (which may differ
        // from the original gap's full unit list once each unit picks its own primary)
        let displayReason = card.gap.reason;
        if (isMechSynergyCard) {
            displayReason = buildMechSynergyReason(cardUnits, card.gap.bestPairName);
        }

        // Additional reasons: union of secondary-gap reasons from all card units,
        // Collect secondary reasons in two buckets:
        //  • mechSynergyByUnit — groups all owned-pair names per recommended unit so multiple
        //    pairs for the same unit collapse into one sentence ("X has synergy with Y and Z")
        //  • structuralReasons — structural gaps (stunner, element, depth), deduped by gap ID
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

        recommendations.push({
            priority: cardPriority,
            title: displayTitle,
            reason: displayReason,
            additionalReasons,
            score: card.cardScore,
            rawScore: card.gap.rawScore ?? card.gap.score,
            units: cardUnits
        });
    }

    // ── Codependent scaling: post-process recommendations ───────────────────
    const PRIORITY_DROP = { 'High': 'Medium', 'Medium': 'Low', 'Low': null };
    for (const rec of recommendations) {
        const primaryUnit = rec.units[0];
        if (!primaryUnit) continue;
        const dep = checkTeamDependencies(primaryUnit, ownedUnits, allUnits);
        if (dep.hasUnmetDependency || dep.cannotFormTeam) {
            rec.teamDependencyNotes = dep.notes;
            rec.priority = PRIORITY_DROP[rec.priority] ?? null;
        }
    }
    const filteredRecommendations = recommendations.filter(r => r.priority !== null);

    const limitedSCount = ownedUnits.filter(u => u.rank === 'S' && u.limited).length;
    const highPriorityGapCount = gaps.filter(g => g.priority === 'High').length;
    const assessment = buildAssessment(
        dpsQuality, supportQuality, stunnerQuality, elementQuality,
        compositeScore, limitedSCount,
        { ownedDPS, ownedSupports, ownedStunners },
        highPriorityGapCount, gaps
    );

    return {
        assessment,
        recommendations: filteredRecommendations,
        coverage: {
            dpsQuality, supportQuality, stunnerQuality, elementQuality,
            ownedDPS, ownedSubdps, ownedSupports, ownedStunners, ownedByElement
        },
        allGaps: gaps,
        compositeScore,
        calibration
    };
}

// ============================================================================
// GAP DETECTORS
// ============================================================================

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
        const reason = hasSubdpsOnly
            ? `You have ${arch} sub-DPS agents but no primary ${arch} DPS to lead your teams`
            : quality === 0
            ? `You have no ${arch} DPS at all`
            : quality <= 25
            ? `Your ${arch} DPS coverage is very weak — a major upgrade is available`
            : !hasAnySRank
            ? `Your ${arch} coverage relies entirely on A-rank options — a premium DPS would be a significant upgrade`
            : quality <= 40
            ? `Your best ${arch} option is borderline — a premium DPS would be a major improvement`
            : `You have decent ${arch} coverage, but a premium option would strengthen your roster`;

        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes(arch) && !isSubdps(u))
        );

        if (candidates.length > 0) {
            gaps.push({ id: `dps-${arch}`, title: `${capitalize(arch)} DPS`, reason, score, units: candidates });
        }
    }
}

function detectSupportGaps(gaps, ownedSupports, ownedDPS, dpsQuality, unownedLimitedS) {
    const ownedLimitedSupports = ownedSupports.filter(u => u.rank === 'S' && u.limited);
    const supportCandidates = unownedLimitedS.filter(u =>
        u.tags.includes('support') || u.tags.includes('defense')
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

    // Per-archetype holistic support evaluation —
    // Only premium (limited S) supports count toward coverage. A-rank supports
    // are stopgaps and should not mask the need for a proper premium support.
    const hasFewPremiumSupports = ownedLimitedSupports.length <= 1;
    const DPS_ARCH_SET = new Set(DPS_ARCHETYPES);

    function canJoinArchetype(unit, arch) {
        const join = unit.join ?? [];
        if (join.includes(arch)) return true;
        // If join doesn't reference any DPS archetype, the unit is not
        // archetype-restricted (e.g. Nicole joins on assist:evasive).
        return !join.some(tag => DPS_ARCH_SET.has(tag));
    }

    for (const arch of DPS_ARCHETYPES) {
        if (dpsQuality[arch] <= 0) continue;

        const primaryUnits = ownedDPS[arch].filter(u => !isSubdps(u));
        if (primaryUnits.length === 0) continue;
        const bestDPS = primaryUnits.reduce((best, u) => u.tier < best.tier ? u : best);

        const archCompatibleOwned = ownedLimitedSupports.filter(s => canJoinArchetype(s, arch));
        const bestOwnedFit = archCompatibleOwned.reduce(
            (max, s) => Math.max(max, mechanicsFitScore(s, bestDPS)), 0
        );
        if (bestOwnedFit >= SUPPORT_GOOD_FIT) continue;

        const MIN_CANDIDATE_FIT = SUPPORT_GOOD_FIT / 3;
        const ranked = supportCandidates
            .filter(c => canJoinArchetype(c, arch))
            .map(c => ({ unit: c, fit: mechanicsFitScore(c, bestDPS) }))
            .filter(c => c.fit > bestOwnedFit && c.fit >= MIN_CANDIDATE_FIT)
            .sort((a, b) => {
                if (a.unit.tier !== b.unit.tier) return a.unit.tier - b.unit.tier;
                return b.fit - a.fit;
            })
            .map(x => x.unit);
        if (ranked.length === 0) continue;

        // Fit below a minimum threshold counts as zero — a tiny incidental
        // contribution (e.g. Lucia's cd:1 for attackers) is not real coverage.
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

function detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortCandidatesFn) {
    const limitedStunnerCount = ownedStunners.filter(u => u.rank === 'S' && u.limited).length;

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
        if (dpsQuality.attack >= 75 || dpsQuality.rupture >= 75) score = 50;
        if (dpsQuality.attack >= 75 && dpsQuality.rupture >= 75) score = 60;

        const reason = 'You only have one limited stunner — a second option would give flexibility across different team compositions';
        const candidates = sortCandidatesFn(unownedLimitedS.filter(u => u.tags.includes('stun')));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner-depth', title: 'Stunner Coverage', reason, score, units: candidates });
        }
    }
}

function detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortCandidatesFn) {
    const anomBest = getBestTier(ownedSubdps.anomaly);
    const anomSubdpsQuality = anomBest !== null ? tierToQuality(anomBest) : 0;
    if (dpsQuality.anomaly >= 50 && anomSubdpsQuality < 40) {
        const score = anomSubdpsQuality === 0 ? 45 : 35;
        const reason = anomSubdpsQuality === 0
            ? 'Anomaly teams perform best with two anomaly agents — you need a sub-DPS partner'
            : 'Anomaly teams perform best with two anomaly agents — your current sub-DPS is too weak to reliably fill this role';
        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes('anomaly') && isSubdps(u))
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
            unownedLimitedS.filter(u => u.tags.includes('attack') && isSubdps(u))
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

    const ownedAnomalySubdps = ownedSubdps.anomaly;
    const ownedPseudoAnomaly = ownedUnits.filter(u => {
        if (isSubdps(u)) return false;
        const pr = u.mechanics?.pseudoRole;
        return Array.isArray(pr) && pr.some(entry => (typeof entry === 'string' ? entry : entry?.role) === 'anomaly');
    });
    const disorderPartners = [...ownedAnomalySubdps, ...ownedPseudoAnomaly];

    const PARTNER_QUALITY_THRESHOLD = 40;

    const hasSufficientCoverage = disorderPartners.some(partner => {
        const partnerEl = getUnitElement(partner);
        const partnerQuality = partner.tier != null ? tierToQuality(partner.tier) : 0;
        const coversAtLeastOneDPS = primaryAnomalyOwned.some(dps => getUnitElement(dps) !== partnerEl);
        return coversAtLeastOneDPS && partnerQuality >= PARTNER_QUALITY_THRESHOLD;
    });

    if (hasSufficientCoverage) return;

    const uncoveredDPS = primaryAnomalyOwned.filter(dps => {
        const dpsEl = getUnitElement(dps);
        return !disorderPartners.some(p =>
            getUnitElement(p) !== dpsEl &&
            (p.tier != null ? tierToQuality(p.tier) : 0) >= PARTNER_QUALITY_THRESHOLD
        );
    });

    const candidates = unownedLimitedS
        .filter(u => {
            const isAnoSubdps = isSubdps(u) && u.tags.includes('anomaly');
            const pr = u.mechanics?.pseudoRole;
            const isPseudoAnomaly = Array.isArray(pr) && pr.some(entry => (typeof entry === 'string' ? entry : entry?.role) === 'anomaly') && !isSubdps(u);
            return isAnoSubdps || isPseudoAnomaly;
        })
        .sort((a, b) => {
            const aEl = getUnitElement(a);
            const bEl = getUnitElement(b);
            const aDiffers = primaryAnomalyOwned.some(dps => getUnitElement(dps) !== aEl) ? 1 : 0;
            const bDiffers = primaryAnomalyOwned.some(dps => getUnitElement(dps) !== bEl) ? 1 : 0;
            if (aDiffers !== bDiffers) return bDiffers - aDiffers;
            return a.tier - b.tier;
        });

    if (candidates.length === 0) return;

    const scoringDPS = uncoveredDPS.length > 0 ? uncoveredDPS : primaryAnomalyOwned;
    const bestTier = getBestTier(scoringDPS);
    const bestQuality = bestTier != null ? tierToQuality(bestTier) : 0;
    const score = bestQuality >= 75 ? 55 :
                  bestQuality >= 55 ? 45 : 35;

    const hasWeakPartner = disorderPartners.length > 0 &&
        disorderPartners.every(p => (p.tier != null ? tierToQuality(p.tier) : 0) < PARTNER_QUALITY_THRESHOLD);

    const reason = disorderPartners.length === 0
        ? `Your anomaly DPS have no anomaly partner — a different-element anomaly unit is needed to generate disorders`
        : hasWeakPartner
        ? `Your anomaly partner is too low-tier to reliably generate disorders — a stronger different-element anomaly partner is recommended`
        : `Your anomaly partners share an element with your primary DPS — a different-element anomaly partner would unlock disorder generation`;

    gaps.push({
        id: 'anomaly-partner',
        title: 'Anomaly Disorder Partner',
        reason,
        score,
        units: candidates
    });
}

function detectElementGaps(gaps, elementQuality, unownedLimitedS, sortCandidatesFn) {
    for (const el of ELEMENTS) {
        const quality = elementQuality[el];
        if (quality >= 55) continue; // Decent or better — not a meaningful gap

        const score = quality === 0 ? 60 : 50;

        // Primary DPS candidates first
        let candidates = sortCandidatesFn(
            unownedLimitedS.filter(u =>
                getUnitElement(u) === el && DPS_ARCHETYPES.some(a => u.tags.includes(a)) && !isSubdps(u)
            )
        );

        // If no primary DPS exist for this element (e.g. wind only has Velina as sub-DPS),
        // fall back to sub-DPS candidates — they still cover the element in content
        if (candidates.length === 0) {
            candidates = sortCandidatesFn(
                unownedLimitedS.filter(u =>
                    getUnitElement(u) === el && DPS_ARCHETYPES.some(a => u.tags.includes(a))
                )
            );
        }

        const reason = quality === 0
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

function detectStunnerElementGap(gaps, ownedStunners, elementQuality, unownedLimitedS, sortCandidatesFn) {
    const ownedLimitedStunnerElements = new Set(
        ownedStunners
            .filter(u => u.rank === 'S' && u.limited)
            .map(u => getUnitElement(u))
    );

    for (const el of ELEMENTS) {
        if (elementQuality[el] < 55) continue;
        if (ownedLimitedStunnerElements.has(el)) continue;

        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes('stun') && getUnitElement(u) === el)
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

        const recDPSArch = DPS_ARCHETYPES.find(a => rec.tags.includes(a));
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

function detectMechanicalSynergies(gaps, ownedUnits, unownedLimitedS, dpsQuality, elementQuality, scoreOverrides) {
    // Only pair against S-rank units with meaningful quality — A-ranks and garbage tiers
    // produce misleading recommendations ("synergizes with Anton" / "pairs with Harumasa").
    const MIN_PAIR_QUALITY = 40; // tier ≤ 1.5; excludes T2+ S-ranks like Harumasa
    const ownedSRankDPS = ownedUnits.filter(u =>
        u.rank === 'S' &&
        DPS_ARCHETYPES.some(a => u.tags.includes(a)) &&
        tierToQuality(u.tier ?? 4) >= MIN_PAIR_QUALITY
    );
    const ownedSRankNonDPS = ownedUnits.filter(u =>
        u.rank === 'S' && (u.tags.includes('support') || u.tags.includes('defense') || u.tags.includes('stun'))
    );

    // Precompute the best existing fit an owned non-DPS provides per (DPS id, team slot).
    // Used to suppress non-DPS candidates whose role+synergy is already covered by an owned unit.
    // Slot is 'stun' for stunners, 'support' for everything else (support/defense).
    const ownedStunUnits = ownedUnits.filter(u => u.tags.includes('stun'));
    const ownedSupportDefUnits = ownedUnits.filter(u =>
        u.tags.includes('support') || u.tags.includes('defense')
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

    // First pass: score every qualifying candidate against ALL of their owned pairings,
    // not just the best — so a stunner like Dialyn can register synergy with both YSG
    // and Yixuan independently, even if one pair scores slightly higher than the other.
    const scoredCandidates = [];
    for (const candidate of unownedLimitedS) {
        const isDPSCandidate = DPS_ARCHETYPES.some(a => candidate.tags.includes(a)) && !isSubdps(candidate);
        const el = getUnitElement(candidate);
        const targets = isDPSCandidate ? ownedSRankNonDPS : ownedSRankDPS;

        // Quality gate: skip DPS candidates whose archetype+element are already well-covered
        if (isDPSCandidate) {
            const arch = DPS_ARCHETYPES.find(a => candidate.tags.includes(a));
            if (arch && dpsQuality[arch] >= 75 && el !== 'unknown' && elementQuality[el] >= 55) {
                continue;
            }
        }

        // Collect all pairs above the meaningful-synergy threshold
        const qualifyingPairs = [];
        for (const owned of targets) {
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
        if (qualifyingPairs.length === 0) continue;

        // Sort pairs by descending fit so [0] is the best
        qualifyingPairs.sort((a, b) => b.fit - a.fit);
        const bestFit = qualifyingPairs[0].fit;

        // Include all pairs that are within 75% of the best pair — filters out generic
        // support pairings (ATK+CD alone scores ~14) while keeping close runners-up like
        // Dialyn→Yixuan (30) alongside Dialyn→YSG (33).
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

function detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortCandidatesFn) {
    for (const arch of DPS_ARCHETYPES) {
        const primaryOwned = ownedDPS[arch].filter(u => u.rank === 'S' && u.limited && !isSubdps(u));
        if (primaryOwned.length !== 1 || dpsQuality[arch] < 75) continue;

        const candidates = sortCandidatesFn(
            unownedLimitedS.filter(u => u.tags.includes(arch) && !isSubdps(u))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: `depth-${arch}`,
                title: `${capitalize(arch)} Depth`,
                reason: `You only have one premium ${arch} DPS — a second option would give flexibility across different team compositions`,
                score: 30,
                units: candidates
            });
        }
    }
}

// ============================================================================
// ROSTER ASSESSMENT
// ============================================================================

function buildAssessment(dpsQuality, supportQuality, stunnerQuality, elementQuality, compositeScore, limitedSCount, coverage, highPriorityGapCount = 0, gaps = []) {
    const totalSCount = coverage.ownedDPS.attack.concat(
        coverage.ownedDPS.anomaly, coverage.ownedDPS.rupture,
        coverage.ownedSupports, coverage.ownedStunners
    ).filter(u => u.rank === 'S').length;
    const investmentFactor = totalSCount === 0 ? 0.3
        : Math.min(1.0, 0.5 + limitedSCount * 0.05);
    const ratingScore = compositeScore * investmentFactor;

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

    const strengths = [];
    const weaknesses = [];

    for (const arch of DPS_ARCHETYPES) {
        const hasSRank = coverage.ownedDPS[arch].some(u => u.rank === 'S');
        if (dpsQuality[arch] >= 75 && hasSRank) strengths.push(`strong ${arch} DPS`);
        else if (dpsQuality[arch] <= 25) weaknesses.push(`${arch} DPS`);
    }
    const hasSRankSupport = coverage.ownedSupports.some(u => u.rank === 'S');
    const hasArchetypeSupportGap = gaps.some(g => g.id.startsWith('support-'));
    if (supportQuality >= 75 && hasSRankSupport && !hasArchetypeSupportGap) {
        strengths.push('premium supports');
    } else if (supportQuality >= 75 && hasSRankSupport && hasArchetypeSupportGap) {
        strengths.push('a premium support, though coverage is narrow');
    } else if (supportQuality <= 25) {
        weaknesses.push('support options');
    }
    const hasSRankStunner = coverage.ownedStunners.some(u => u.rank === 'S');
    if (stunnerQuality >= 75 && hasSRankStunner) strengths.push('solid stunners');
    else if (stunnerQuality <= 10) weaknesses.push('stunner coverage');

    const weakElements = ELEMENTS.filter(el => elementQuality[el] < 55);
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

    return { ratingTier, ratingColor, compositeScore, summary };
}
