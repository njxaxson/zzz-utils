const DPS_TAGS = ['attack', 'anomaly', 'rupture', 'armorer'];

const STRENGTH_TIERS = [
    { min: 375, label: 'Excellent', cssClass: 'strength-excellent', color: '#00e676' },
    { min: 300, label: 'Good',     cssClass: 'strength-good',     color: '#00d4aa' },
    { min: 195, label: 'Fair',     cssClass: 'strength-fair',   color: '#ffca28' },
    { min: 145, label: 'Tough',    cssClass: 'strength-tough',  color: '#ff9800' },
    { min: -Infinity, label: 'Risky', cssClass: 'strength-risky', color: '#ff5252' },
];

const GOOD_TIER = STRENGTH_TIERS[1];

function hasARankDps(team) {
    return team.some(u => u.rank === 'A' && u.tags.some(t => DPS_TAGS.includes(t)));
}

export function getStrengthRating(score, team) {
    for (const tier of STRENGTH_TIERS) {
        if (score >= tier.min) {
            if (tier === STRENGTH_TIERS[0] && team && hasARankDps(team)) {
                return GOOD_TIER;
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
