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

export function hasStunSynergy(unit) {
    return unit.synergy?.tags?.includes("stun");
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

export function calculateSynergyScore(unit, teammates, boss, lenient = false, debug = false) {
    let score = 0;
    const synergy = unit.synergy;
    if (!synergy) return 0;
    
    const dbg = (msg) => { if (debug) console.log(`      ${unit.name}: ${msg}`); };
    
    // Unit-specific synergies (e.g., Nicole synergizes with Astra)
    // Small bonus to avoid over-coupling issues
    if (synergy.units && synergy.units.length > 0) {
        for (const teammate of teammates) {
            if (synergy.units.includes(teammate.name)) {
                score += 5;
                dbg(`unit synergy with ${teammate.name}: +5`);
            }
            if(unitsHaveMutualSynergy(unit, teammate)) {
                //Additional bonus for mutual synergy, particularly for enabling DPS units 
                const bonus = isDPS(unit) ? 25 : 5;
                score += bonus;
                dbg(`mutual synergy with ${teammate.name}: +${bonus}`);
            }
        }
    }
    
    if (synergy.tags && synergy.tags.length > 0) {
        if (debug) dbg(`synergy.tags = [${synergy.tags.join(', ')}]`);
        
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
                // (e.g., Soukaku on Harumasa team) - dead weight, not penalty
                // The support just doesn't help with element synergy, but doesn't hurt
                // Continue processing - unit may have other synergies (unit-specific, etc.)
                dbg(`element synergy: no matching elements (dead weight, 0)`);
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
                    dbg(`subdps without main DPS (lenient): 0`);
                } else {
                    score -= 100; // Heavy penalty in strict mode
                    dbg(`subdps without main DPS: -100`);
                }
            } else {
                // Has a main DPS teammate - good synergy
                score += 20;
                dbg(`subdps has main DPS: +20`);
            }
        }
        
        // Track which DPS roles have already given synergy bonus (to prevent double-counting)
        // E.g., Dialyn with "attack" synergy should only get +30 once, even with 2 attackers
        const countedDPSRoles = new Set();
        
        for (const teammate of teammates) {
            const matchesAnyPreference = synergy.tags.some(tag => {
                if (!teammate.tags.includes(tag)) return false;
                
                // DPS role synergy (attack/anomaly/rupture) - only count once per role type
                // E.g., Dialyn + Orphie + Seed: only +30 for "attack", not +60
                if (DPS_ROLES.includes(tag)) {
                    if (countedDPSRoles.has(tag)) return false; // Already counted this role
                    countedDPSRoles.add(tag);
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

                    // For neutral boss with multi-element synergy (like Yuzuha), check ALL synergy elements
                    // For boss with weakness, only check the matching element
                    const elementsToCheck = matchingSynergyElement 
                        ? [matchingSynergyElement] 
                        : synergyElements; // Neutral boss: check all synergy elements
                    
                    // Check if team has element DPS matching ANY of the relevant synergy elements
                    const unitIsElementDPS = isDPS(unit) && elementsToCheck.includes(getElement(unit));
                    const teamHasElementDPS = unitIsElementDPS || teammates.some(t => 
                        isDPS(t) && elementsToCheck.includes(getElement(t))
                    );
                    
                    if (!effectiveBossWeak || !teamHasElementDPS) {
                        // Element synergy is completely wasted - near-disqualifying
                        // (Unless boss is neutral, then we only care about team matching)
                        score -= 70;
                        dbg(`element synergy with ${teammate.name} wasted: -70`);
                    } else if (isDPS(teammate)) {
                        // DPS-to-DPS element synergy: only count once per pair if MUTUAL
                        // Check if teammate has a reciprocal element synergy with this unit
                        const teammateElementSynergies = teammate.synergy?.tags?.filter(t => ELEMENTS.includes(t)) || [];
                        const hasMutualElementSynergy = isDPS(unit) && 
                            teammateElementSynergies.some(elem => unit.tags.includes(elem));
                        
                        if (hasMutualElementSynergy && unit.name > teammate.name) {
                            // Mutual synergy - skip to avoid double counting (other unit will count)
                            dbg(`element synergy with ${teammate.name}: SKIP (mutual, alphabetically later)`);
                        } else {
                            score += 30;
                            dbg(`element synergy with ${teammate.name} (DPS): +30`);
                        }
                    } else {
                        score += 15;
                        dbg(`element synergy with ${teammate.name} (support): +15`);
                    }
                } else if (isDPS(teammate)) {
                    // DPS-to-DPS tag synergy: only count once per pair if MUTUAL
                    // Check if teammate has a reciprocal tag synergy with this unit
                    const teammateSynergyTags = teammate.synergy?.tags || [];
                    const hasMutualTagSynergy = isDPS(unit) && 
                        teammateSynergyTags.some(tag => unit.tags.includes(tag) && !ELEMENTS.includes(tag));
                    
                    if (hasMutualTagSynergy && unit.name > teammate.name) {
                        // Mutual synergy - skip to avoid double counting (other unit will count)
                        dbg(`tag synergy with ${teammate.name}: SKIP (mutual, alphabetically later)`);
                    } else {
                        score += 30;
                        dbg(`tag synergy with ${teammate.name} (DPS): +30`);
                    }
                } else {
                    score += 15;
                    dbg(`tag synergy with ${teammate.name} (support): +15`);
                }
            } else if (isDPS(teammate)) {
                score -= 20;
                dbg(`NO tag match with DPS ${teammate.name}: -20`);
            }
        }
    }
    
    if (synergy.avoid && synergy.avoid.length > 0) {
        for (const avoidTag of synergy.avoid) {
            const avoidedTeammates = teammates.filter(t => t.tags.includes(avoidTag));
            if (avoidedTeammates.length > 0) {
                const avoidedDPS = avoidedTeammates.filter(isDPS);
                if (avoidedDPS.length > 0) {
                    dbg(`AVOID ${avoidTag} triggered by DPS: DISQUALIFY`);
                    return -999;
                } else {
                    score -= 35;
                    dbg(`AVOID ${avoidTag} triggered by non-DPS: -35`);
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
export function unitsHaveMutualSynergy(unit1, unit2) {
    //This is an explicit tag-team duo bonus:
    const u1SynergizesU2 = unit1.synergy?.units?.includes(unit2.name);
    const u2SynergizesU1 = unit2.synergy?.units?.includes(unit1.name);
    return u1SynergizesU2 && u2SynergizesU1;
}

export function calculateDPSMixingPenalty(team) {
    const dpsUnits = team.filter(isDPS);
    if (dpsUnits.length < 2) return 0;
    
    let penalty = 0;
    
    const attackers = dpsUnits.filter(u => u.tags.includes("attack"));
    const anomalyUnits = dpsUnits.filter(u => u.tags.includes("anomaly"));
    const ruptureUnits = dpsUnits.filter(u => u.tags.includes("rupture"));
    
    const dpsTypes = new Set(dpsUnits.map(getDPSType).filter(t => t !== null));
    
    // Double attack without synergy - disqualify unless one is subdps
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
            const hasSubdps = attackers.some(u => u.synergy?.tags?.includes("subdps"));
            if (!hasSubdps) return -999;
            penalty -= 200;
        }
    }
    
    // Double rupture without synergy - disqualify unless one is subdps
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
            const hasSubdps = ruptureUnits.some(u => u.synergy?.tags?.includes("subdps"));
            if (!hasSubdps) return -999;
            penalty -= 200;
        }
    }
    
    if (dpsTypes.size <= 1) return penalty;
    
    // Attack + Rupture: NEVER valid - disqualify
    if (dpsTypes.has("attack") && dpsTypes.has("rupture")) {
        return -999;
    }
    
    if (dpsTypes.has("attack") && dpsTypes.has("anomaly")) {
        let hasValidSynergy = false;
        
        // Monoshock requires ALL THREE team members to share the same element
        // Check if attacker has anomaly synergy + same-element anomaly + same-element third
        for (const attacker of attackers) {
            if (attacker.synergy?.tags?.includes("anomaly")) {
                const attackerElement = getElement(attacker);
                for (const anomaly of anomalyUnits) {
                    if (getElement(anomaly) === attackerElement) {
                        // Found matching attacker+anomaly, now check third unit
                        const thirdUnit = team.find(u => !isAttacker(u) && !isAnomaly(u));
                        if (thirdUnit && getElement(thirdUnit) === attackerElement) {
                            hasValidSynergy = true;
                            break;
                        }
                    }
                }
            }
            if (hasValidSynergy) break;
        }
        
        if (!hasValidSynergy) {
            // Also check reverse: anomaly with attack synergy
            for (const anomaly of anomalyUnits) {
                if (anomaly.synergy?.tags?.includes("attack")) {
                    const anomalyElement = getElement(anomaly);
                    for (const attacker of attackers) {
                        if (getElement(attacker) === anomalyElement) {
                            // Found matching anomaly+attacker, now check third unit
                            const thirdUnit = team.find(u => !isAttacker(u) && !isAnomaly(u));
                            if (thirdUnit && getElement(thirdUnit) === anomalyElement) {
                                hasValidSynergy = true;
                                break;
                            }
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
    const debugLog = [];
    
    const log = (reason, delta = 0) => {
        if (debug) {
            debugLog.push({ reason, delta, runningScore: score + delta });
        }
    };
    
    const teamLabel = team.map(u => u.name).join(' / ');
    if (debug) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`SCORING: ${teamLabel}`);
        console.log(`Base score: ${score}`);
    }
    
    const dpsUnits = team.filter(isDPS);
    const attackers = team.filter(isAttacker);
    const anomalyUnits = team.filter(isAnomaly);
    const ruptureUnits = team.filter(isRupture);
    const supportUnits = team.filter(isSupport);
    const stunUnits = team.filter(isStun);
    const defenseUnits = team.filter(isDefense);
    const nonDpsUnits = team.filter(isNonDPS);
    
    if (debug) {
        console.log(`  DPS: ${dpsUnits.map(u => `${u.name}(T${u.tier})`).join(', ')}`);
        console.log(`  Anomaly: ${anomalyUnits.map(u => u.name).join(', ') || 'none'}`);
        console.log(`  Support: ${supportUnits.map(u => u.name).join(', ') || 'none'}`);
        console.log(`  Stun: ${stunUnits.map(u => u.name).join(', ') || 'none'}`);
    }
    
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
    
    // Favored units (amplified by shillIntensity)
    const shillIntensity = boss.shillIntensity ?? 1;
    if (boss.favored && boss.favored.length > 0) {
        let favoredCount = 0;
        for (const unit of team) {
            if (boss.favored.includes(unit.name)) {
                favoredCount++;
                const multiplier = favoredCount === 1
                    ? shillIntensity
                    : 1 + (shillIntensity - 1) * 0.5;
                const bonus = Math.round(25 * multiplier);
                score += bonus;
                if (debug) console.log(`  Favored: ${unit.name} +${bonus} (intensity ${shillIntensity}, #${favoredCount})`);
            }
        }
    }
    
    // TIER scoring for DPS - cliff-based system with big gaps between tiers (full weight)
    if (debug) console.log(`\n  DPS TIER SCORING:`);
    for (const unit of dpsUnits) {
        const tier = unit.tier ?? 2.5;
        
        // Check if this attacker is a subdps supporting another attacker (e.g., Orphie)
        // Subdps attackers get reduced tier when paired with another attacker
        const isSubDPSAttacker = unit.tags.includes("attack") && 
                                 unit.synergy?.tags?.includes("subdps");
        const hasOtherAttacker = attackers.filter(a => a !== unit).length > 0;
        const isSecondaryAttacker = isSubDPSAttacker && hasOtherAttacker;
        const tierMultiplier = isSecondaryAttacker ? 0.5 : 1.0;
        
        let tierBonus = 0;
        if (tier <= 0.5) {
            // Elite tier - strong bonus (bigger cliff from good tier)
            tierBonus = (65 - (tier * 20)) * tierMultiplier; // T0: +65, T0.5: +55
            score += tierBonus;
        } else if (tier <= 1.5) {
            // Good tier - moderate bonus (significant cliff from elite)
            tierBonus = (25 - ((tier - 1) * 10)) * tierMultiplier; // T1: +25, T1.5: +20
            score += tierBonus;
        } else if (tier <= 2) {
            // Mediocre tier - penalty (big cliff from good)
            tierBonus = -(lenient ? 15 : 40);
            score += tierBonus;
        } else if (tier <= 3) {
            // Bad tier - near-disqualifying (T3 DPS like Nekomata should rarely appear)
            tierBonus = -(lenient ? 40 : 130);
            score += tierBonus;
        } else {
            // Terrible tier - disqualifying
            tierBonus = -(lenient ? 60 : 130);
            score += tierBonus;
        }
        if (debug) {
            const multiplierNote = isSecondaryAttacker ? ` (subdps x0.5)` : '';
            console.log(`    ${unit.name}: T${tier} → ${tierBonus >= 0 ? '+' : ''}${tierBonus}${multiplierNote}`);
        }
        
        // Titled DPS bonus - titled S-ranks are significantly stronger than other units
        // This creates proper separation between titled and non-titled units
        if (unit.tags.includes('title')) {
            const titledBonus = 20;
            score += titledBonus;
            if (debug) console.log(`    ${unit.name}: +${titledBonus} (titled unit bonus)`);
        }
    }
    
    // TIER scoring for support/defense/stun - REDUCED weight (~35% of DPS)
    // DPS matters MORE than supports; supports enhance good teams but can't carry bad DPS
    for (const unit of [...supportUnits, ...defenseUnits, ...stunUnits]) {
        const tier = unit.tier ?? 2.5;
        
        if (tier <= 0.5) {
            // Elite tier - reduced bonus
            const tierBonus = 23 - (tier * 8); // T0: +23, T0.5: +19 (was +40/+34)
            score += tierBonus;
        } else if (tier <= 1.5) {
            // Good tier - reduced bonus
            const tierBonus = 9 - ((tier - 1) * 4); // T1: +9, T1.5: +7 (was +15/+12)
            score += tierBonus;
        } else if (tier <= 2) {
            // Mediocre tier - reduced penalty
            score -= lenient ? 5 : 14; // (was -10/-25)
        } else if (tier <= 3) {
            // Bad tier - significant penalty
            score -= lenient ? 20 : 60;
        } else {
            // Terrible tier (T4+) - near-disqualifying penalty
            score -= lenient ? 40 : 100;
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
    
    // Flags for solo anomaly composition validity - hoisted so anomaly comp section can use them
    let hasStunSynergyAnomalyComp = false;
    let hasExplicitSynergyAnomalyComp = false;
    
    if (nonTitledAnomalyUnits.length > 0 && anomalyUnits.length < 2) {
        // Check for Monoshock exception: ALL THREE team members must share the same element
        // Example: Harumasa (attack, electric) + Grace (anomaly, electric) + Rina (support, electric)
        let hasAnomalyAttackSynergy = false;
        
        for (const attacker of attackers) {
            if (attacker.synergy?.tags?.includes("anomaly")) {
                const attackerElement = getElement(attacker);
                const matchingAnomalies = nonTitledAnomalyUnits.filter(a => getElement(a) === attackerElement);
                
                if (matchingAnomalies.length > 0) {
                    // Check that the third team member is also the same element
                    const thirdUnit = team.find(u => !isAttacker(u) && !isAnomaly(u));
                    if (thirdUnit && getElement(thirdUnit) === attackerElement) {
                        // All three units share the same element - valid Monoshock
                        hasAnomalyAttackSynergy = true;
                        log(`Monoshock (all ${attackerElement}): ${attacker.name} + ${matchingAnomalies[0].name} + ${thirdUnit.name}`, 10);
                        score += 10; // Small bonus for valid Monoshock composition
                        break;
                    }
                }
            }
        }
        
        // Check for stun-synergy anomaly exception (e.g., Aria)
        // These anomaly units can work in stun/anomaly/support compositions like attack teams
        // OR with explicit unit synergy (e.g., Aria/Sunna/Yuzuha)
        const stunSynergyAnomalyUnits = nonTitledAnomalyUnits.filter(hasStunSynergy);
        
        if (stunSynergyAnomalyUnits.length > 0) {
            const hasStunner = stunUnits.length >= 1;
            
            let hasExplicitSynergy = false;
            for (const anomaly of stunSynergyAnomalyUnits) {
                for (const teammate of team.filter(t => t !== anomaly)) {
                    if (anomaly.synergy?.units?.includes(teammate.name) || 
                        teammate.synergy?.units?.includes(anomaly.name)) {
                        hasExplicitSynergy = true;
                        break;
                    }
                }
                if (hasExplicitSynergy) break;
            }
            
            hasStunSynergyAnomalyComp = hasStunner || hasExplicitSynergy;
        }
        
        // Explicit synergy anomaly/support/support pattern (generalized)
        // Non-subdps anomaly with explicit unit synergy partner can use double-support composition
        // This enables patterns like Aria/Sunna/Yuzuha and future similar compositions
        if (!hasStunSynergyAnomalyComp) {
            const nonSubdpsAnomalyUnits = nonTitledAnomalyUnits.filter(u => 
                !u.synergy?.tags?.includes("subdps")
            );
            for (const anomaly of nonSubdpsAnomalyUnits) {
                for (const teammate of team.filter(t => t !== anomaly)) {
                    if (anomaly.synergy?.units?.includes(teammate.name) || 
                        teammate.synergy?.units?.includes(anomaly.name)) {
                        hasExplicitSynergyAnomalyComp = true;
                        break;
                    }
                }
                if (hasExplicitSynergyAnomalyComp) break;
            }
        }
        
        if (hasStunSynergyAnomalyComp) {
            log('Stun-synergy anomaly composition', 15);
            score += 15;
        } else if (hasExplicitSynergyAnomalyComp) {
            log('Explicit synergy anomaly/support/support', 15);
            score += 15;
        }
        
        if (!hasAnomalyAttackSynergy && !hasStunSynergyAnomalyComp && !hasExplicitSynergyAnomalyComp) {
            if (nonAnomalyDPS.length > 0) {
                // Non-titled anomaly with non-anomaly DPS - normally invalid
                if (lenient) {
                    log('Non-titled anomaly with non-anomaly DPS (lenient)', -80);
                    score -= 80; // Heavy penalty but allow in desperate situations
                } else {
                    log('DISQUALIFIED: Non-titled anomaly with non-anomaly DPS');
                    if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'));
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
                    if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'));
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
                 if (debug) console.log('Team disqualified:', team.map(u => u.name).join('/'), 'Invalid solo titled anomaly comp');
                 return -1;
             }
        }
    }

    // Anomaly team composition (runs for any anomaly team, not just anomaly-shill bosses)
    if (anomalyUnits.length > 0) {
        const isNeutralBoss = boss.weaknesses.length === 0;
        
        // Check if ALL anomaly units are on-element (for full bonuses)
        // Neutral boss does NOT get element bonuses - must compete on tier/composition
        const allAnomalyOnElement = anomalyUnits.length > 0 && 
            !isNeutralBoss &&
            anomalyUnits.every(u => boss.weaknesses.includes(getElement(u)));
        
        // Titled anomaly is valid as long as their element isn't RESISTED
        // Off-element (not weak, not resisted) is viable but won't get weakness bonuses
        const hasValidTitledAnomaly = anomalyUnits.some(u => 
            isTitled(u) && !boss.resistances.includes(getElement(u))
        );
        // Double anomaly is valid if at least one anomaly is not resisted
        const hasValidDoubleAnomaly = anomalyUnits.length >= 2 &&
            anomalyUnits.some(u => !boss.resistances.includes(getElement(u)));
        // Stun-synergy anomaly and explicit-synergy anomaly compositions also qualify
        // as long as at least one anomaly is not resisted
        const hasValidSoloSynergyAnomaly = (hasStunSynergyAnomalyComp || hasExplicitSynergyAnomalyComp) &&
            anomalyUnits.some(u => !boss.resistances.includes(getElement(u)));
        const hasValidAnomalyComp = hasValidTitledAnomaly || hasValidDoubleAnomaly || hasValidSoloSynergyAnomaly;
        
        if (hasValidAnomalyComp) {
            // Base comp bonus for valid anomaly teams
            if (nonDpsUnits.length === 0) {
                score -= 50;
            } else {
                score += 5; // Reduced base comp bonus
            }
            
            if (anomalyUnits.length >= 2) {
                if (allAnomalyOnElement) {
                    // Full double anomaly bonus ONLY if both are on-element
                    score += 15; // Reduced from 25
                    
                    const anomalyElements = anomalyUnits.map(getElement);
                    const uniqueElements = new Set(anomalyElements);
                    if (uniqueElements.size >= 2) {
                        score += 20; // Reduced from 30
                    } else {
                        score -= 15; // Same element penalty
                    }
                } else {
                    // At least one anomaly is off-element
                    if (boss.weaknesses.length > 0) {
                        const anyAnomalyMatchesWeakness = anomalyUnits.some(u => 
                            boss.weaknesses.includes(getElement(u))
                        );
                        if (anyAnomalyMatchesWeakness) {
                            score -= 25; // Some match, some don't - moderate penalty for off-element partner
                        }
                        // If none match weakness: no bonus, no penalty (off-element but not resisted)
                    }
                }
            } else if (anomalyUnits.length === 1 && isTitled(anomalyUnits[0])) {
                // Solo titled anomaly - bonus only if on-element
                const soloElement = getElement(anomalyUnits[0]);
                if (boss.weaknesses.includes(soloElement)) {
                    score += 30; // Bonus for on-element focused composition
                }
                // Off-element but not resisted: valid, no bonus, no penalty
            }
            
            const nonAnomalyDPSInComp = dpsUnits.filter(u => !u.tags.includes("anomaly"));
            if (nonAnomalyDPSInComp.length > 0) {
                score -= 40;
            }
            
            // Anomaly teams prefer support/defense over stun
            // EXCEPTION 1: Stun-synergy anomaly units (like Aria) WANT a stunner
            // EXCEPTION 2: Monoshock compositions (attacker with anomaly synergy + same-element anomaly)
            //              can work with OR without a stunner - it's a hybrid team, not pure anomaly
            const hasStunSynergyAnomalyUnit = anomalyUnits.some(hasStunSynergy);
            
            // Check for Monoshock composition (attacker with anomaly synergy + same-element anomaly + same-element third)
            // ALL THREE team members must share the same element (e.g., Grace/Harumasa/Rina all electric)
            const hasMonoshockComp = attackers.some(a => {
                if (!a.synergy?.tags?.includes("anomaly")) return false;
                const attackerElement = getElement(a);
                const hasMatchingAnomaly = anomalyUnits.some(an => getElement(an) === attackerElement);
                if (!hasMatchingAnomaly) return false;
                // Check that the third team member is also the same element
                const thirdUnit = team.find(u => !isAttacker(u) && !isAnomaly(u));
                return thirdUnit && getElement(thirdUnit) === attackerElement;
            });
            
            if (stunUnits.length > 0 && !hasStunSynergyAnomalyUnit && !hasMonoshockComp) {
                // Regular anomaly team with stunner - suboptimal
                if (supportUnits.length === 0 && defenseUnits.length === 0) {
                    score -= 40;
                } else {
                    score -= 20;
                }
            }
            // If hasStunSynergyAnomalyUnit && stunUnits.length > 0: no penalty (intended composition)
            // If hasMonoshockComp && stunUnits.length > 0: no penalty (hybrid team can use stunner)
            
            // Support/defense bonuses - given for valid anomaly comps (not just fully on-element)
            // This ensures anomaly teams on neutral boss still get support bonus
            if (supportUnits.length >= 1) {
                score += 15;
            }
            if (defenseUnits.length >= 1) {
                score += 10;
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
    if (attackers.length > 0) {
        // Check for Monoshock composition (all three team members must share the same element)
        const hasAnomalyAttackComp = attackers.some(a => {
            if (!a.synergy?.tags?.includes("anomaly")) return false;
            const attackerElement = getElement(a);
            const hasMatchingAnomaly = anomalyUnits.some(an => getElement(an) === attackerElement);
            if (!hasMatchingAnomaly) return false;
            // Check that the third team member is also the same element
            const thirdUnit = team.find(u => !isAttacker(u) && !isAnomaly(u));
            return thirdUnit && getElement(thirdUnit) === attackerElement;
        });
        
        // Check for Stunless composition (e.g. Ye Shunguong)
        const hasStunlessAttacker = attackers.some(a => a.synergy?.tags?.includes("stunless"));

        if (hasAnomalyAttackComp && anomalyUnits.length > 0) {
            // Monoshock: attacker + anomaly = valid hybrid
            // Can work WITH a stunner (Stun/Anomaly/Attack) or WITHOUT (Anomaly/Attack/Support)
            log('Anomaly-attack composition (monoshock)', 10);
            score += 10;
            
            // If monoshock has a stunner (Stun/Anomaly/Attack), the anomaly acts as "support"
            // for the attacker by providing shock buildup. Give bonus to partially compensate
            // for missing traditional support bonuses - but not fully, since supports like Rina
            // with element synergy contribute more to the anomaly/attack hybridization
            if (stunUnits.length >= 1) {
                log('Monoshock with stunner - anomaly as pseudo-support', 55);
                score += 55;
            }
        } else if (stunUnits.length >= 1) {
            if(hasStunlessAttacker && boss.shill !== "stun") {
                log('Stunless attack unit present - stunner not required', -10);
                score -= 10;
            } else {
                log('Attack team with stunner', 25);
                score += 25; // Boosted from 15 to match other archetypes
           }
        } else if (hasStunlessAttacker && boss.shill !== "stun") {
            log('Stunless attack unit present - stunner not required', 20);
            score += 20; // Boosted from 10 to match other archetypes
            
            // Ideal stunless composition: stunless attacker + double support (no stunner)
            // This is YSG's intended playstyle - she doesn't benefit from stunners
            const supportDefenseCount = supportUnits.length + defenseUnits.length;
            if (supportDefenseCount >= 2) {
                log('Ideal stunless composition - double support', 40);
                score += 40;
            }
        } else {
            log('Attack team without stunner', -60);
            score -= 60; // Near-disqualifying: normal attack teams need stunner
        }
        
        // Double-stun composition for attackers who synergize with stun (e.g., Hugo)
        // These attackers NEED two stunners - one stunner is suboptimal for them
        // The bonus must compensate for:
        //   - Missing support/defense bonus (+20)
        //   - Missing support contribution bonuses (specialist +35, or generalist +8-10)
        //   - The actual benefit of having double-stun synergy
        for (const unit of attackers) {
            if (hasStunSynergy(unit)) {
                if (stunUnits.length === 2) {
                    score += 70; // Fully compensates for missing support + provides double-stun benefit
                    if (debug) console.log(`    ${unit.name}: +70 (double-stun composition)`);
                } else if (stunUnits.length === 1) {
                    score -= 30; // Single stunner is suboptimal for stun-synergy attackers
                    if (debug) console.log(`    ${unit.name}: -30 (needs double-stun, only has one)`);
                }
            }
        }
        
        if (supportUnits.length >= 1 || defenseUnits.length >= 1) {
            score += 20; // Boosted from 10 to match other archetypes
        }
        if (attackers.length > 1) {
             const hasSubDPS = attackers.some(u => u.synergy?.tags?.includes("subdps"));
             if (!hasSubDPS) {
                 score -= 50; // Double attacker rarely makes sense UNLESS one is SubDPS
             }
        }
    }
    
    // Rupture teams (runs for any rupture team, not just rupture-shill bosses)
    if (ruptureUnits.length > 0) {
        // Check if rupture DPS is A-rank (requires stunner unless boss shills rupture)
        const hasARankRupture = ruptureUnits.some(isARank);
        const hasSRankRupture = ruptureUnits.some(isSRank);
        
        if (hasARankRupture && !hasSRankRupture) {
            // A-rank rupture NEEDS a stunner (unless boss shills rupture)
            if (stunUnits.length === 0) {
                if (boss.shill === "rupture") {
                    score -= 40; // Penalty but allowed on rupture-shill
                } else {
                    return -1; // Disqualify on non-rupture-shill
                }
            }
        }
        
        // Two valid compositions:
        // 1. stun/rupture/[support|defense] - traditional composition (with bonus)
        // 2. rupture/2x[support|defense] - double support composition (S-rank only)
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
        for (const unit of stunUnits) {
            const hasRuptureSynergy = unit.synergy?.tags?.includes("rupture");
            if (!hasRuptureSynergy) {
                score -= 20; // Non-synergy stun is always suboptimal for rupture
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
            
            // Titled on-element DPS can partially compete with shill mismatch
            // They're powerful enough to overcome not matching the boss shill
            if (isTitled(unit) && boss.shill && DPS_ROLES.includes(boss.shill) && !unit.tags.includes(boss.shill)) {
                score += 30; // Helps titled on-element compete with shill-matching teams
            }
        } else {
            // Neutral off-element DPS - moderate penalty (not as harsh as resistance)
            // Titled units partially overcome element mismatch due to raw power
            // But if boss has no weaknesses (element-neutral), no penalty
            if (boss.weaknesses.length > 0) {
                const basePenalty = 20; // Reduced from 30
                const penalty = isTitled(unit) ? basePenalty / 2 : basePenalty;
                score -= lenient ? Math.floor(penalty / 3) : penalty;
            }
        }
    }
    
    if (dpsUnits.length > 0 && !dpsMatchesWeakness && boss.weaknesses.length > 0) {
        // No DPS matches weakness - penalty (but not as severe as resistance)
        // Titled DPS can partially overcome this with raw power
        const hasTitledDPS = dpsUnits.some(isTitled);
        const basePenalty = 50; // Reduced from 100
        const penalty = hasTitledDPS ? basePenalty / 2 : basePenalty;
        score -= lenient ? Math.floor(penalty / 2) : penalty;
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
    
    // Support Contribution Scoring (dead weight approach)
    // Philosophy: Mismatched supports contribute 0 (dead weight), not negative.
    // A support that doesn't help is "absence of positive", not a penalty.
    //
    // Uses existing synergy.avoid for archetype compatibility:
    // - If team archetype is in synergy.avoid → dead weight (0 contribution)
    // - Specialists get +35 when matched, +25 for A-rank
    // - T0 non-specialist on attack team gets +35 (de-facto specialist since attack has none)
    // - Other generalists get +8 (small positive contribution)
    
    const teamDPSTypes = dpsUnits.map(getDPSType).filter(t => t !== null);
    const teamArchetype = teamDPSTypes[0] || null; // Primary DPS defines team archetype
    
    if (debug) console.log(`\n  SUPPORT CONTRIBUTION SCORING (archetype: ${teamArchetype || 'none'}):`);
    
    for (const unit of [...supportUnits, ...defenseUnits]) {
        // Check archetype compatibility via existing synergy.avoid
        const avoidTags = unit.synergy?.avoid || [];
        const avoidsTeamArchetype = teamArchetype && avoidTags.includes(teamArchetype);
        
        if (avoidsTeamArchetype) {
            // Dead weight - no contribution, no penalty
            if (debug) console.log(`    ${unit.name}: 0 (dead weight - avoids ${teamArchetype})`);
            continue; // Skip to next unit - no further contribution
        }
        
        // Support is compatible with team - determine bonus level
        if (isSpecialist(unit) && getSpecialistType(unit) === teamArchetype) {
            // Matching specialist (Yuzuha on anomaly, Lucia on rupture)
            const bonus = isARank(unit) ? 25 : 35;
            score += bonus;
            if (debug) console.log(`    ${unit.name}: +${bonus} (matching specialist)`);
        } else if (unit.tier <= 0 && teamArchetype === 'attack' && !isSpecialist(unit)) {
            // T0 non-specialist on attack team = de-facto specialist
            // Attack has no true specialist, so T0 generalist fills that role
            score += 35;
            if (debug) console.log(`    ${unit.name}: +35 (T0 generalist on attack = de-facto specialist)`);
        } else if (shillIntensity > 1 && boss.favored?.includes(unit.name) && 
                   unit.synergy?.tags?.includes(teamArchetype)) {
            // Boss-favored support on high shill intensity boss, synergizing with team archetype
            // Acts as a pseudo-specialist for this specific fight
            score += 25;
            if (debug) console.log(`    ${unit.name}: +25 (favored pseudo-specialist, intensity ${shillIntensity})`);
        } else {
            // Regular generalist contribution
            score += 8;
            if (debug) console.log(`    ${unit.name}: +8 (generalist contribution)`);
        }
    }
    
    // Synergy scoring
    if (debug) console.log(`\n  SYNERGY SCORING:`);
    for (const unit of team) {
        const teammates = team.filter(t => t.name !== unit.name);
        const synergyScore = calculateSynergyScore(unit, teammates, boss, lenient, debug);
        score += synergyScore;
        if (debug) console.log(`    ${unit.name} synergy total: ${synergyScore >= 0 ? '+' : ''}${synergyScore}`);
    }
    
    // DPS mixing penalty
    score += calculateDPSMixingPenalty(team);
    
    // Double stun penalty
    // Two stunners without synergy is wasteful - you'd rather have support/defense
    if (stunUnits.length >= 2) {
        let doubleStunJustified = false;
        
        // Check for specific stun synergy:
        // 1. Explicit unit synergy (one stunner lists the other in synergy.units)
        // 2. Explicit tag synergy for 'stun' (one stunner lists 'stun' in synergy.tags)
        // 3. DPS unit explicitly requests 'stun' synergy (e.g., Hugo, Aria)
        
        for (let i = 0; i < stunUnits.length; i++) {
            for (let j = i + 1; j < stunUnits.length; j++) {
                const s1 = stunUnits[i];
                const s2 = stunUnits[j];
                
                // Check named synergy
                if (s1.synergy?.units?.includes(s2.name) || s2.synergy?.units?.includes(s1.name)) {
                    doubleStunJustified = true;
                    break;
                }
                
                // Check specific 'stun' tag synergy
                // We do NOT count elemental tags here because sharing an element doesn't justify double stun
                if (hasStunSynergy(s1) || hasStunSynergy(s2)) {
                     doubleStunJustified = true;
                     break;
                }
            }
            if (doubleStunJustified) break;
            
            for (const dps of dpsUnits) {
                if (hasStunSynergy(dps)) {
                    doubleStunJustified = true;
                    break;
                }
            }
        }
        
        if (!doubleStunJustified) {
            score -= 150; // Heavy penalty - double stun without synergy is inefficient and should be disqualified
        }
    }
    
    // Defensive assist requirement
    const defensiveAssistCount = team.filter(hasDefensiveAssist).length;
    if (defensiveAssistCount < boss.assists) {
        return -1;
    }
    
    // Only reward extra defensive assists when boss actually demands them
    if (boss.assists >= 2) {
        score += (defensiveAssistCount - boss.assists) * 3;
    }
    
    if (debug) {
        console.log(`\n  FINAL SCORE: ${score}`);
        console.log(`${'='.repeat(60)}\n`);
    }
    
    return score;
}

