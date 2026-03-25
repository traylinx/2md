#!/usr/bin/env node

/**
 * html2md — Interactive CLI
 *
 * Menu-driven terminal interface for HTML-to-Markdown conversion.
 * Uses Node.js readline (zero extra dependencies).
 */

const readline = require('readline');
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_PATH = path.join(__dirname, 'html2md');
const ROOT_DIR = path.resolve(__dirname, '..');

// ── ANSI Styles ──────────────────────────────────────────────

const S = {
  RESET:      '\x1b[0m',
  BOLD:       '\x1b[1m',
  DIM:        '\x1b[90m',
  CYAN:       '\x1b[96m',
  GREEN:      '\x1b[92m',
  YELLOW:     '\x1b[93m',
  RED:        '\x1b[91m',
  BLUE:       '\x1b[94m',
  MAGENTA:    '\x1b[95m',
  WHITE:      '\x1b[97m',
  BG_DARK:    '\x1b[48;5;236m',
};

const SEPARATOR = '━'.repeat(50);

// ── Helpers ──────────────────────────────────────────────────

function logo() {
  return [
    '',
    `  ${S.BOLD}${S.CYAN}html2md${S.RESET}  ${S.DIM}— Interactive Mode${S.RESET}`,
    `  ${S.DIM}${SEPARATOR}${S.RESET}`,
    '',
  ].join('\n');
}

function menuItem(num, icon, label, desc) {
  const numStr = num === 0
    ? `${S.DIM}${num}${S.RESET}`
    : `${S.CYAN}${num}${S.RESET}`;
  return `  ${numStr}${S.DIM}.${S.RESET} ${icon}  ${S.BOLD}${label}${S.RESET}  ${S.DIM}${desc}${S.RESET}`;
}

function printSuccess(msg) {
  console.log(`\n  ${S.GREEN}✅ ${msg}${S.RESET}`);
}

function printError(msg) {
  console.log(`\n  ${S.RED}❌ ${msg}${S.RESET}`);
}

function printInfo(msg) {
  console.log(`  ${S.BLUE}ℹ${S.RESET}  ${msg}`);
}

function printSection(title) {
  console.log(`\n  ${S.BOLD}${S.YELLOW}${title}${S.RESET}`);
  console.log(`  ${S.DIM}${'─'.repeat(40)}${S.RESET}`);
}

// ── Readline Interface ───────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt, defaultValue) {
  const hint = defaultValue != null ? ` ${S.DIM}(${defaultValue})${S.RESET}` : '';
  return new Promise((resolve) => {
    rl.question(`  ${S.CYAN}›${S.RESET} ${prompt}${hint}: `, (answer) => {
      const val = answer.trim();
      resolve(val || (defaultValue != null ? String(defaultValue) : ''));
    });
  });
}

function confirm(prompt) {
  return new Promise((resolve) => {
    rl.question(`  ${S.CYAN}?${S.RESET} ${prompt} ${S.DIM}(y/N)${S.RESET}: `, (answer) => {
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── Run CLI Command ──────────────────────────────────────────

function runCmd(args, { stream = true } = {}) {
  const cmd = `node "${BIN_PATH}" ${args}`;
  console.log(`\n  ${S.DIM}$ ${cmd}${S.RESET}\n`);

  if (stream) {
    try {
      execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      const output = execSync(cmd, { encoding: 'utf8', cwd: ROOT_DIR });
      console.log(output);
      return true;
    } catch (err) {
      console.error(err.stderr || err.message);
      return false;
    }
  }
}

// ── Menu Actions ─────────────────────────────────────────────

async function convertSingleUrl() {
  printSection('Convert Single URL');
  const url = await ask('Enter URL');
  if (!url) { printError('No URL provided.'); return; }

  const frontMatter = await confirm('Add YAML front matter?');
  const noImages = await confirm('Skip image downloading?');
  const verboseOutput = await confirm('Show detailed progress logs in terminal?');
  const output = await ask('Output directory', 'auto');

  let flags = '';
  if (frontMatter) flags += ' --front-matter';
  if (noImages) flags += ' --no-images';
  if (verboseOutput) flags += ' --verbose';
  if (output !== 'auto') flags += ` -o "${output}"`;

  runCmd(`"${url}"${flags}`);
}

async function convertLocalFile() {
  printSection('Convert Local HTML File');
  const filePath = await ask('Path to HTML file');
  if (!filePath) { printError('No file path provided.'); return; }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    printError(`File not found: ${resolved}`);
    return;
  }

  const frontMatter = await confirm('Add YAML front matter?');
  const verboseOutput = await confirm('Show detailed progress logs in terminal?');
  let flags = '';
  if (frontMatter) flags += ' --front-matter';
  if (verboseOutput) flags += ' --verbose';

  runCmd(`"${resolved}"${flags}`);
}

async function batchConvert() {
  printSection('Batch Convert');
  const filePath = await ask('Path to URLs file (one URL per line)');
  if (!filePath) { printError('No file path provided.'); return; }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    printError(`File not found: ${resolved}`);
    return;
  }

  const concurrency = await ask('Concurrency', '3');
  const frontMatter = await confirm('Add YAML front matter?');
  const verboseOutput = await confirm('Show detailed progress logs in terminal?');

  let flags = `--batch "${resolved}" --concurrency ${concurrency}`;
  if (frontMatter) flags += ' --front-matter';
  if (verboseOutput) flags += ' --verbose';

  runCmd(flags);
}

async function crawlSite() {
  printSection('Crawl Entire Site');
  const url = await ask('Enter site URL');
  if (!url) { printError('No URL provided.'); return; }

  const depth = await ask('Max depth', '3');
  const maxPages = await ask('Max pages', '300');
  const frontMatter = await confirm('Add YAML front matter?');
  const noImages = await confirm('Skip image downloading?');
  const verboseOutput = await confirm('Show detailed progress logs in terminal?');

  let flags = `--crawl "${url}" --depth ${depth} --max-pages ${maxPages}`;
  if (frontMatter) flags += ' --front-matter';
  if (noImages) flags += ' --no-images';
  if (verboseOutput) flags += ' --verbose';

  runCmd(flags);
}

async function viewTree() {
  printSection('View Site Tree (no conversion)');
  const url = await ask('Enter site URL');
  if (!url) { printError('No URL provided.'); return; }

  const depth = await ask('Max depth', '3');
  const maxPages = await ask('Max pages', '300');

  runCmd(`--crawl "${url}" --depth ${depth} --max-pages ${maxPages} --tree-only`);
}

function startApiServer() {
  printSection('Start API Server');
  const serverPath = path.join(ROOT_DIR, 'server.js');
  const port = process.env.PORT || 3000;

  printInfo(`Starting server on port ${port}...`);
  printInfo(`Press Ctrl+C to stop.\n`);

  try {
    execSync(`node "${serverPath}"`, { stdio: 'inherit', cwd: ROOT_DIR });
  } catch {
    // User pressed Ctrl+C
  }
}

// ── Main Menu ────────────────────────────────────────────────

const MENU_ITEMS = [
  menuItem(1, '🌐', 'Convert URL',       'Convert a single web page to Markdown'),
  menuItem(2, '📄', 'Convert File',      'Convert a local HTML file'),
  menuItem(3, '📦', 'Batch Convert',     'Convert multiple URLs from a file'),
  menuItem(4, '🕷️', 'Crawl Site',        'Discover and convert all pages on a domain'),
  menuItem(5, '🌳', 'View Site Tree',    'Show site structure without converting'),
  menuItem(6, '🚀', 'Start API Server',  'Launch the REST API on localhost'),
  '',
  menuItem(0, '👋', 'Exit',              ''),
];

function showMenu() {
  console.log(logo());
  MENU_ITEMS.forEach(item => console.log(item));
  console.log('');
}

async function main() {
  console.clear();
  showMenu();

  while (true) {
    const choice = await ask('Choose', '0');

    switch (choice) {
      case '1': await convertSingleUrl(); break;
      case '2': await convertLocalFile(); break;
      case '3': await batchConvert(); break;
      case '4': await crawlSite(); break;
      case '5': await viewTree(); break;
      case '6': startApiServer(); break;
      case '0':
      case 'q':
      case 'exit':
        console.log(`\n  ${S.DIM}Bye! 👋${S.RESET}\n`);
        rl.close();
        process.exit(0);
      default:
        printError(`Invalid option: ${choice}`);
    }

    console.log('');
    console.log(`  ${S.DIM}${SEPARATOR}${S.RESET}`);
    console.log(`  ${S.DIM}Press Enter to return to menu...${S.RESET}`);
    await ask('');
    console.clear();
    showMenu();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
