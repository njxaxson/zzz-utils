/**
 * Unified CLI argument parser for ZZZ diagnostic scripts.
 * Provides consistent --help, flag parsing, and +Unit/-Unit overrides.
 */

const STANDARD_OPTIONS = {
    depth: {
        long: '--depth', short: null, type: 'number', default: 5,
        description: 'Number of results to display (shorthand: -N)'
    },
    onlyMine: {
        long: '--only-mine', short: '-m', type: 'boolean', default: false,
        description: 'Use personal roster from roster.json'
    },
    preview: {
        long: '--preview', short: '-p', type: 'boolean', default: false,
        description: 'Include preview/unavailable units'
    },
    debug: {
        long: '--debug', short: '-d', type: 'boolean', default: false,
        description: 'Enable debug output'
    },
    units: {
        long: '--units', short: '-u', type: 'csv', default: null,
        description: 'Comma-separated unit whitelist'
    },
    exclude: {
        long: '--exclude', short: '-x', type: 'csv', default: null,
        description: 'Comma-separated units to exclude'
    },
    include: {
        long: '--include', short: '-i', type: 'csv', default: null,
        description: 'Teams must include at least one of these units'
    },
    flex: {
        long: '--flex', short: '-f', type: 'csv', default: null,
        description: 'Comma-separated flex/universal unit names'
    },
    bosses: {
        long: '--bosses', short: '-b', type: 'string', default: null,
        description: 'Boss name filter (comma-separated for multiple)'
    },
    query: {
        long: '--query', short: '-q', type: 'string', default: null,
        description: 'Share URL query string for roster/bosses'
    },
    teams: {
        long: '--teams', short: '-t', type: 'string', default: null,
        description: 'Explicit teams (slash-separated units, comma-separated teams)'
    },
    flat: {
        long: '--flat', short: null, type: 'boolean', default: false,
        description: 'Output teams in condensed format for use as -t value'
    }
};

function parseValue(str, type) {
    switch (type) {
        case 'csv': return str.split(',').map(s => s.trim());
        case 'number': return parseInt(str, 10);
        default: return str;
    }
}

function printHelp(name, description, activeOptions, defaults, positionalDesc, examples) {
    console.log(`\n${name}`);
    console.log(`  ${description}\n`);

    const positionalPart = positionalDesc ? ` ${positionalDesc}` : '';
    console.log(`Usage: node ${name} [options]${positionalPart}\n`);

    console.log('Options:');
    for (const [optName, opt] of Object.entries(activeOptions)) {
        const short = opt.short || '  ';
        const effectiveDefault = defaults[optName] !== undefined ? defaults[optName] : opt.default;
        let line = `  ${short.padEnd(4)} ${opt.long.padEnd(16)} ${opt.description}`;
        if (effectiveDefault !== null && effectiveDefault !== false) {
            line += ` (default: ${effectiveDefault})`;
        }
        console.log(line);
    }

    if (activeOptions.depth) {
        console.log(`        -N               Shorthand for --depth N`);
    }
    console.log(`       +Unit             Add unit to roster override`);
    console.log(`       -Unit             Remove unit from roster override`);
    console.log(`  -?   -h  --help        Show this help message`);

    if (examples) {
        console.log(`\nExamples:\n${examples}`);
    }
}

/**
 * Parse command-line arguments.
 *
 * @param {Object} config
 * @param {string} config.name - Script filename for help display
 * @param {string} config.description - One-line description
 * @param {string[]} [config.options] - Standard option names to enable (default: all)
 * @param {Object} [config.defaults] - Override default values for options
 * @param {string} [config.positional] - Description of positional args (for help)
 * @param {string} [config.examples] - Usage examples (for help)
 * @returns {Object} Parsed options with additions[], removals[], positional[]
 */
export function parseArgs(config) {
    const {
        name,
        description,
        options: optionNames = Object.keys(STANDARD_OPTIONS),
        defaults = {},
        positional: positionalDesc = null,
        examples = null
    } = config;

    const args = process.argv.slice(2);

    const activeOptions = {};
    for (const optName of optionNames) {
        const opt = STANDARD_OPTIONS[optName];
        if (opt) activeOptions[optName] = opt;
    }

    if (args.includes('--help') || args.includes('-?') || args.includes('-h')) {
        printHelp(name, description, activeOptions, defaults, positionalDesc, examples);
        process.exit(0);
    }

    const result = { additions: [], removals: [], positional: [] };
    for (const [optName, opt] of Object.entries(activeOptions)) {
        result[optName] = defaults[optName] !== undefined ? defaults[optName] : opt.default;
    }

    const longToName = {};
    const shortToName = {};
    for (const [name, opt] of Object.entries(activeOptions)) {
        longToName[opt.long] = name;
        if (opt.short) shortToName[opt.short] = name;
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (longToName[arg] !== undefined) {
            const optName = longToName[arg];
            const opt = activeOptions[optName];
            if (opt.type === 'boolean') {
                result[optName] = true;
            } else if (args[i + 1] !== undefined) {
                result[optName] = parseValue(args[++i], opt.type);
            }
            continue;
        }

        if (shortToName[arg] !== undefined) {
            const optName = shortToName[arg];
            const opt = activeOptions[optName];
            if (opt.type === 'boolean') {
                result[optName] = true;
            } else if (args[i + 1] !== undefined) {
                result[optName] = parseValue(args[++i], opt.type);
            }
            continue;
        }

        if (activeOptions.depth && /^-(\d+)$/.test(arg)) {
            result.depth = parseInt(arg.slice(1), 10);
            continue;
        }

        if (arg.startsWith('+')) {
            result.additions.push(arg.slice(1));
            continue;
        }

        if (arg.startsWith('-') && !arg.startsWith('--') && arg.length > 2 && !/^-\d+$/.test(arg)) {
            result.removals.push(arg.slice(1));
            continue;
        }

        result.positional.push(arg);
    }

    return result;
}
