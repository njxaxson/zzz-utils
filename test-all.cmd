@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Runs all five suites, then regenerates and re-certifies calibration.
rem Stops at the first non-zero exit code. Calibration is only touched if every suite exits 0.
rem A zero exit from the KNOWN_RED suites means "no NEW failures", not "nothing red" - see CLAUDE.md.

for %%S in (test-mechanics test-rankings test-recommendations test-bucketing cohesion-fixture) do (
    echo.
    echo ==== node %%S.mjs ====
    node %%S.mjs
    if errorlevel 1 (
        echo.
        echo FAILED: %%S.mjs exited with code !errorlevel!. Calibration NOT regenerated.
        exit /b 1
    )
)
echo.
echo ==== node generate-calibration.mjs --check ====
node generate-calibration.mjs --check
if errorlevel 1 (
    echo.
    echo FAILED: generate-calibration.mjs --check exited with code %errorlevel%.
    exit /b 1
)

echo.
echo ==== node generate-calibration.mjs --check --preview ====
node generate-calibration.mjs --check --preview
if errorlevel 1 (
    echo.
    echo FAILED: generate-calibration.mjs --check --preview exited with code %errorlevel%.
    exit /b 1
)

echo.
echo ==== node calibration-check.mjs ====
node calibration-check.mjs
if errorlevel 1 (
    echo.
    echo FAILED: calibration-check.mjs exited with code %errorlevel%.
    exit /b 1
)

echo.
echo No suite exited non-zero and calibration was regenerated and certified.
echo Check KNOWN_RED in the suites before calling this clean.
exit /b 0
