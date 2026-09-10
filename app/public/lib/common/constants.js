/**
 * Shared game constants for Zenless Zone Zero.
 * Single source of truth for elements, roles, and other domain enumerations.
 */

export const ELEMENTS = ['fire', 'ice', 'electric', 'physical', 'ether', 'wind', 'lumen'];
export const DPS_ROLES = ['attack', 'anomaly', 'rupture', 'armorer'];

// CLASSES vs ROLES — not the same thing, and stat defaults depend on the difference.
//
// A unit's CLASS is the one thing it IS. Every unit has exactly one, read from its tags, and it
// never changes. Only a class carries base-stat defaults, because a stat line is a property of
// the unit, not of the team it is on.
//
// A unit's ROLE is what it is DOING on this team. Roles are a superset of classes: they include
// every class plus `subdps`, and they include pseudo-roles that activate conditionally. Being
// played as a sub-DPS changes how much damage you deal; it does not change your ATK stat.
//
// So BASIC_DAMAGE_BY_ROLE has a `subdps` entry and STAT_BASELINE_BY_CLASS deliberately does not.
export const CLASSES = ['attack', 'anomaly', 'rupture', 'armorer', 'stun', 'support', 'defense'];

// The base stats a unit can declare in `mechanics.stats`, and the same set the pull engine
// skips when listing a codependent unit's unmet needs — a teammate can supply a BUFF to one of
// these, but never the stat itself, so an unmet `scaling.ap` is not a missing partner.
// One list so the two cannot drift. `sheer` is deliberately absent: it is a damage type, not a
// base stat, even though `scaling.sheer` exists.
export const STAT_KEYS = ['atk', 'def', 'hp', 'cr', 'cd', 'pen', 'am', 'ap'];
