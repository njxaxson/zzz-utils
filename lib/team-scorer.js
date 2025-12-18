/**
 * Shared team scoring logic for Zenless Zone Zero
 * Used by both matchups.js and deadly-assault.js
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const DPS_ROLES = ["attack", "anomaly", "rupture"];
const SUPPORT_ROLE = "support";
const NON_DPS_ROLES = ["defense", "stun", "support"];
const ELEMENTS = ["fire", "ice", "electric", "physical", "ether"];

// ============================================================================
// ROLE CLASSIFICATION HELPERS
// ============================================================================

function isDPS(unit) {
    return DPS_ROLES.some(role => unit.tags.includes(role));
}

function isAttacker(unit) {
    return unit.tags.includes("attack");
}

function isAnomaly(unit) {
    return unit.tags.includes("anomaly");
}

function isRupture(unit) {
    return unit.tags.includes("rupture");
}

function isSupport(unit) {
    return unit.tags.includes(SUPPORT_ROLE);
}

function isDefense(unit) {
    return unit.tags.includes("defense");
}

function isStun(unit) {
    return unit.tags.includes("stun");
}

function isNonDPS(unit) {
    return NON_DPS_ROLES.some(role => unit.tags.includes(role));
}

function isTitled(unit) {
    return unit.tags.includes("title");
}

function isLimited(unit) {
    return unit.limited === true;
}

function isSRank(unit) {
    return unit.rank === "S";
}

function isARank(unit) {
    return unit.rank === "A";
}

function getElement(unit) {
    return unit.tags.find(tag => ELEMENTS.includes(tag));
}

function hasDefensiveAssist(unit) {
    return unit.tags.includes("assist:defensive");
}

// ============================================================================
// SYNERGY SCORING
// ============================================================================

function calculateSynergyScore(unit, teammates, boss) {
    let score = 0;
    const synergy = unit.synergy;
    if (!synergy) return 0;
    
    // Unit-specific synergies (e.g., Evelyn synergizes with Astra)
    // Strong bonus - explicit unit synergy is a very strong signal
    // Should override generic tag synergy or element considerations
    if (synergy.units && synergy.units.length > 0) {
        for (const teammate of teammates) {
            if (synergy.units.includes(teammate.name)) {
                score += 40;
            }
        }
    }
    
    if (synergy.tags && synergy.tags.length > 0) {
        // Check if this unit has element synergy (like Soukaku's "ice" or Lighter's "fire", "ice")
        const synergyElements = synergy.tags.filter(tag => ELEMENTS.includes(tag));
        if (synergyElements.length > 0) {
            // Check if ANY teammate matches ANY of the element synergies
            const anyTeammateMatchesElement = teammates.some(t => 
                synergyElements.some(elem => t.tags.includes(elem))
            );
            if (!anyTeammateMatchesElement) {
                // Element synergy unit on team with NO matching element teammates
                // (e.g., Soukaku on Harumasa team) - this is a complete waste
                // Should only appear as last resort when forced by other constraints
                score -= 120;
            }
        }
        
        for (const teammate of teammates) {
            // Check if teammate matches any synergy tag preference
            // Role synergies (attack, anomaly, rupture) match ANY unit of that role
            // Element matching is handled separately below
            const matchesAnyPreference = synergy.tags.some(tag => {
                return teammate.tags.includes(tag);
            });
            
            if (matchesAnyPreference) {
                // Check if this is an element synergy (e.g., Soukaku's "ice" or Lighter's "fire","ice")
                const synergyElements = synergy.tags.filter(tag => ELEMENTS.includes(tag));
                
                if (synergyElements.length > 0) {
                    // Element synergy supports (like Soukaku) need TWO conditions:
                    // 1. Boss must be weak to at least one synergy element
                    // 2. Team must have a DPS of that element
                    // For multi-element synergy (like Lighter), ANY matching element counts
                    const matchingSynergyElement = synergyElements.find(elem => 
                        boss.weaknesses.includes(elem)
                    );
                    const bossWeakToSynergyElement = matchingSynergyElement !== undefined;
                    
                    // Check if team has element DPS for any synergy element the boss is weak to
                    const unitIsElementDPS = isDPS(unit) && synergyElements.includes(getElement(unit));
                    const teamHasMatchingElementDPS = unitIsElementDPS || (matchingSynergyElement && teammates.some(t => 
                        isDPS(t) && getElement(t) === matchingSynergyElement
                    ));
                    
                    if (!bossWeakToSynergyElement || !teamHasMatchingElementDPS) {
                        // Element synergy is completely wasted - near-disqualifying
                        score -= 70;
                    } else if (isDPS(teammate)) {
                        score += 10;
                    } else {
                        score += 5;
                    }
                } else if (isDPS(teammate)) {
                    score += 10;
                } else {
                    score += 5;
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

function getDPSType(unit) {
    if (unit.tags.includes("attack")) return "attack";
    if (unit.tags.includes("anomaly")) return "anomaly";
    if (unit.tags.includes("rupture")) return "rupture";
    return null;
}

function unitsHaveSynergy(unit1, unit2) {
    const u1SynergizesU2 = 
        unit1.synergy?.units?.includes(unit2.name) ||
        unit1.synergy?.tags?.some(tag => unit2.tags.includes(tag));
    
    const u2SynergizesU1 = 
        unit2.synergy?.units?.includes(unit1.name) ||
        unit2.synergy?.tags?.some(tag => unit1.tags.includes(tag));
    
    return u1SynergizesU2 || u2SynergizesU1;
}

function unitsMutuallyLinked(unit1, unit2) {
    // Both units explicitly list each other in synergy.units
    const u1ListsU2 = unit1.synergy?.units?.includes(unit2.name);
    const u2ListsU1 = unit2.synergy?.units?.includes(unit1.name);
    return u1ListsU2 && u2ListsU1;
}

function hasStunSynergyTag(unit) {
    return unit.synergy?.tags?.includes("stun");
}

function calculateDPSMixingPenalty(team) {
    const dpsUnits = team.filter(isDPS);
    if (dpsUnits.length < 2) return 0;
    
    let penalty = 0;
    
    const attackers = dpsUnits.filter(u => u.tags.includes("attack"));
    const anomalyUnits = dpsUnits.filter(u => u.tags.includes("anomaly"));
    const ruptureUnits = dpsUnits.filter(u => u.tags.includes("rupture"));
    
    const dpsTypes = new Set(dpsUnits.map(getDPSType).filter(t => t !== null));
    
    // Double attack - check for mutual synergy
    if (attackers.length >= 2) {
        let hasMutualSynergy = false;
        let hasAnySynergy = false;
        for (let i = 0; i < attackers.length; i++) {
            for (let j = i + 1; j < attackers.length; j++) {
                if (unitsMutuallyLinked(attackers[i], attackers[j])) {
                    hasMutualSynergy = true;
                    hasAnySynergy = true;
                    break;
                }
                if (unitsHaveSynergy(attackers[i], attackers[j])) {
                    hasAnySynergy = true;
                }
            }
        }
        if (hasMutualSynergy) {
            // Mutually synergistic attackers (e.g., Seed/Orphie) - bonus instead of penalty!
            penalty += 20;
        } else if (!hasAnySynergy) {
            penalty -= 60; // Attack teams want stun/attack/support, not 2x attack
        }
    }
    
    // Double rupture without synergy - disqualify (rupture teams never want 2 rupture DPS)
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
            return -999; // Double rupture is never valid
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

function scoreTeamForBoss(team, boss, options = {}) {
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
    
    // TIER scoring - cliff-based system
    // Elite (T0-T0.5): Best units, always prioritize
    // Good (T1-T1.5): Solid but noticeably weaker than elite
    // Mediocre (T2): Only use if forced - BIG cliff from good
    // Bad (T3-T4): Near-useless, desperation picks
    for (const unit of team) {
        const tier = unit.tier ?? 2.5;
        
        if (tier <= 0.5) {
            // Elite tier - strong bonus (bigger cliff from good tier)
            const tierBonus = 65 - (tier * 20); // T0: +65, T0.5: +55
            score += tierBonus;
        } else if (tier <= 1.5) {
            // Good tier - moderate bonus (significant cliff from elite)
            const tierBonus = 25 - ((tier - 1) * 10); // T1: +25, T1.5: +20
            score += tierBonus;
        } else if (tier <= 2) {
            // Mediocre tier - penalty (big cliff from good)
            score -= lenient ? 15 : 40;
        } else if (tier <= 3) {
            // Bad tier - heavy penalty
            score -= lenient ? 40 : 90;
        } else {
            // Terrible tier - near-disqualifying
            score -= lenient ? 60 : 130;
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
        
        // For rupture teams, stunners with rupture synergy (Dialyn, JuFufu) are optimal
        // They should beat generic supports and non-synergy stunners
        for (const unit of stunUnits) {
            const hasRuptureSynergy = unit.synergy?.tags?.includes("rupture");
            if (hasRuptureSynergy) {
                // Rupture-synergy stunners get strong bonus on rupture teams
                // This ensures Stun/Rupture/Lucia beats Defense/Rupture/Lucia
                score += 40;
            } else {
                if (boss.shill === "rupture") {
                    score -= 25; // On rupture-shill, non-synergy stun is worse
                } else {
                    score -= 15; // On non-rupture-shill, still a penalty
                }
            }
        }
    }
    
    // Wrong-role DPS on shill bosses - explicit penalty
    // Attack teams on rupture-shill should be heavily penalized
    if (boss.shill === "rupture" && attackers.length > 0) {
        score -= 100; // Attack DPS is wrong role for rupture-shill boss
    }
    
    // DPS weakness/resistance
    let dpsMatchesWeakness = false;
    let onElementDPSCount = 0;
    
    for (const unit of dpsUnits) {
        const element = getElement(unit);
        
        if (boss.resistances.includes(element)) {
            return -1;
        }
        
        if (boss.weaknesses.includes(element)) {
            dpsMatchesWeakness = true;
            onElementDPSCount++;
        }
    }
    
    // Apply on-element bonuses with diminishing returns for double-attacker teams
    // First on-element DPS gets full bonus, second gets reduced bonus
    for (const unit of dpsUnits) {
        const element = getElement(unit);
        
        if (boss.weaknesses.includes(element)) {
            if (onElementDPSCount >= 2 && attackers.length >= 2) {
                // Double-attacker team with both on-element
                // Give reduced bonus to prevent element-stacking distortion
                // (e.g., Harumasa+Seed both electric shouldn't double-dip)
                if (isSRank(unit)) {
                    score += 25; // Reduced from 40
                } else {
                    score += 12; // Reduced from 20
                }
            } else {
                // Normal case: full on-element bonus
                if (isSRank(unit)) {
                    score += 40;
                } else {
                    score += 20;
                }
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
    
    // Dual-weakness coverage - primarily matters for anomaly teams
    // On anomaly-SHILL bosses, dual-element is critical (forced to use different elements)
    // On non-shill bosses, dual-element is nice but single-element is equally viable
    if (boss.weaknesses.length >= 2) {
        const dpsElements = new Set(dpsUnits.map(getElement));
        const weaknessesCovered = boss.weaknesses.filter(w => dpsElements.has(w));
        
        if (weaknessesCovered.length === 0) {
            // Team covers ZERO weaknesses - near-disqualifying
            // e.g., Seed(electric)/Orphie(fire) on ice/ether boss
            score -= 100;
        } else if (anomalyUnits.length >= 2 && weaknessesCovered.length >= 2) {
            // Anomaly team covers multiple weaknesses
            if (boss.shill === "anomaly") {
                // On anomaly-shill, dual-element is critical - strong bonus
                score += 50;
            } else {
                // On non-shill, dual-element is nice but not essential - small bonus
                score += 15;
            }
        }
        // Single-element teams are fine - no penalty
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
                score += 25; // Titled units have significant advantage
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
    // Lucia with rupture synergy is ESSENTIAL - like Yuzuha for anomaly
    // Pan/Lucia should ALWAYS beat Astra/Nicole on rupture teams
    const hasRuptureDPS = ruptureUnits.length > 0;
    
    if (hasRuptureDPS) {
        for (const unit of [...supportUnits, ...defenseUnits]) {
            const hasTagPreferences = unit.synergy?.tags?.length > 0;
            const hasRuptureSynergy = unit.synergy?.tags?.includes("rupture");
            
            if (!hasTagPreferences) {
                // Universal support on rupture team - heavy penalty
                score -= 60; // Pan/Lucia MUST beat Astra/Nicole
            } else if (hasRuptureSynergy) {
                // Rupture-synergy supports (Lucia, Pan) get bonus - they're essential
                // Lucia especially is critical for rupture teams
                score += 45;
            } else {
                // Has preferences but wrong type (e.g., ice support on rupture)
                score -= 35;
            }
        }
    }
    
    // Specialized beats universal (anomaly teams)
    // Yuzuha with anomaly synergy should beat Astra/Nicole on ANY anomaly team
    if (anomalyUnits.length > 0) {
        for (const unit of [...supportUnits, ...defenseUnits]) {
            const hasTagPreferences = unit.synergy?.tags?.length > 0;
            const hasAnomalySynergy = unit.synergy?.tags?.includes("anomaly");
            
            if (!hasTagPreferences) {
                // Universal support on anomaly team - penalty
                score -= 30;
            } else if (hasAnomalySynergy) {
                // Anomaly-specialized supports (Yuzuha) get bonus
                score += 20;
            }
        }
    }
    
    // Synergy scoring
    for (const unit of team) {
        const teammates = team.filter(t => t.id !== unit.id);
        score += calculateSynergyScore(unit, teammates, boss);
    }
    
    // Mutual unit synergy bonus (e.g., Seed/Orphie both list each other)
    for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
            if (unitsMutuallyLinked(team[i], team[j])) {
                score += 25; // Moderate bonus - tier cliffs do most of the work now
            }
        }
    }
    
    // DPS mixing penalty
    score += calculateDPSMixingPenalty(team);
    
    // Double stun handling
    // Check if any DPS has explicit stun synergy (e.g., Hugo)
    const dpsWithStunSynergy = dpsUnits.filter(hasStunSynergyTag);
    
    if (dpsWithStunSynergy.length > 0) {
        // DPS explicitly wants stun synergy - double stun is heavily favored
        if (stunUnits.length >= 2) {
            // Attack/rupture with stun synergy + double stun = ideal composition
            score += 60; // Large bonus for double stun when DPS wants it
        } else if (stunUnits.length === 1) {
            // Has a stunner but not double stun - slight penalty
            score -= 15;
        } else {
            // No stunner at all when DPS wants stun - heavy penalty
            score -= 80;
        }
    } else if (stunUnits.length >= 2) {
        // Double stun without DPS stun synergy
        // Allow if: boss shills stun, OR stunners have synergy with each other
        const bossShillsStun = boss.shill === "stun";
        
        if (!bossShillsStun) {
            let hasStunSynergy = false;
            for (let i = 0; i < stunUnits.length; i++) {
                for (let j = i + 1; j < stunUnits.length; j++) {
                    if (unitsHaveSynergy(stunUnits[i], stunUnits[j])) {
                        hasStunSynergy = true;
                        break;
                    }
                }
            }
            if (!hasStunSynergy) {
                score -= 80; // Heavy penalty - double stun rarely makes sense
            }
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

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Constants
    DPS_ROLES,
    ELEMENTS,
    
    // Role helpers
    isDPS,
    isAttacker,
    isAnomaly,
    isRupture,
    isSupport,
    isDefense,
    isStun,
    isNonDPS,
    isTitled,
    isLimited,
    isSRank,
    isARank,
    getElement,
    hasDefensiveAssist,
    
    // Scoring functions
    calculateSynergyScore,
    calculateDPSMixingPenalty,
    scoreTeamForBoss,
    unitsHaveSynergy,
    unitsMutuallyLinked,
    hasStunSynergyTag
};



