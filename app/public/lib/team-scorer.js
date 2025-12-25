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

export function calculateSynergyScore(unit, teammates, boss, lenient = false) {
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
        const synergyElements = synergy.tags.filter(tag => ELEMENTS.includes(tag));
        const hasElementSynergy = synergyElements.length > 0;
        
        // Check if this unit has subdps synergy (like Burnice, Grace, Vivian, Orphie)
        const hasSubDPSSynergy = synergy.tags.includes("subdps");
        
        if (hasElementSynergy) {
            // Check if ANY teammate matches ANY of the synergy elements
            // This handles both single-element (Soukaku: ice) and multi-element (Yuzuha: all) synergies
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
        
        if (hasSubDPSSynergy) {
            // Units with subdps synergy (Burnice, Grace, Vivian, Orphie) need a MAIN DPS teammate
            // A main DPS is any DPS unit that does NOT have the subdps tag
            // The main DPS can be any role type - doesn't have to match
            // Examples: 
            //   - Grace (anomaly/subdps) + Harumasa (attack, no subdps) = VALID
            //   - Burnice (anomaly/subdps) + Jane Doe (anomaly, no subdps) = VALID
            //   - Burnice + Vivian (both subdps) = INVALID (no main DPS)
            //   - Orphie (attack/subdps) alone with supports = INVALID (no main DPS)
            
            const otherMainDPSCount = teammates.filter(t => 
                isDPS(t) && !t.synergy?.tags?.includes("subdps")
            ).length;
            
            if (otherMainDPSCount === 0) {
                // No main DPS teammate - only subdps units or supports
                // These teams lack a primary damage dealer
                if (lenient) {
                    // In lenient mode, ignore this penalty (desperate situations)
                    // No penalty applied
                } else {
                    score -= 100; // Heavy penalty in strict mode
                }
            } else {
                // Has a main DPS teammate - good synergy
                score += 20;
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
                const isElementSynergy = synergyElements.length > 0;
                
                if (isElementSynergy) {
                    // Element synergy supports (like Soukaku) need TWO conditions:
                    // 1. Boss must be weak to that element (OR boss is neutral/global)
                    // 2. Team must have a DPS of that element
                    // For multi-element synergy (like Yuzuha), check if ANY synergy element matches
                    const matchingSynergyElement = synergyElements.find(elem => boss.weaknesses.includes(elem));
                    const bossWeakToElement = matchingSynergyElement !== undefined;
                    // If boss has no specific weaknesses (neutral/global), treat as weak to element
                    const isNeutralBoss = boss.weaknesses.length === 0;
                    const effectiveBossWeak = bossWeakToElement || isNeutralBoss;

                    const synergyElement = matchingSynergyElement || synergyElements[0];
                    
                    // Check if team has element DPS - INCLUDING the unit itself!
                    const unitIsElementDPS = isDPS(unit) && getElement(unit) === synergyElement;
                    const teamHasElementDPS = unitIsElementDPS || teammates.some(t => 
                        isDPS(t) && getElement(t) === synergyElement
                    );
                    
                    if (!effectiveBossWeak || !teamHasElementDPS) {
                        // Element synergy is completely wasted - near-disqualifying
                        // (Unless boss is neutral, then we only care about team matching)
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

/**
 * Determines if a unit is a specialist.
 * A specialist has synergy with exactly ONE DPS type and avoids the other two.
 * Examples: Lucia (rupture specialist), Yuzuha (anomaly specialist), Pan (rupture specialist)
 */
export function isSpecialist(unit) {
    if (!unit.synergy) return false;
    
    const synergyTags = unit.synergy.tags || [];
    const avoidTags = unit.synergy.avoid || [];
    
    // Count how many DPS types are in synergy tags
    const dpsTypesInSynergy = DPS_ROLES.filter(role => synergyTags.includes(role));
    
    // Count how many DPS types are in avoid tags
    const dpsTypesInAvoid = DPS_ROLES.filter(role => avoidTags.includes(role));
    
    // Specialist: synergizes with exactly 1 DPS type AND avoids the other 2
    return dpsTypesInSynergy.length === 1 && dpsTypesInAvoid.length === 2;
}

/**
 * Gets the DPS type a specialist synergizes with (null if not a specialist)
 */
export function getSpecialistType(unit) {
    if (!isSpecialist(unit)) return null;
    
    const synergyTags = unit.synergy.tags || [];
    for (const role of DPS_ROLES) {
        if (synergyTags.includes(role)) {
            return role;
        }
    }
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
            penalty -= 200; // Attack teams want stun/attack/support, not 2x attack. Heavy penalty to disqualify unless huge synergy elsewhere
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
            penalty -= 200; // Rupture teams want stun/rupture/support or rupture/2x support. Heavy penalty.
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
    const { lenient = false, debug = false } = options;
    // In lenient mode, start with higher base score to offset unavoidable penalties
    let score = lenient ? 200 : 100;
    const debugReasons = [];
    
    const log = (reason, delta = 0) => {
        if (debug) {
            debugReasons.push({ reason, delta, runningScore: score + delta });
        }
    };
    
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
    
    // TIER scoring - cliff-based system with big gaps between tiers
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
            // Bad tier - near-disqualifying (T3 DPS like Nekomata should rarely appear)
            score -= lenient ? 40 : 130;
        } else {
            // Terrible tier - disqualifying
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
        // Check for Monoshock exception: attacker with anomaly+element synergy paired with same-element anomaly
        // Example: Harumasa (attack, electric, synergy: anomaly+electric) + Grace (anomaly, electric)
        let hasAnomalyAttackSynergy = false;
        
        for (const attacker of attackers) {
            if (attacker.synergy?.tags?.includes("anomaly")) {
                const attackerElement = getElement(attacker);
                // Check for matching element synergy (e.g., Harumasa's "electric" in synergy.tags)
                const hasSynergyElement = attacker.synergy.tags.some(t => ELEMENTS.includes(t));
                const matchingAnomalies = nonTitledAnomalyUnits.filter(a => getElement(a) === attackerElement);
                
                if (matchingAnomalies.length > 0 && (hasSynergyElement || !hasSynergyElement)) {
                    // Attacker has anomaly synergy AND there's a same-element anomaly unit
                    hasAnomalyAttackSynergy = true;
                    log(`Anomaly-attack synergy: ${attacker.name} + ${matchingAnomalies[0].name}`, 10);
                    score += 10; // Small bonus for valid Monoshock composition
                    break;
                }
            }
        }
        
        if (!hasAnomalyAttackSynergy) {
            if (nonAnomalyDPS.length > 0) {
                // Non-titled anomaly with non-anomaly DPS - normally invalid
                if (lenient) {
                    log('Non-titled anomaly with non-anomaly DPS (lenient)', -80);
                    score -= 80; // Heavy penalty but allow in desperate situations
                } else {
                    log('DISQUALIFIED: Non-titled anomaly with non-anomaly DPS');
                    if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'), debugReasons);
                    return -1;
                }
            }
            if (dpsUnits.length === nonTitledAnomalyUnits.length) {
                // Solo non-titled anomaly - normally invalid
                if (lenient) {
                    log('Solo non-titled anomaly (lenient)', -100);
                    score -= 100; // Very heavy penalty but allow
                } else {
                    log('DISQUALIFIED: Solo non-titled anomaly');
                    if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'), debugReasons);
                    return -1;
                }
            }
        }
    }
    
    // Solo titled anomaly agent validation
    if (anomalyUnits.length === 1 && dpsUnits.length === 1 && isTitled(anomalyUnits[0])) {
        const hasSupportOrDefense = supportUnits.length > 0 || defenseUnits.length > 0;
        const hasStun = stunUnits.length > 0;
        
        // Check for explicit unit synergy (named synergy)
        let hasExplicitSynergy = false;
        for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
                const u1 = team[i];
                const u2 = team[j];
                // Check if u1 lists u2, or u2 lists u1 in synergy.units
                if (u1.synergy?.units?.includes(u2.name) || u2.synergy?.units?.includes(u1.name)) {
                    hasExplicitSynergy = true;
                    break;
                }
            }
            if (hasExplicitSynergy) break;
        }

        // Must have Support/Defense AND (Stun OR Explicit Synergy)
        if (!hasSupportOrDefense || (!hasStun && !hasExplicitSynergy)) {
             if (lenient) {
                 log('Invalid solo titled anomaly comp (lenient)', -100);
                 score -= 100;
             } else {
                 log('DISQUALIFIED: Invalid solo titled anomaly comp');
                 if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'), debugReasons);
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
    // EXCEPTION: Monoshock teams (attacker with anomaly synergy + same-element anomaly)
    if (boss.shill === "attack" || (!boss.shill && attackers.length > 0)) {
        // Check for Monoshock composition
        const hasAnomalyAttackComp = attackers.some(a => {
            if (!a.synergy?.tags?.includes("anomaly")) return false;
            const attackerElement = getElement(a);
            return anomalyUnits.some(an => getElement(an) === attackerElement);
        });
        
        if (hasAnomalyAttackComp && anomalyUnits.length > 0) {
            // Monoshock: attacker + anomaly = valid hybrid, no stunner needed
            log('Anomaly-attack composition - stunner not required', 5);
            score += 5;
        } else if (stunUnits.length >= 1) {
            log('Attack team with stunner', 15);
            score += 15;
        } else {
            log('Attack team without stunner', -60);
            score -= 60; // Near-disqualifying: normal attack teams need stunner
        }
        if (supportUnits.length >= 1 || defenseUnits.length >= 1) {
            score += 10;
        }
        if (attackers.length > 1) {
             const hasSubDPS = attackers.some(u => u.synergy?.tags?.includes("subdps"));
             if (!hasSubDPS) {
                 score -= 50; // Double attacker rarely makes sense UNLESS one is SubDPS
             }
        }
    }
    
    // Rupture teams
    if (boss.shill === "rupture" || (!boss.shill && ruptureUnits.length > 0)) {
        // Two valid compositions:
        // 1. stun/rupture/[support|defense] - traditional composition (with bonus)
        // 2. rupture/2x[support|defense] - double support composition
        const hasStunComposition = stunUnits.length >= 1 && (supportUnits.length >= 1 || defenseUnits.length >= 1);
        const hasDoubleSupport = supportUnits.length + defenseUnits.length >= 2;
        
        if (hasStunComposition || hasDoubleSupport) {
            score += 15;
            
            // Bonus for the traditional stun/rupture/support|defense composition
            // Consensus: rupture teams with stun are generally better than double-support
            if (hasStunComposition) {
                score += 25; // Increased base bonus to lift the entire Stun/Rupture archetype
                
                // Extra bonus if the stunner specifically synergizes with Rupture
                // (e.g. Dialyn, Ju Fufu) - this makes them superior to generic stunners
                const synergisticStunner = stunUnits.some(u => u.synergy?.tags?.includes("rupture"));
                if (synergisticStunner) {
                    log('Synergistic Stunner in Rupture team', 20);
                    score += 20;
                }
            }
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
            const isSubDPS = unit.synergy?.tags?.includes("subdps");

            // On-element DPS is the foundation of team building
            if (isSRank(unit)) {
                if (isSubDPS) {
                    score += 25; // Reduced for subdps
                } else {
                    score += 40; // S-rank on-element DPS is the starting point
                }
            } else {
                if (isSubDPS) {
                    score += 10; // Reduced for subdps
                } else {
                    score += 20; // A-rank on-element still good
                }
            }
        } else {
            // Off-element DPS - significant penalty (reduced in lenient mode)
            // But if boss has no weaknesses (element-neutral), no penalty
            if (boss.weaknesses.length > 0) {
                score -= lenient ? 10 : 30;
            }
        }
    }
    
    if (dpsUnits.length > 0 && !dpsMatchesWeakness && boss.weaknesses.length > 0) {
        // No DPS matches weakness - SEVERE penalty
        // In elemental weakness game, not hitting weakness with DPS is a major flaw
        score -= lenient ? 40 : 100;
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
        } else if (!boss.resistances.includes(element) && boss.weaknesses.length > 0) {
            // Neutral/off-element stun
            
            // EXCEPTION: If stunner has explicit synergy with the team's DPS type, waive the penalty
            // Synergy trumps element for utility roles
            const dpsTypes = new Set(dpsUnits.map(getDPSType).filter(t => t !== null));
            const hasTypeSynergy = unit.synergy?.tags?.some(tag => dpsTypes.has(tag));
            
            if (hasTypeSynergy) {
                log(`Off-element stunner waived due to synergy (${unit.name})`, 0);
            } else {
                // Only penalize if boss has weaknesses (element-neutral)
                if (boss.shill === "stun") {
                    // On stun-shill, off-element is acceptable (stun is priority)
                    score -= 15;
                } else {
                    // On non-stun-shill, off-element stunner is a bigger issue
                    score -= 35;
                }
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
    
    // Specialist vs Generalist Support/Defense Scoring
    // Specialists: synergize with exactly ONE DPS type and avoid the other two
    // Examples: Lucia (rupture), Yuzuha (anomaly), Pan (rupture)
    // Generalists: synergize with multiple or no specific DPS types
    // Examples: Astra, Nicole (but Nicole avoids rupture)
    //
    // Matching specialist should ALWAYS beat generalist for their DPS type
    // Mismatched specialist should ALWAYS lose to generalist (heavy penalty)
    
    for (const unit of [...supportUnits, ...defenseUnits]) {
        if (isSpecialist(unit)) {
            const specialistType = getSpecialistType(unit);
            const teamDPSTypes = dpsUnits.map(getDPSType).filter(t => t !== null);
            const primaryDPSType = teamDPSTypes[0]; // Assume first DPS defines team type
            
            if (primaryDPSType === specialistType) {
                // Matching specialist - strong bonus
                // This ensures specialists beat generalists when matched
                
                // CRITICAL CHECK: Does the specialist match the BOSS SHILL?
                // If the boss shills "rupture" but this is an "anomaly" specialist, they are boosting the wrong mechanic.
                // Even if they match the TEAM, the TEAM is wrong for the BOSS.
                if (boss.shill && DPS_ROLES.includes(boss.shill) && specialistType !== boss.shill) {
                    score -= 40; // Penalize specialist for focusing on the wrong mechanic for this boss
                } else {
                    if (isARank(unit)) {
                         score += 55; // Significantly increased to beat S-Rank Generalists
                    } else {
                         score += 65; // E.g., Lucia on rupture team beats Astra on rupture team
                    }
                }
            } else {
                // Mismatched specialist - severe penalty
                // This ensures specialists lose to generalists when mismatched
                score -= 80; // E.g., Lucia on attack team loses to Astra on attack team
            }
        } else {
            // Generalist support/defense
            const hasTagPreferences = unit.synergy?.tags?.length > 0;
            
            if (!hasTagPreferences) {
                // Pure generalist (no tag preferences at all) - e.g., Caesar, Ben
                // These are flexible but never optimal
                const teamDPSTypes = dpsUnits.map(getDPSType).filter(t => t !== null);
                if (teamDPSTypes.length > 0) {
                    score -= 15; // Small penalty for not being specialized
                }
            } else {
                // Partial generalist (has preferences but not a specialist)
                // E.g., Nicole (avoids rupture but not a specialist), Astra (no avoid)
                const teamDPSTypes = dpsUnits.map(getDPSType).filter(t => t !== null);
                const primaryDPSType = teamDPSTypes[0];
                
                // Check if preferences match team DPS
                const matchesTeamDPS = unit.synergy?.tags?.includes(primaryDPSType);
                const avoidsTeamDPS = unit.synergy?.avoid?.includes(primaryDPSType);
                
                if (avoidsTeamDPS) {
                    // Generalist that avoids this DPS type - heavy penalty
                    score -= 60; // E.g., Nicole on rupture team
                } else if (matchesTeamDPS) {
                    // Generalist with matching preference - small bonus but still loses to specialist
                    score += 10; // Less than specialist bonus (40)
                } else {
                    // Generalist with non-matching preference - moderate penalty
                    score -= 25; // E.g., element-focused support on wrong-element team
                }
            }
        }
    }
    
    // Synergy scoring
    for (const unit of team) {
        const teammates = team.filter(t => t.numericId !== unit.numericId);
        score += calculateSynergyScore(unit, teammates, boss, lenient);
    }
    
    // DPS mixing penalty
    score += calculateDPSMixingPenalty(team);
    
    // Double stun penalty
    // Two stunners without synergy is wasteful - you'd rather have support/defense
    if (stunUnits.length >= 2) {
        let hasStunSynergy = false;
        
        // Check for specific stun synergy:
        // 1. Explicit unit synergy (one stunner lists the other in synergy.units)
        // 2. Explicit tag synergy for 'stun' (one stunner lists 'stun' in synergy.tags)
        // 3. DPS unit explicitly requests 'stun' synergy (rare, but possible)
        
        for (let i = 0; i < stunUnits.length; i++) {
            for (let j = i + 1; j < stunUnits.length; j++) {
                const s1 = stunUnits[i];
                const s2 = stunUnits[j];
                
                // Check named synergy
                if (s1.synergy?.units?.includes(s2.name) || s2.synergy?.units?.includes(s1.name)) {
                    hasStunSynergy = true;
                    break;
                }
                
                // Check specific 'stun' tag synergy
                // We do NOT count elemental tags here because sharing an element doesn't justify double stun
                if (s1.synergy?.tags?.includes('stun') || s2.synergy?.tags?.includes('stun')) {
                     hasStunSynergy = true;
                     break;
                }
            }
            if (hasStunSynergy) break;
            
            for (const dps of dpsUnits) {
                if (dps.synergy?.tags?.includes("stun")) {
                    hasStunSynergy = true;
                    break;
                }
            }
        }
        
        if (!hasStunSynergy) {
            score -= 150; // Heavy penalty - double stun without synergy is inefficient and should be disqualified
        }
    }
    
    // Defensive assist requirement
    const defensiveAssistCount = team.filter(hasDefensiveAssist).length;
    if (defensiveAssistCount < boss.assists) {
        return -1;
    }
    
    score += (defensiveAssistCount - boss.assists) * 3;
    
    if (debug) {
        log(`Final score: ${score}`);
        return { score, debugReasons };
    }
    
    return score;
}

