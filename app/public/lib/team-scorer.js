/**
 * Shared team scoring logic for Zenless Zone Zero
 * Used by both matchups.js and deadly-assault.js
 * 
 * Browser-compatible ES module version
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const DPS_ROLES = ["attack", "anomaly", "rupture"];
export const SUPPORT_ROLE = "support";
export const NON_DPS_ROLES = ["defense", "stun", "support"];
export const ELEMENTS = ["fire", "ice", "electric", "physical", "ether"];

// ============================================================================
// ROLE CLASSIFICATION HELPERS
// ============================================================================

export function isDPS(unit) {
    return DPS_ROLES.some(role => unit.tags.includes(role));
}

export function isAttacker(unit) {
    return unit.tags.includes("attack");
}

export function isAnomaly(unit) {
    return unit.tags.includes("anomaly");
}

export function isRupture(unit) {
    return unit.tags.includes("rupture");
}

export function isSupport(unit) {
    return unit.tags.includes(SUPPORT_ROLE);
}

export function isDefense(unit) {
    return unit.tags.includes("defense");
}

export function isStun(unit) {
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

// ============================================================================
// SYNERGY SCORING
// ============================================================================

export function calculateSynergyScore(unit, teammates, boss) {
    let score = 0;
    const synergy = unit.synergy;
    if (!synergy) return 0;
    
    // Unit-specific synergies (e.g., Nicole synergizes with Astra)
    // Small bonus to avoid over-coupling issues
    if (synergy.units && synergy.units.length > 0) {
        for (const teammate of teammates) {
            if (synergy.units.includes(teammate.name)) {
                score += 5;
            }
        }
    }
    
    if (synergy.tags && synergy.tags.length > 0) {
        const unitElement = getElement(unit);
        
        // Check if this unit has element synergy (like Soukaku's "ice")
        const hasElementSynergy = synergy.tags.some(tag => ELEMENTS.includes(tag));
        if (hasElementSynergy) {
            const synergyElement = synergy.tags.find(tag => ELEMENTS.includes(tag));
            // Check if ANY teammate matches this element synergy
            const anyTeammateMatchesElement = teammates.some(t => t.tags.includes(synergyElement));
            if (!anyTeammateMatchesElement) {
                // Element synergy unit on team with NO matching element teammates
                // (e.g., Soukaku on Harumasa team) - this is a complete waste
                // Should only appear as last resort when forced by other constraints
                score -= 120;
            }
        }
        
        for (const teammate of teammates) {
            const matchesAnyPreference = synergy.tags.some(tag => {
                if (!teammate.tags.includes(tag)) return false;
                
                if (DPS_ROLES.includes(tag) && isDPS(teammate)) {
                    const teammateElement = getElement(teammate);
                    return unitElement === teammateElement;
                }
                return true;
            });
            
            if (matchesAnyPreference) {
                // Check if this is an element synergy (e.g., Soukaku's "ice")
                const isElementSynergy = synergy.tags.some(tag => ELEMENTS.includes(tag));
                
                if (isElementSynergy) {
                    // Element synergy supports (like Soukaku) need TWO conditions:
                    // 1. Boss must be weak to that element
                    // 2. Team must have a DPS of that element
                    const synergyElement = synergy.tags.find(tag => ELEMENTS.includes(tag));
                    const bossWeakToElement = boss.weaknesses.includes(synergyElement);
                    
                    // Check if team has element DPS - INCLUDING the unit itself!
                    const unitIsElementDPS = isDPS(unit) && getElement(unit) === synergyElement;
                    const teamHasElementDPS = unitIsElementDPS || teammates.some(t => 
                        isDPS(t) && getElement(t) === synergyElement
                    );
                    
                    if (!bossWeakToElement || !teamHasElementDPS) {
                        // Element synergy is completely wasted - near-disqualifying
                        score -= 70;
                    } else if (isDPS(teammate)) {
                        score += 30;
                    } else {
                        score += 15;
                    }
                } else if (isDPS(teammate)) {
                    score += 30;
                } else {
                    score += 15;
                }
            } else if (isDPS(teammate)) {
                score -= 20;
            }
        }
    }
    
    if (synergy.avoid && synergy.avoid.length > 0) {
        for (const avoidTag of synergy.avoid) {
            const avoidedTeammates = teammates.filter(t => t.tags.includes(avoidTag));
            if (avoidedTeammates.length > 0) {
                const avoidedDPS = avoidedTeammates.filter(isDPS);
                if (avoidedDPS.length > 0) {
                    return -999;
                } else {
                    score -= 35;
                }
            }
        }
    }
    
    return score;
}

export function getDPSType(unit) {
    if (unit.tags.includes("attack")) return "attack";
    if (unit.tags.includes("anomaly")) return "anomaly";
    if (unit.tags.includes("rupture")) return "rupture";
    return null;
}

export function unitsHaveSynergy(unit1, unit2) {
    const u1SynergizesU2 = 
        unit1.synergy?.units?.includes(unit2.name) ||
        unit1.synergy?.tags?.some(tag => unit2.tags.includes(tag));
    
    const u2SynergizesU1 = 
        unit2.synergy?.units?.includes(unit1.name) ||
        unit2.synergy?.tags?.some(tag => unit1.tags.includes(tag));
    
    return u1SynergizesU2 || u2SynergizesU1;
}

export function calculateDPSMixingPenalty(team) {
    const dpsUnits = team.filter(isDPS);
    if (dpsUnits.length < 2) return 0;
    
    let penalty = 0;
    
    const attackers = dpsUnits.filter(u => u.tags.includes("attack"));
    const anomalyUnits = dpsUnits.filter(u => u.tags.includes("anomaly"));
    const ruptureUnits = dpsUnits.filter(u => u.tags.includes("rupture"));
    
    const dpsTypes = new Set(dpsUnits.map(getDPSType).filter(t => t !== null));
    
    // Double attack without synergy - heavily penalize
    if (attackers.length >= 2) {
        let hasSynergy = false;
        for (let i = 0; i < attackers.length; i++) {
            for (let j = i + 1; j < attackers.length; j++) {
                if (unitsHaveSynergy(attackers[i], attackers[j])) {
                    hasSynergy = true;
                    break;
                }
            }
        }
        if (!hasSynergy) {
            penalty -= 60; // Attack teams want stun/attack/support, not 2x attack
        }
    }
    
    // Double rupture without synergy - heavily penalize
    if (ruptureUnits.length >= 2) {
        let hasSynergy = false;
        for (let i = 0; i < ruptureUnits.length; i++) {
            for (let j = i + 1; j < ruptureUnits.length; j++) {
                if (unitsHaveSynergy(ruptureUnits[i], ruptureUnits[j])) {
                    hasSynergy = true;
                    break;
                }
            }
        }
        if (!hasSynergy) {
            penalty -= 60; // Rupture teams want stun/rupture/support or rupture/2x support
        }
    }
    
    if (dpsTypes.size <= 1) return penalty;
    
    // Attack + Rupture: NEVER valid - disqualify
    if (dpsTypes.has("attack") && dpsTypes.has("rupture")) {
        return -999;
    }
    
    if (dpsTypes.has("attack") && dpsTypes.has("anomaly")) {
        let hasValidSynergy = false;
        
        for (const attacker of attackers) {
            if (attacker.synergy?.tags?.includes("anomaly")) {
                const attackerElement = getElement(attacker);
                for (const anomaly of anomalyUnits) {
                    if (getElement(anomaly) === attackerElement) {
                        hasValidSynergy = true;
                        break;
                    }
                }
            }
            if (hasValidSynergy) break;
        }
        
        if (!hasValidSynergy) {
            for (const anomaly of anomalyUnits) {
                if (anomaly.synergy?.tags?.includes("attack")) {
                    const anomalyElement = getElement(anomaly);
                    for (const attacker of attackers) {
                        if (getElement(attacker) === anomalyElement) {
                            hasValidSynergy = true;
                            break;
                        }
                    }
                }
                if (hasValidSynergy) break;
            }
        }
        
        if (!hasValidSynergy) {
            return -999;
        }
    }
    
    if (dpsTypes.has("anomaly") && dpsTypes.has("rupture")) {
        return -999;
    }
    
    return penalty;
}

// ============================================================================
// TEAM-BOSS SCORING LOGIC
// ============================================================================

export function scoreTeamForBoss(team, boss, options = {}) {
    const { lenient = false } = options;
    // In lenient mode, start with higher base score to offset unavoidable penalties
    let score = lenient ? 200 : 100;
    
    const dpsUnits = team.filter(isDPS);
    const attackers = team.filter(isAttacker);
    const anomalyUnits = team.filter(isAnomaly);
    const ruptureUnits = team.filter(isRupture);
    const supportUnits = team.filter(isSupport);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isDefense);
    const nonDpsUnits = team.filter(isNonDPS);
    
    // ANTI check
    if (boss.anti && boss.anti.length > 0) {
        for (const antiType of boss.anti) {
            const hasAntiDPS = dpsUnits.some(unit => unit.tags.includes(antiType));
            if (hasAntiDPS) {
                return -1;
            }
        }
    }
    
    // SHILL preference
    if (boss.shill) {
        const isDPSShill = DPS_ROLES.includes(boss.shill);
        
        if (isDPSShill) {
            const hasShilledDPS = dpsUnits.some(unit => unit.tags.includes(boss.shill));
            
            if (hasShilledDPS) {
                score += 15;
            } else {
                const dpsMatchesWeaknessElement = dpsUnits.some(unit => 
                    boss.weaknesses.includes(getElement(unit))
                );
                
                if (dpsMatchesWeaknessElement) {
                    score -= 10;
                } else {
                    score -= 35;
                }
            }
        } else {
            const hasShilledRole = team.some(unit => unit.tags.includes(boss.shill));
            if (!hasShilledRole) {
                return -1;
            }
            score += 15;
        }
    }
    
    // Favored units
    if (boss.favored && boss.favored.length > 0) {
        for (const unit of team) {
            if (boss.favored.includes(unit.name)) {
                score += 25;
            }
        }
    }
    
    // TIER scoring (reduced penalties in lenient mode)
    for (const unit of team) {
        const tier = unit.tier ?? 2.5;
        
        if (tier <= 2) {
            const tierBonus = (4 - tier) * 7.5;
            score += tierBonus;
        } else if (tier <= 3) {
            if (isDPS(unit)) {
                const element = getElement(unit);
                if (boss.weaknesses.includes(element)) {
                    score -= lenient ? 5 : 15;
                } else {
                    score -= lenient ? 20 : 60;
                }
            } else {
                score -= lenient ? 15 : 50;
            }
        } else {
            score -= lenient ? 30 : 100;
        }
    }
    
    // Team composition rules
    if (dpsUnits.length >= 3) {
        return -1;
    }
    
    // Teams MUST have at least 1 DPS unit
    if (dpsUnits.length === 0) {
        return -1;
    }
    
    const nonTitledAnomalyUnits = anomalyUnits.filter(u => !isTitled(u));
    const nonAnomalyDPS = dpsUnits.filter(u => !u.tags.includes("anomaly"));
    
    if (nonTitledAnomalyUnits.length > 0 && anomalyUnits.length < 2) {
        if (nonAnomalyDPS.length > 0) {
            // Non-titled anomaly with non-anomaly DPS - normally invalid
            if (lenient) {
                score -= 80; // Heavy penalty but allow in desperate situations
            } else {
                return -1;
            }
        }
        if (dpsUnits.length === nonTitledAnomalyUnits.length) {
            // Solo non-titled anomaly - normally invalid
            if (lenient) {
                score -= 100; // Very heavy penalty but allow
            } else {
                return -1;
            }
        }
    }
    
    // Anomaly boss composition
    if (boss.shill === "anomaly") {
        const hasTitledAnomaly = anomalyUnits.some(isTitled);
        const hasValidAnomalyComp = hasTitledAnomaly || anomalyUnits.length >= 2;
        
        if (hasValidAnomalyComp) {
            if (nonDpsUnits.length === 0) {
                score -= 50;
            } else {
                score += 10;
            }
            
            if (anomalyUnits.length >= 2) {
                // Double anomaly is the preferred composition - bonus!
                score += 25; // Base bonus for having 2 anomaly DPS
                
                const anomalyElements = anomalyUnits.map(getElement);
                const uniqueElements = new Set(anomalyElements);
                if (uniqueElements.size >= 2) {
                    score += 30; // Additional bonus for different elements
                } else {
                    score -= 15;
                }
                
                const anyAnomalyMatchesWeakness = anomalyUnits.some(u => 
                    boss.weaknesses.includes(getElement(u))
                );
                if (!anyAnomalyMatchesWeakness) {
                    score -= 30;
                }
            } else if (anomalyUnits.length === 1 && hasTitledAnomaly) {
                // Titled CAN solo, but having 2 anomaly is still better
                // No bonus here - single anomaly is viable but suboptimal
                const soloElement = getElement(anomalyUnits[0]);
                if (!boss.weaknesses.includes(soloElement)) {
                    score -= 40;
                }
            }
            
            const nonAnomalyDPSInComp = dpsUnits.filter(u => !u.tags.includes("anomaly"));
            if (nonAnomalyDPSInComp.length > 0) {
                score -= 40;
            }
            
            // Anomaly teams prefer support/defense over stun
            // Stun doesn't contribute to anomaly damage buildup
            if (stunUnits.length > 0 && supportUnits.length === 0 && defenseUnits.length === 0) {
                score -= 40; // Heavy penalty for stun-only support on anomaly
            } else if (stunUnits.length > 0) {
                score -= 20; // Moderate penalty for stun on anomaly team
            }
            
            // Strong bonus for support (they enable anomaly DPS)
            if (supportUnits.length >= 1) {
                score += 25;
            }
            if (defenseUnits.length >= 1) {
                score += 15;
            }
        } else {
            // No valid anomaly comp - need on-element DPS as fallback
            const dpsMatchesWeakness = dpsUnits.some(u => boss.weaknesses.includes(getElement(u)));
            
            if (!dpsMatchesWeakness) {
                // Off-element DPS on anomaly-shill without anomaly comp
                if (lenient) {
                    score -= 120; // Very heavy penalty but allow
                } else {
                    return -1;
                }
            }
        }
    }
    
    // Attack teams NEED a stunner - it's fundamental to the playstyle
    // Ideal: stun/attack/support or stun/attack/defense
    if (boss.shill === "attack" || (!boss.shill && attackers.length > 0)) {
        if (stunUnits.length >= 1) {
            score += 15;
        } else {
            score -= 60; // Near-disqualifying: attack teams need stunner
        }
        if (supportUnits.length >= 1 || defenseUnits.length >= 1) {
            score += 10;
        }
        if (attackers.length > 1) {
            score -= 50; // Double attacker rarely makes sense
        }
    }
    
    // Rupture teams
    if (boss.shill === "rupture" || (!boss.shill && ruptureUnits.length > 0)) {
        // Two valid compositions:
        // 1. stun/rupture/[support|defense] 
        // 2. rupture/2x[support|defense]
        const hasStunComposition = stunUnits.length >= 1 && (supportUnits.length >= 1 || defenseUnits.length >= 1);
        const hasDoubleSupport = supportUnits.length + defenseUnits.length >= 2;
        
        if (hasStunComposition || hasDoubleSupport) {
            score += 15;
        }
        
        // For rupture teams, stunners without rupture synergy are suboptimal
        // Rupture/2xSupport with rupture synergy should beat Stun/Rupture/Support
        for (const unit of stunUnits) {
            const hasRuptureSynergy = unit.synergy?.tags?.includes("rupture");
            if (!hasRuptureSynergy) {
                if (boss.shill === "rupture") {
                    score -= 25; // On rupture-shill, non-synergy stun is worse
                } else {
                    score -= 15; // On non-rupture-shill, still a penalty
                }
            }
        }
    }
    
    // DPS weakness/resistance
    let dpsMatchesWeakness = false;
    
    for (const unit of dpsUnits) {
        const element = getElement(unit);
        
        if (boss.resistances.includes(element)) {
            return -1;
        }
        
        if (boss.weaknesses.includes(element)) {
            dpsMatchesWeakness = true;
            // On-element DPS is the foundation of team building
            if (isSRank(unit)) {
                score += 40; // S-rank on-element DPS is the starting point
            } else {
                score += 20; // A-rank on-element still good
            }
        } else {
            // Off-element DPS - significant penalty (reduced in lenient mode)
            score -= lenient ? 10 : 30;
        }
    }
    
    if (dpsUnits.length > 0 && !dpsMatchesWeakness) {
        // No DPS matches weakness - extra penalty (reduced in lenient mode)
        score -= lenient ? 5 : 15;
    }
    
    // Stun weakness/resistance - stun units deal damage, so element matters
    for (const unit of stunUnits) {
        const element = getElement(unit);
        
        if (boss.resistances.includes(element)) {
            // Resisted stun is near-useless - heavy penalty
            score -= 80;
        }
        
        if (boss.weaknesses.includes(element)) {
            score += 15;
        } else if (!boss.resistances.includes(element)) {
            // Neutral/off-element stun
            if (boss.shill === "stun") {
                // On stun-shill, off-element is acceptable (stun is priority)
                score -= 15;
            } else {
                // On non-stun-shill, off-element stunner is a bigger issue
                score -= 35;
            }
        }
    }
    
    // Defense weakness/resistance
    for (const unit of defenseUnits) {
        const element = getElement(unit);
        
        if (boss.resistances.includes(element)) {
            score -= 10;
        }
        
        if (boss.weaknesses.includes(element)) {
            score += 3;
        }
    }
    
    // Rank preferences
    for (const unit of dpsUnits) {
        if (isSRank(unit)) {
            score += 20;
            if (isTitled(unit)) {
                score += 15;
            }
            if (isLimited(unit)) {
                score += 10;
            }
        } else if (isARank(unit)) {
            const tier = unit.tier ?? 2.5;
            if (tier >= 2) {
                // A-rank Tier 2+ DPS (Anton, Billy, Corin) are near-useless
                // (reduced penalty in lenient mode - might be only option)
                score -= lenient ? 25 : 80;
            } else {
                score -= 10;
            }
        }
    }
    
    for (const unit of stunUnits) {
        if (isSRank(unit)) {
            score += 10;
            if (isLimited(unit)) {
                score += 5;
            }
        } else if (isARank(unit)) {
            score -= 5;
        }
    }
    
    for (const unit of [...supportUnits, ...defenseUnits]) {
        if (isSRank(unit)) {
            score += 15;
            if (isLimited(unit)) {
                score += 10;
            }
        } else if (isARank(unit)) {
            score -= 8;
        }
    }
    
    // Universal support bonus
    const teamElements = new Set(team.map(getElement));
    const isMixedElementTeam = teamElements.size > 1;
    
    if (isMixedElementTeam) {
        for (const unit of [...supportUnits, ...defenseUnits]) {
            const hasTagPreferences = unit.synergy?.tags?.length > 0;
            if (!hasTagPreferences) {
                score += 8;
            }
        }
    }
    
    // Specialized beats universal (rupture teams)
    // Pan/Lucia with rupture synergy should ALWAYS beat Astra/Nicole on rupture teams
    const hasRuptureDPS = ruptureUnits.length > 0;
    
    if (hasRuptureDPS) {
        for (const unit of [...supportUnits, ...defenseUnits]) {
            const hasTagPreferences = unit.synergy?.tags?.length > 0;
            const hasRuptureSynergy = unit.synergy?.tags?.includes("rupture");
            
            if (!hasTagPreferences) {
                // Universal support on rupture team - heavy penalty
                score -= 60; // Pan/Lucia MUST beat Astra/Nicole
            } else if (!hasRuptureSynergy) {
                // Has preferences but wrong type (e.g., ice support on rupture)
                score -= 35;
            }
            // Rupture-specialized supports get no penalty (they're optimal)
        }
    }
    
    // Synergy scoring
    for (const unit of team) {
        const teammates = team.filter(t => t.numericId !== unit.numericId);
        score += calculateSynergyScore(unit, teammates, boss);
    }
    
    // DPS mixing penalty
    score += calculateDPSMixingPenalty(team);
    
    // Double stun penalty
    if (stunUnits.length >= 2) {
        let hasStunSynergy = false;
        for (let i = 0; i < stunUnits.length; i++) {
            for (let j = i + 1; j < stunUnits.length; j++) {
                if (unitsHaveSynergy(stunUnits[i], stunUnits[j])) {
                    hasStunSynergy = true;
                    break;
                }
            }
            for (const dps of dpsUnits) {
                if (dps.synergy?.tags?.includes("stun")) {
                    hasStunSynergy = true;
                    break;
                }
            }
        }
        if (!hasStunSynergy) {
            score -= 30;
        }
    }
    
    // Defensive assist requirement
    const defensiveAssistCount = team.filter(hasDefensiveAssist).length;
    if (defensiveAssistCount < boss.assists) {
        return -1;
    }
    
    score += (defensiveAssistCount - boss.assists) * 3;
    
    return score;
}

