const DPS_TAGS = ['attack', 'anomaly', 'rupture', 'armorer'];

// Derived against the CALIBRATED score (see lib/calibration.js / generate-calibration.mjs)
// These six cutoffs were chosen against the full released corpus (19 real bosses,
// ~55.5k viable (boss, team) pairs) and checked boss-by-boss and archetype-by-archetype before
// being fixed — see documentation/engine/calibration.md.
const STRENGTH_TIERS = [
    { min: 353.3, label: 'Excellent', cssClass: 'strength-excellent', color: '#00e676' },
    { min: 318.2, label: 'Great',     cssClass: 'strength-great',     color: '#64dd17' },
    { min: 291.3, label: 'Good',      cssClass: 'strength-good',      color: '#00d4aa' },
    { min: 172.7, label: 'OK',        cssClass: 'strength-ok',        color: '#ffca28' },
    { min: 134.4, label: 'Tough',     cssClass: 'strength-tough',     color: '#ff9800' },
    { min: 123.2, label: 'Risky',     cssClass: 'strength-risky',     color: '#ff5252' },
    { min: -Infinity, label: 'Bad',   cssClass: 'strength-bad',       color: '#b71c1c' },
];

// A would-be top-tier team without a real S-rank carry is demoted one tier — STRENGTH_TIERS[0]
// (Excellent) down to STRENGTH_TIERS[1], whatever that tier is currently named. Kept as an index
// reference rather than a hardcoded label so this demotion stays "one step down" if the tier
// list is ever re-derived again with a different number of tiers.
const DEMOTED_TIER = STRENGTH_TIERS[1];

function hasARankDps(team) {
    return team.some(u => u.rank === 'A' && u.tags.some(t => DPS_TAGS.includes(t)));
}

export function getStrengthRating(score, team) {
    for (const tier of STRENGTH_TIERS) {
        if (score >= tier.min) {
            if (tier === STRENGTH_TIERS[0] && team && hasARankDps(team)) {
                return DEMOTED_TIER;
            }
            return tier;
        }
    }
    return STRENGTH_TIERS[STRENGTH_TIERS.length - 1];
}

export function createStrengthLabelHtml(score, team, options = {}) {
    const rating = getStrengthRating(score, team);
    const suffix = options.lenient ? '*' : '';
    return `<span class="strength-label ${rating.cssClass}" title="${Math.round(score)}">${rating.label}${suffix}</span>`;
}
