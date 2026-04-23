/**
 * Raw team score thresholds from CLI (--score / --range).
 * Used by matchup-style tools that enumerate teams before boss-specific ranking.
 */

/**
 * @param {number} score
 * @param {{ minScore?: number | null, scoreRange?: { min: number, max: number } | null }} opts
 * @returns {boolean}
 */
export function rawScorePassesFilter(score, opts) {
    const { minScore, scoreRange } = opts;
    if (minScore != null && Number.isFinite(minScore) && score < minScore) {
        return false;
    }
    if (scoreRange != null && Number.isFinite(scoreRange.min) && Number.isFinite(scoreRange.max)) {
        if (score < scoreRange.min || score > scoreRange.max) {
            return false;
        }
    }
    return true;
}
