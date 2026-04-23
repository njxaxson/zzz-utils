@echo off
setlocal

set OUT=scoring-validation.txt

echo Running scoring validation suite...
echo.> %OUT%

echo ============================================================>> %OUT%
echo   SCORING VALIDATION SUITE>> %OUT%
echo   Generated: %date% %time%>> %OUT%
echo ============================================================>> %OUT%
echo.>> %OUT%

REM ============================================================
REM  1. TOP 25 OVERALL (all bosses)
REM ============================================================
echo [1/23] Top 25 overall...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 1: Top 25 Overall (all bosses)>> %OUT%
echo # Expect: Conventional meta teams dominate. No SAnby/Yixuan>> %OUT%
echo #         or other incoherent comps in top 25.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -25 >> %OUT% 2>&1

REM ============================================================
REM  2. SAnby/Yixuan anti-synergy check
REM ============================================================
echo [2/23] SAnby/Yixuan anti-synergy...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 2: SAnby/Yixuan anti-synergy>> %OUT%
echo # Expect: SAnby/Yixuan/Rina and SAnby/Yixuan/Nicole should>> %OUT%
echo #         score very low (under 100). SAnby is an on-field>> %OUT%
echo #         DPS who competes with Yixuan for field time.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "SAnby/Yixuan/Rina,SAnby/Yixuan/Nicole" -b "Butcher,Corruption,Marionettes" >> %OUT% 2>&1

REM ============================================================
REM  3. SAnby proper teams (electric bosses)
REM ============================================================
echo [3/23] SAnby proper teams...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 3: SAnby proper teams on electric-weak bosses>> %OUT%
echo # Expect: Trigger/Orphie/SAnby ~360-405. Proper electric>> %OUT%
echo #         teams should be competitive on electric-weak bosses.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Trigger/Orphie/SAnby,Ju Fufu/Trigger/SAnby,Ju Fufu/Orphie/SAnby,Trigger/Cissia/SAnby,Dialyn/Cissia/SAnby" -b "Corruption,Slugger,Defiler" >> %OUT% 2>&1

REM ============================================================
REM  4. YSG + support ordering on Nightmare
REM ============================================================
echo [4/23] YSG support ordering (Nightmare)...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 4: YSG + support ordering on Nightmare>> %OUT%
echo # Expect: Dialyn/YSG/Sunna at top. YSG/Zhao/Sunna and>> %OUT%
echo #         YSG/Astra/Sunna should beat JF/YSG/Sunna. Stunners>> %OUT%
echo #         discounted since YSG is stunless.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Ye Shunguong/Sunna,Dialyn/Ye Shunguong/Zhao,Dialyn/Ye Shunguong/Astra,Ju Fufu/Ye Shunguong/Sunna,Ye Shunguong/Zhao/Sunna,Ye Shunguong/Astra/Sunna,Trigger/Ye Shunguong/Sunna,Qingyi/Ye Shunguong/Sunna,Ju Fufu/Ye Shunguong/Zhao,Ye Shunguong/Zhao/Astra,Trigger/Ye Shunguong/Zhao" -b "Nightmare" >> %OUT% 2>&1

REM ============================================================
REM  5. Lucia on YSG teams (should be low)
REM ============================================================
echo [5/23] Lucia on YSG teams...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 5: Lucia on YSG teams>> %OUT%
echo # Expect: Very low on Nightmare (rupture-irrelevant). Lucia>> %OUT%
echo #         offers nothing to a physical DPS on attack bosses.>> %OUT%
echo #         Should be well below Sunna/Zhao/Astra variants.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Ye Shunguong/Lucia,Ju Fufu/Ye Shunguong/Lucia" -b "Nightmare,Sweeper" >> %OUT% 2>&1

REM ============================================================
REM  6. Hugo/Sunna totalize penalty
REM ============================================================
echo [6/23] Hugo/Sunna totalize penalty...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 6: Hugo + Sunna (no real stunner) vs Hugo + stunner>> %OUT%
echo # Expect: Dialyn/Hugo/Sunna ~200-270. Hugo needs a proper>> %OUT%
echo #         stunner; Sunna can't stun. With real stunner>> %OUT%
echo #         (Lighter/Lycaon), should be 350-440.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Hugo/Sunna,Dialyn/Lighter/Hugo,Dialyn/Lycaon/Hugo,Ju Fufu/Lighter/Hugo,Ju Fufu/Lycaon/Hugo,Dialyn/Trigger/Hugo,Dialyn/Ju Fufu/Hugo" -b "Thrall,Marionettes,Neutral" >> %OUT% 2>&1

REM ============================================================
REM  7. Evelyn stunner ordering (Dialyn > Lighter > JF)
REM ============================================================
echo [7/23] Evelyn stunner ordering...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 7: Evelyn stunner ordering>> %OUT%
echo # Expect: Dialyn > Lighter > JF for Evelyn teams.>> %OUT%
echo #         Lighter provides fire RES-down that synergizes>> %OUT%
echo #         with Evelyn's fire damage; JF is generic.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Evelyn/Astra,Lighter/Evelyn/Astra,Ju Fufu/Evelyn/Astra,Dialyn/Lighter/Evelyn,Ju Fufu/Lighter/Evelyn,Dialyn/Evelyn/Lucia,Lighter/Evelyn/Lucia,Ju Fufu/Evelyn/Lucia" -b "Neutral,Pompey" >> %OUT% 2>&1

REM ============================================================
REM  8. Nangong/Miyabi support ordering
REM ============================================================
echo [8/23] Nangong/Miyabi support ordering...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 8: Nangong/Miyabi support ordering>> %OUT%
echo # Expect: Yuzuha > Astra/Sunna > Nicole/Soukaku.>> %OUT%
echo #         Harumasa (3rd DPS) should be far below supports>> %OUT%
echo #         (~190-215 range vs 400+ for real supports).>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Nangong/Miyabi/Yuzuha,Nangong/Miyabi/Astra,Nangong/Miyabi/Sunna,Nangong/Miyabi/Nicole,Nangong/Miyabi/Soukaku,Nangong/Miyabi/Harumasa" -b "Butcher,Marionettes,Sacrifice" >> %OUT% 2>&1

REM ============================================================
REM  9. Nangong/Aria support ordering (anomaly bosses)
REM ============================================================
echo [9/23] Nangong/Aria support ordering...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 9: Nangong/Aria support ordering on anomaly bosses>> %OUT%
echo # Expect: Sunna > Yuzuha > Astra > Zhao > Nicole > Vivian.>> %OUT%
echo #         NOTE: Zhao's ether veils make him rank higher than>> %OUT%
echo #         expected on Vesper; ideally needs future boss mechanic>> %OUT%
echo #         modeling to capture ether-specific boss preferences.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Nangong/Aria/Sunna,Nangong/Aria/Zhao,Nangong/Aria/Yuzuha,Nangong/Aria/Astra,Nangong/Aria/Nicole,Nangong/Aria/Vivian" -b "Solo,Sweeper,Butcher" >> %OUT% 2>&1

REM ============================================================
REM  10. Disorder bonus (dual-anomaly teams)
REM ============================================================
echo [10/23] Disorder bonus (dual-anomaly teams)...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 10: Implicit disorder generation bonus>> %OUT%
echo # Expect: Nangong/Alice/Yuzuha ~300-350 on anomaly bosses.>> %OUT%
echo #         Alice/Vivian/Yuzuha should be viable (~200+),>> %OUT%
echo #         a cohesive dual-anomaly team with anomaly support.>> %OUT%
echo #         Nangong/Vivian/Yuzuha competitive on ether bosses.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Nangong/Alice/Yuzuha,Nangong/Vivian/Yuzuha,Alice/Vivian/Yuzuha,Nangong/Alice/Vivian,Nangong/Alice/Sunna,Nangong/Alice/Astra" -b "Fiend,Sweeper,Solo" >> %OUT% 2>&1

REM ============================================================
REM  11. Caesar deflation
REM ============================================================
echo [11/23] Caesar deflation...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 11: Caesar teams should score modestly>> %OUT%
echo # Expect: Best Caesar teams ~150-220. Caesar is a comfort>> %OUT%
echo #         pick with weak mechanical contribution, should not>> %OUT%
echo #         compete with real supports.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -i Caesar -b "Butcher,Neutral" -15 >> %OUT% 2>&1

REM ============================================================
REM  12. Pan vs Astra on rupture (Hunter)
REM ============================================================
echo [12/23] Pan vs Astra on rupture boss...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 12: Pan vs Astra for rupture teams on Hunter>> %OUT%
echo # Expect: Pan should beat Astra for Yixuan/Lucia on Hunter.>> %OUT%
echo #         Pan's rupture-specific utility (sheer buff) should>> %OUT%
echo #         outweigh Astra's quick-assists advantage.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Ju Fufu/Yixuan/Pan Yinhu,Ju Fufu/Yixuan/Astra,Yixuan/Pan Yinhu/Lucia,Yixuan/Astra/Lucia,Ju Fufu/Yidhari/Pan Yinhu,Ju Fufu/Yidhari/Astra" -b "Hunter" >> %OUT% 2>&1

REM ============================================================
REM  13. synergy.avoid enforcement (Pan + Dialyn)
REM ============================================================
echo [13/23] synergy.avoid enforcement...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 13: synergy.avoid enforcement (Pan + Dialyn)>> %OUT%
echo # Expect: 0 viable teams. Pan and Dialyn have synergy.avoid>> %OUT%
echo #         declared, so all teams containing both should be>> %OUT%
echo #         disqualified.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Pan Yinhu/Evelyn,Dialyn/Pan Yinhu/Banyue,Dialyn/Pan Yinhu/Yidhari" -b "Neutral" >> %OUT% 2>&1

REM ============================================================
REM  14. Banyue teams
REM ============================================================
echo [14/23] Banyue teams...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 14: Banyue team scores>> %OUT%
echo # Expect: JF/Banyue/Lucia ~320-385 on fire-weak bosses.>> %OUT%
echo #         Banyue is a solid fire DPS and should be competitive>> %OUT%
echo #         on appropriate bosses.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Banyue/Lucia,Ju Fufu/Banyue/Lucia,Banyue/Astra/Lucia,Banyue/Pan Yinhu/Lucia" -b "Neutral,Pompey,Hunter" >> %OUT% 2>&1

REM ============================================================
REM  15. Nangong/Yixuan/Sunna and cross-archetype mix
REM ============================================================
echo [15/23] Cross-archetype mix check...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 15: Cross-archetype mix teams>> %OUT%
echo # Expect: Nangong/Yixuan/Sunna ~220-260. Mixing anomaly>> %OUT%
echo #         enabler with rupture DPS is suboptimal but not>> %OUT%
echo #         terrible. Should be well below pure-archetype teams.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Nangong/Yixuan/Sunna,Dialyn/Hugo/Sunna" -b "Butcher,Marionettes,Neutral" >> %OUT% 2>&1

REM ============================================================
REM  16. Nangong teams on Fiend (full picture)
REM ============================================================
echo [16/23] Nangong teams on Fiend...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 16: All Nangong teams on Fiend (top 25)>> %OUT%
echo # Expect: Miyabi variants at top (~390+), Alice teams ~320->> %OUT%
echo #         350 (disorder bonus), Vivian lower. Aria teams>> %OUT%
echo #         competitive. Clear hierarchy of DPS quality.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -i Nangong -b "Fiend" -25 >> %OUT% 2>&1

REM ============================================================
REM  17. JF vs Astra on rupture teams
REM ============================================================
echo [17/23] JF vs Astra on rupture teams...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 17: JF vs Astra on Yixuan/Lucia teams>> %OUT%
echo # Expect: JF should beat Astra across most bosses. JF's>> %OUT%
echo #         stun windows + rupture tag synergy should outweigh>> %OUT%
echo #         Astra's ATK+CD buff package (ATK discounted for>> %OUT%
echo #         rupture).>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Ju Fufu/Yixuan/Lucia,Yixuan/Astra/Lucia,Yixuan/Pan Yinhu/Lucia,Dialyn/Yixuan/Lucia" -b "Butcher,Corruption,Hunter,Priest" >> %OUT% 2>&1

REM ============================================================
REM  18. Soukaku pseudo-anomaly activation check
REM ============================================================
echo [18/23] Soukaku activation check...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 18: Soukaku pseudo-anomaly activation>> %OUT%
echo # Expect: Lycaon/Yixuan/Soukaku should score low (~200 or>> %OUT%
echo #         below). Soukaku's anomaly pseudo-role should NOT>> %OUT%
echo #         activate without an anomaly teammate.>> %OUT%
echo #         Nangong/Miyabi/Soukaku should stay high (Miyabi>> %OUT%
echo #         activates Soukaku's anomaly role).>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Lycaon/Yixuan/Soukaku,Ye Shunguong/Zhao/Soukaku,Nangong/Miyabi/Soukaku" -b "Nightmare,Butcher,Neutral" >> %OUT% 2>&1

REM ============================================================
REM  19. Orphie/Rina resistance penalty
REM ============================================================
echo [19/23] Orphie/Rina resistance penalty...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 19: Orphie on fire-resistant boss (Slugger)>> %OUT%
echo # Expect: Trigger/Cissia/Seed should beat Trigger/Orphie/>> %OUT%
echo #         SAnby on Slugger. Orphie's fire damage is resisted.>> %OUT%
echo #         Rina penalized on electric-resistant bosses.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Trigger/Orphie/SAnby,Trigger/Cissia/Seed,Trigger/Cissia/SAnby,Ju Fufu/Orphie/SAnby" -b "Slugger" >> %OUT% 2>&1

REM ============================================================
REM  20. Burnice on fire-resistant bosses
REM ============================================================
echo [20/23] Burnice on fire-resistant bosses...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 20: Burnice on fire-resistant bosses>> %OUT%
echo # Expect: Burnice should be DISQUALIFIED on fire-resistant>> %OUT%
echo #         bosses (subdps does not bypass resistance check).>> %OUT%
echo #         All Burnice teams on Solo/Sweeper should score -1.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Aria/Burnice/Sunna,Nangong/Aria/Zhao,Nangong/Aria/Sunna,Aria/Vivian/Sunna,Nangong/Burnice/Vivian" -b "Solo,Sweeper" >> %OUT% 2>&1

REM ============================================================
REM  21. Banyue on Hunter (should rank higher)
REM ============================================================
echo [21/23] Banyue on Hunter...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 21: Banyue ranking on Hunter>> %OUT%
echo # Expect: Banyue teams should rank well on Hunter (fire-weak,>> %OUT%
echo #         rupture-shill). Self-provided interrupt-resistance>> %OUT%
echo #         should not cause a cohesion penalty.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -i Banyue -b "Hunter" -15 >> %OUT% 2>&1

REM ============================================================
REM  22. YSG + Dialyn synergy
REM ============================================================
echo [22/23] YSG + Dialyn synergy...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 22: YSG-Dialyn specific synergy>> %OUT%
echo # Expect: Dialyn/YSG teams should benefit from the specific>> %OUT%
echo #         unit synergy (ultimates -> enhanced mode). Dialyn>> %OUT%
echo #         should rank well ahead of other stunners for YSG.>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Dialyn/Ye Shunguong/Sunna,Dialyn/Ye Shunguong/Zhao,Ju Fufu/Ye Shunguong/Sunna,Ye Shunguong/Zhao/Sunna,Ye Shunguong/Astra/Sunna" -b "Thrall,Defiler,Neutral" >> %OUT% 2>&1

REM ============================================================
REM  23. Miyabi/Vivian/Yuzuha ranking (should not be #2)
REM ============================================================
echo [23/23] Miyabi/Vivian/Yuzuha ranking...
echo.>> %OUT%
echo ############################################################>> %OUT%
echo # TEST 23: Miyabi/Vivian/Yuzuha relative ranking>> %OUT%
echo # Expect: MVY is cohesive and strong, but should rank below>> %OUT%
echo #         Nangong variants. Nangong is strictly better than>> %OUT%
echo #         Vivian (provides anomaly buffs + stun + disorders>> %OUT%
echo #         on top of same synergy pattern).>> %OUT%
echo ############################################################>> %OUT%
echo.>> %OUT%
node matchups -t "Nangong/Miyabi/Yuzuha,Miyabi/Vivian/Yuzuha,Nangong/Aria/Sunna,Nangong/Miyabi/Sunna,Nangong/Miyabi/Astra,Aria/Vivian/Sunna,Nangong/Vivian/Yuzuha" -b "Sweeper,Solo,Butcher" >> %OUT% 2>&1

echo.>> %OUT%
echo ============================================================>> %OUT%
echo   END OF VALIDATION SUITE>> %OUT%
echo ============================================================>> %OUT%

echo.
echo Validation complete. Results written to %OUT%
echo.
