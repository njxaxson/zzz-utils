/**
 * Pull Recommendations Engine
 * Shared analysis logic for gap detection and recommendation scoring.
 * Used by both the web UI (pull-recommendations.js) and CLI debug tool (pull-debug.js).
 */

export const DPS_ARCHETYPES = ['attack', 'anomaly', 'rupture'];
export const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether'];

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
    return unit.synergy?.tags?.includes('subdps');
}

export function isTitled(unit) {
    return unit.tags.includes('title');
}

export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getUnitElement(unit) {
    return unit.tags.find(tag => ELEMENTS.includes(tag)) || 'unknown';
}

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
    // ---- Step 1: Categorize owned units ----
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

    // ---- Step 2: Coverage quality ----
    // DPS quality is based on primary DPS only — subdps inflate quality but
    // can't carry teams alone. Subdps coverage has its own detector.
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

    // ---- Composite score & calibration ----
    const qualities = [
        dpsQuality.attack, dpsQuality.anomaly, dpsQuality.rupture,
        supportQuality, stunnerQuality
    ];
    const compositeScore = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
    const calibration = compositeScore > 75 ? 0.82 :
                        compositeScore > 55 ? 0.92 : 1.0;

    // ---- Tag affinity context for candidate sorting ----
    const strongTags = new Set();
    for (const arch of DPS_ARCHETYPES) {
        if (dpsQuality[arch] >= 75) strongTags.add(arch);
    }
    for (const el of ELEMENTS) {
        if (elementQuality[el] >= 75) strongTags.add(el);
    }

    function sortCandidates(units) {
        return [...units].sort((a, b) => {
            if (isTitled(a) !== isTitled(b)) return isTitled(a) ? -1 : 1;
            if (a.tier !== b.tier) return a.tier - b.tier;
            const aAff = (a.synergy?.tags || []).filter(t => strongTags.has(t)).length;
            const bAff = (b.synergy?.tags || []).filter(t => strongTags.has(t)).length;
            return bAff - aAff;
        });
    }

    // ---- Step 3: Gap detection ----
    const gaps = [];
    const unownedLimitedS = allUnits.filter(u =>
        u.rank === 'S' && u.limited && !unitStates[u.id]?.owned
    );

    const unitByName = {};
    for (const u of allUnits) unitByName[u.name] = u;
    const ownedByName = {};
    for (const u of ownedUnits) ownedByName[u.name] = u;

    detectDPSGaps(gaps, dpsQuality, ownedDPS, unownedLimitedS, sortCandidates);
    detectSupportGap(gaps, ownedUnits, ownedSupports, dpsQuality, unownedLimitedS);
    detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortCandidates);
    detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortCandidates);
    detectElementGaps(gaps, elementQuality, unownedLimitedS, sortCandidates);
    detectSynergies(gaps, ownedUnits, unownedLimitedS, unitByName, ownedByName, dpsQuality, elementQuality);
    detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortCandidates);

    // ---- Step 4: Apply calibration ----
    for (const gap of gaps) {
        gap.rawScore = gap.score;
        gap.score = Math.round(gap.score * calibration);
    }

    // ---- Step 5: Deduplicate and rank ----
    gaps.sort((a, b) => b.score - a.score);

    const recommendations = [];
    const usedUnits = new Set();

    for (const gap of gaps) {
        if (gap.id.startsWith('synergy-')) {
            if (!gap.units.some(u => !usedUnits.has(u.id))) continue;
        }
        recommendations.push({
            priority: gap.score >= 70 ? 'High' : gap.score >= 40 ? 'Medium' : 'Low',
            title: gap.title,
            reason: gap.reason,
            score: gap.score,
            rawScore: gap.rawScore,
            units: gap.units.slice(0, 5)
        });
        for (const u of gap.units) usedUnits.add(u.id);
        if (recommendations.length >= maxRecommendations) break;
    }

    // ---- Assessment ----
    const limitedSCount = ownedUnits.filter(u => u.rank === 'S' && u.limited).length;
    const assessment = buildAssessment(
        dpsQuality, supportQuality, stunnerQuality, elementQuality,
        compositeScore, limitedSCount,
        { ownedDPS, ownedSupports, ownedStunners }
    );

    return {
        assessment,
        recommendations,
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

function detectDPSGaps(gaps, dpsQuality, ownedDPS, unownedLimitedS, sortCandidates) {
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

        const candidates = sortCandidates(
            unownedLimitedS.filter(u => u.tags.includes(arch) && !isSubdps(u))
        );

        if (candidates.length > 0) {
            gaps.push({ id: `dps-${arch}`, title: `${capitalize(arch)} DPS`, reason, score, units: candidates });
        }
    }
}

function detectSupportGap(gaps, ownedUnits, ownedSupports, dpsQuality, unownedLimitedS) {
    const ownedLimitedSupports = ownedSupports.filter(u => u.rank === 'S' && u.limited);

    if (ownedLimitedSupports.length === 0) {
        const candidates = unownedLimitedS
            .filter(u => u.tags.includes('support') || u.tags.includes('defense'))
            .sort((a, b) => {
                if (a.id === 'astra') return -1;
                if (b.id === 'astra') return 1;
                return a.tier - b.tier;
            });
        if (candidates.length > 0) {
            gaps.push({
                id: 'support', title: 'Premium Support',
                reason: 'Your roster has no premium supports — a strong support multiplies your existing DPS significantly',
                score: 80, units: candidates
            });
        }
        return;
    }

    const hasAstra = ownedUnits.some(u => u.id === 'astra');
    const hasYuzuha = ownedUnits.some(u => u.id === 'yuzuha');
    const hasLucia = ownedUnits.some(u => u.id === 'lucia');

    // Identify unmet archetype-specific support needs.
    // Astra (universal) OR the matching specialist covers the need.
    const unmetNeeds = [];
    if (dpsQuality.anomaly >= 50 && !hasYuzuha && !hasAstra) unmetNeeds.push('anomaly');
    if (dpsQuality.rupture >= 50 && !hasLucia && !hasAstra) unmetNeeds.push('rupture');

    // If all archetype needs are met by specialists or Astra, check if
    // Astra-holder is missing specialists (lower priority optimization).
    let score = 0;
    let reason = '';

    if (unmetNeeds.length > 0) {
        score = unmetNeeds.length > 1 ? 55 : 50;
        reason = `You're missing specialist support for your ${unmetNeeds.map(capitalize).join(' and ')} teams`;
    } else if (hasAstra) {
        const missingSpecialists = [];
        if (dpsQuality.anomaly >= 50 && !hasYuzuha) missingSpecialists.push('anomaly');
        if (dpsQuality.rupture >= 50 && !hasLucia) missingSpecialists.push('rupture');
        if (missingSpecialists.length > 0) {
            score = missingSpecialists.length > 1 ? 40 : 30;
            reason = `You have Astra but could benefit from specialist supports for your ${missingSpecialists.map(capitalize).join(' and ')} teams`;
        }
    }

    if (score === 0) return;

    // Filter candidates to supports relevant to the identified needs.
    // A support is relevant if its synergy.tags includes the needed archetype,
    // or if it has no synergy.tags (universal support like Astra).
    const needs = unmetNeeds.length > 0 ? unmetNeeds
        : (hasAstra ? [] : []).concat(
            (dpsQuality.anomaly >= 50 && !hasYuzuha) ? ['anomaly'] : [],
            (dpsQuality.rupture >= 50 && !hasLucia) ? ['rupture'] : []
        );

    const candidates = unownedLimitedS
        .filter(u => {
            if (!u.tags.includes('support') && !u.tags.includes('defense')) return false;
            if (u.id === 'astra') return true;
            const supTags = u.synergy?.tags || [];
            if (supTags.length === 0) return false;
            return needs.some(need => supTags.includes(need));
        })
        .sort((a, b) => {
            if (a.id === 'astra') return -1;
            if (b.id === 'astra') return 1;
            return a.tier - b.tier;
        });

    if (candidates.length > 0) {
        gaps.push({ id: 'support', title: 'Premium Support', reason, score, units: candidates });
    }
}

function detectStunnerGap(gaps, stunnerQuality, ownedStunners, dpsQuality, unownedLimitedS, sortCandidates) {
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
            : 'You have a decent standard stunner but no limited options for Deadly Assault flexibility';

        const candidates = sortCandidates(unownedLimitedS.filter(u => u.tags.includes('stun')));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner', title: 'Premium Stunner', reason, score, units: candidates });
        }
    } else if (limitedStunnerCount === 1) {
        let score = 40;
        if (dpsQuality.attack >= 75 || dpsQuality.rupture >= 75) score = 50;
        if (dpsQuality.attack >= 75 && dpsQuality.rupture >= 75) score = 60;

        const reason = 'You only have one limited stunner — more would give flexibility for Deadly Assault rotations';
        const candidates = sortCandidates(unownedLimitedS.filter(u => u.tags.includes('stun')));
        if (candidates.length > 0) {
            gaps.push({ id: 'stunner-depth', title: 'Stunner Coverage', reason, score, units: candidates });
        }
    }
}

function detectSubdpsGap(gaps, dpsQuality, ownedSubdps, unownedLimitedS, sortCandidates) {
    const anomBest = getBestTier(ownedSubdps.anomaly);
    const anomSubdpsQuality = anomBest !== null ? tierToQuality(anomBest) : 0;
    if (dpsQuality.anomaly >= 50 && anomSubdpsQuality < 50) {
        const score = anomSubdpsQuality === 0 ? 45 : 35;
        const candidates = sortCandidates(
            unownedLimitedS.filter(u => u.tags.includes('anomaly') && isSubdps(u))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: 'subdps-anomaly',
                title: 'Anomaly Sub-DPS',
                reason: 'Anomaly teams perform best with two anomaly agents — you need a sub-DPS partner',
                score,
                units: candidates
            });
        }
    }

    const atkBest = getBestTier(ownedSubdps.attack);
    const atkSubdpsQuality = atkBest !== null ? tierToQuality(atkBest) : 0;
    if (dpsQuality.attack >= 75 && atkSubdpsQuality < 50) {
        const score = atkSubdpsQuality === 0 ? 45 : 35;
        const candidates = sortCandidates(
            unownedLimitedS.filter(u => u.tags.includes('attack') && isSubdps(u))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: 'subdps-attack',
                title: 'Attack Sub-DPS',
                reason: 'You have strong attack DPS but no attack sub-DPS partner for optimal team compositions',
                score,
                units: candidates
            });
        }
    }
}

function detectElementGaps(gaps, elementQuality, unownedLimitedS, sortCandidates) {
    for (const el of ELEMENTS) {
        const quality = elementQuality[el];
        if (quality >= 55) continue;

        const score = quality === 0 ? 60 : 50;

        const reason = quality === 0
            ? `You have no DPS options for ${capitalize(el)} content`
            : `Your ${capitalize(el)} DPS is borderline — a premium option would significantly improve coverage`;

        const candidates = sortCandidates(
            unownedLimitedS.filter(u =>
                getUnitElement(u) === el && DPS_ARCHETYPES.some(a => u.tags.includes(a)) && !isSubdps(u)
            )
        );

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

function detectSynergies(gaps, ownedUnits, unownedLimitedS, unitByName, ownedByName, dpsQuality, elementQuality) {
    const rawSynergies = [];

    // Forward: owned S-rank's synergy.units → unowned limited S
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
                score: 35
            });
        }
    }

    // Reverse: unowned unit's synergy.units → owned S-ranks
    for (const unit of unownedLimitedS) {
        if (!unit.synergy?.units?.length) continue;
        for (const partnerName of unit.synergy.units) {
            const partner = ownedByName[partnerName];
            if (!partner || partner.rank !== 'S') continue;
            rawSynergies.push({
                recommended: unit,
                ownedPartner: partner,
                type: 'named',
                score: 35
            });
        }
    }

    // Tag affinity: unowned unit's synergy.tags → user's strong archetypes/elements
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
                score: 30,
                tags: matchingTags
            });
        }
    }

    // Consolidate by recommended unit
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

        // Skip synergy for DPS units whose archetype AND element are already well-covered
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
            score = 30;
            const tagStr = [...new Set(group.tagLabels)].map(capitalize).join('/');
            reason = `${group.recommended.name} has affinity with your strong ${tagStr} roster`;
        } else {
            const ownedNames = [...new Set(
                group.entries.filter(e => e.ownedPartner).map(e => e.ownedPartner.name)
            )];
            score = 35 + Math.max(0, pairCount - 1) * 10;
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

function detectDepthGap(gaps, ownedDPS, dpsQuality, unownedLimitedS, sortCandidates) {
    for (const arch of DPS_ARCHETYPES) {
        const primaryOwned = ownedDPS[arch].filter(u => u.rank === 'S' && u.limited && !isSubdps(u));
        if (primaryOwned.length !== 1 || dpsQuality[arch] < 75) continue;

        const candidates = sortCandidates(
            unownedLimitedS.filter(u => u.tags.includes(arch) && !isSubdps(u))
        );
        if (candidates.length > 0) {
            gaps.push({
                id: `depth-${arch}`,
                title: `${capitalize(arch)} Depth`,
                reason: `You only have one premium ${arch} DPS — more options would give flexibility for Deadly Assault rotations`,
                score: 30,
                units: candidates
            });
        }
    }
}

// ============================================================================
// ROSTER ASSESSMENT
// ============================================================================

function buildAssessment(dpsQuality, supportQuality, stunnerQuality, elementQuality, compositeScore, limitedSCount, coverage) {
    // A-rank-only or low-investment rosters shouldn't rate as high as
    // rosters with limited S-rank pulls, even if A-rank tiers are decent.
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
    } else if (ratingScore <= 75) {
        ratingTier = 'Well-Rounded';
        ratingColor = '#2ecc71';
    } else {
        ratingTier = 'Fully Loaded';
        ratingColor = '#3498db';
    }

    const strengths = [];
    const weaknesses = [];

    for (const arch of DPS_ARCHETYPES) {
        const hasSRank = coverage.ownedDPS[arch].some(u => u.rank === 'S');
        if (dpsQuality[arch] >= 75 && hasSRank) strengths.push(`strong ${arch} DPS`);
        else if (dpsQuality[arch] <= 25) weaknesses.push(`${arch} DPS`);
    }
    const hasSRankSupport = coverage.ownedSupports.some(u => u.rank === 'S');
    if (supportQuality >= 75 && hasSRankSupport) strengths.push('premium supports');
    else if (supportQuality <= 25) weaknesses.push('support options');
    const hasSRankStunner = coverage.ownedStunners.some(u => u.rank === 'S');
    if (stunnerQuality >= 75 && hasSRankStunner) strengths.push('solid stunners');
    else if (stunnerQuality <= 10) weaknesses.push('stunner coverage');

    const weakElements = ELEMENTS.filter(el => elementQuality[el] < 55);
    if (weakElements.length === 0) strengths.push('full element coverage');
    else if (weakElements.length >= 2) weaknesses.push(`${weakElements.map(capitalize).join('/')} element coverage`);

    let summary;
    if (strengths.length > 0 && weaknesses.length > 0) {
        summary = `Your roster has ${strengths.join(' and ')} but lacks ${weaknesses.join(' and ')}.`;
    } else if (strengths.length > 0) {
        summary = `Your roster has ${strengths.join(', ')} with well-rounded coverage across the board.`;
    } else if (weaknesses.length > 0) {
        summary = `Your roster needs investment in ${weaknesses.join(', ')}.`;
    } else {
        summary = 'Your roster has moderate coverage across most roles.';
    }

    return { ratingTier, ratingColor, compositeScore, summary };
}
