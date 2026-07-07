/* ============================================================
   ReadmeForge – Core Application Logic
   Uses GitHub Public REST API (unauthenticated, 60 req/hr)
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
let currentMarkdown = '';
let repoData = null;

// ── UI References ──────────────────────────────────────────
const repoUrlInput  = document.getElementById('repoUrl');
const generateBtn   = document.getElementById('generateBtn');
const loadingState  = document.getElementById('loadingState');
const errorState    = document.getElementById('errorState');
const errorMessage  = document.getElementById('errorMessage');
const resultSection = document.getElementById('resultSection');
const previewPane   = document.getElementById('previewPane');
const rawPane       = document.getElementById('rawPane');
const inputCard     = document.getElementById('inputCard');

// ── Entry point ────────────────────────────────────────────
repoUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleGenerate();
});

function setExample(url) {
  repoUrlInput.value = url;
  repoUrlInput.focus();
}

async function handleGenerate() {
  const raw = repoUrlInput.value.trim();
  if (!raw) { shake(inputCard); return; }

  const parsed = parseGitHubUrl(raw);
  if (!parsed) {
    showError('Invalid GitHub URL. Please enter a URL like:\nhttps://github.com/owner/repository');
    return;
  }

  await generateReadme(parsed.owner, parsed.repo);
}

// ── URL Parser ─────────────────────────────────────────────
function parseGitHubUrl(url) {
  try {
    const u = new URL(url.replace(/\.git$/, ''));
    if (!u.hostname.includes('github.com')) return null;
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

// ── Main Generator ─────────────────────────────────────────
async function generateReadme(owner, repo) {
  showLoading();

  try {
    // Step 1: Repo metadata
    setStep(1);
    const repoInfo = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);

    // Step 2: File tree
    setStep(2);
    const treeData = await fetchFileTree(owner, repo, repoInfo.default_branch || 'main');

    // Step 3: Read key files
    setStep(3);
    const fileContents = await readKeyFiles(owner, repo, repoInfo.default_branch || 'main', treeData);

    // Step 4: Generate
    setStep(4);
    await sleep(400); // short pause for UX feel

    const markdown = buildReadme(repoInfo, treeData, fileContents);
    currentMarkdown = markdown;
    repoData = repoInfo;

    showResult(repoInfo, markdown);

  } catch (err) {
    const msg = formatApiError(err);
    showError(msg);
  }
}

// ── GitHub API Helpers ─────────────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!res.ok) {
    const err = new Error(`GitHub API error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchFileTree(owner, repo, branch) {
  try {
    const data = await fetchJSON(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    return (data.tree || []).filter(f => f.type === 'blob').map(f => f.path);
  } catch {
    // Fallback: top-level only
    try {
      const data = await fetchJSON(
        `https://api.github.com/repos/${owner}/${repo}/contents/`
      );
      return (Array.isArray(data) ? data : []).map(f => f.path);
    } catch {
      return [];
    }
  }
}

async function readKeyFiles(owner, repo, branch, allPaths) {
  const priority = [
    'package.json', 'pyproject.toml', 'setup.py', 'setup.cfg',
    'requirements.txt', 'Cargo.toml', 'go.mod', 'composer.json',
    'pom.xml', 'build.gradle', 'build.gradle.kts',
    'Gemfile', 'mix.exs', 'pubspec.yaml',
    'Makefile', 'CMakeLists.txt', 'CONTRIBUTING.md',
    'LICENSE', 'LICENSE.md', 'LICENSE.txt',
    '.github/workflows', 'docker-compose.yml', 'Dockerfile',
    'README.md', 'readme.md',
  ];

  const toRead = priority.filter(p =>
    allPaths.some(f => f === p || f.startsWith(p + '/'))
  ).slice(0, 10); // read at most 10 files to stay under rate limit

  const results = {};

  await Promise.allSettled(
    toRead.map(async filePath => {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
        );
        if (res.ok) {
          const text = await res.text();
          results[filePath] = text.slice(0, 6000); // cap per file
        }
      } catch { /* skip */ }
    })
  );

  return results;
}

// ── Tech Detection ─────────────────────────────────────────
function detectTechStack(paths, fileContents) {
  const stack = {
    languages: new Set(),
    frameworks: new Set(),
    tools: new Set(),
    databases: new Set(),
    testing: new Set(),
    cicd: new Set(),
    packageManager: null,
    runtime: null,
    mainLanguage: null,
  };

  // Language detection from file extensions
  const extMap = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
    '.py': 'Python', '.pyx': 'Python',
    '.rs': 'Rust', '.go': 'Go', '.java': 'Java',
    '.kt': 'Kotlin', '.scala': 'Scala', '.cs': 'C#',
    '.cpp': 'C++', '.c': 'C', '.h': 'C/C++',
    '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift',
    '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
    '.hs': 'Haskell', '.ml': 'OCaml', '.clj': 'Clojure',
    '.sh': 'Shell', '.bash': 'Shell', '.r': 'R', '.R': 'R',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SCSS',
    '.vue': 'Vue.js', '.svelte': 'Svelte', '.sol': 'Solidity',
  };

  const extCount = {};
  paths.forEach(p => {
    const m = p.match(/\.[a-zA-Z0-9]+$/);
    if (m) {
      const lang = extMap[m[0].toLowerCase()] || extMap[m[0]];
      if (lang) extCount[lang] = (extCount[lang] || 0) + 1;
    }
  });

  // Top languages
  Object.entries(extCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([lang]) => stack.languages.add(lang));

  stack.mainLanguage = Object.entries(extCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Package.json analysis
  const pkgJson = fileContents['package.json'];
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      stack.packageManager = 'npm';
      if (paths.some(p => p === 'yarn.lock')) stack.packageManager = 'Yarn';
      if (paths.some(p => p === 'pnpm-lock.yaml')) stack.packageManager = 'pnpm';
      if (paths.some(p => p === 'bun.lockb')) stack.packageManager = 'Bun';

      if (deps.react || deps['react-dom'])          stack.frameworks.add('React');
      if (deps.next)                                  stack.frameworks.add('Next.js');
      if (deps.vue)                                   stack.frameworks.add('Vue.js');
      if (deps.nuxt)                                  stack.frameworks.add('Nuxt.js');
      if (deps['@angular/core'])                      stack.frameworks.add('Angular');
      if (deps.svelte)                                stack.frameworks.add('Svelte');
      if (deps.express)                               stack.frameworks.add('Express.js');
      if (deps.fastify)                               stack.frameworks.add('Fastify');
      if (deps.koa)                                   stack.frameworks.add('Koa');
      if (deps.nestjs || deps['@nestjs/core'])        stack.frameworks.add('NestJS');
      if (deps.electron)                              stack.frameworks.add('Electron');
      if (deps['react-native'])                       stack.frameworks.add('React Native');
      if (deps.tailwindcss)                           stack.tools.add('Tailwind CSS');
      if (deps.typescript || deps['@types/node'])     stack.tools.add('TypeScript');
      if (deps.webpack)                               stack.tools.add('Webpack');
      if (deps.vite)                                  stack.tools.add('Vite');
      if (deps.prisma || deps['@prisma/client'])      stack.databases.add('Prisma');
      if (deps.mongoose)                              stack.databases.add('MongoDB');
      if (deps.pg)                                    stack.databases.add('PostgreSQL');
      if (deps.mysql || deps.mysql2)                  stack.databases.add('MySQL');
      if (deps.redis || deps.ioredis)                 stack.databases.add('Redis');
      if (deps.jest)                                  stack.testing.add('Jest');
      if (deps.mocha)                                 stack.testing.add('Mocha');
      if (deps.vitest)                                stack.testing.add('Vitest');
      if (deps.cypress)                               stack.testing.add('Cypress');
      if (deps.playwright || deps['@playwright/test']) stack.testing.add('Playwright');
      if (deps.graphql)                               stack.tools.add('GraphQL');
      if (deps.socket || deps['socket.io'])           stack.tools.add('Socket.IO');
      if (deps['@supabase/supabase-js'])              stack.databases.add('Supabase');
      if (deps.firebase)                              stack.databases.add('Firebase');

    } catch { /* invalid JSON */ }
  }

  // Python
  const pyFiles = [
    fileContents['requirements.txt'],
    fileContents['setup.py'],
    fileContents['pyproject.toml']
  ].filter(Boolean).join('\n');

  if (pyFiles) {
    stack.runtime = 'Python';
    if (/django/i.test(pyFiles))             stack.frameworks.add('Django');
    if (/flask/i.test(pyFiles))              stack.frameworks.add('Flask');
    if (/fastapi/i.test(pyFiles))            stack.frameworks.add('FastAPI');
    if (/aiohttp/i.test(pyFiles))            stack.frameworks.add('aiohttp');
    if (/sqlalchemy/i.test(pyFiles))         stack.databases.add('SQLAlchemy');
    if (/psycopg2/i.test(pyFiles))           stack.databases.add('PostgreSQL');
    if (/pymongo/i.test(pyFiles))            stack.databases.add('MongoDB');
    if (/redis/i.test(pyFiles))              stack.databases.add('Redis');
    if (/pytest/i.test(pyFiles))             stack.testing.add('pytest');
    if (/celery/i.test(pyFiles))             stack.tools.add('Celery');
    if (/pydantic/i.test(pyFiles))           stack.tools.add('Pydantic');
    if (/numpy/i.test(pyFiles))              stack.tools.add('NumPy');
    if (/pandas/i.test(pyFiles))             stack.tools.add('Pandas');
    if (/torch|tensorflow|keras/i.test(pyFiles)) stack.tools.add('ML/AI');
    if (/scikit/i.test(pyFiles))             stack.tools.add('scikit-learn');
  }

  // Rust
  if (fileContents['Cargo.toml']) {
    stack.runtime = 'Rust';
    const cargo = fileContents['Cargo.toml'];
    if (/tokio/i.test(cargo))               stack.frameworks.add('Tokio');
    if (/axum|actix|warp/i.test(cargo))     stack.frameworks.add(/axum/i.test(cargo) ? 'Axum' : /actix/i.test(cargo) ? 'Actix-web' : 'Warp');
    if (/serde/i.test(cargo))               stack.tools.add('Serde');
    if (/diesel|sqlx/i.test(cargo))         stack.databases.add('SQLx/Diesel');
  }

  // Go
  if (fileContents['go.mod']) {
    stack.runtime = 'Go';
    const gomod = fileContents['go.mod'];
    if (/gin-gonic|gin/i.test(gomod))       stack.frameworks.add('Gin');
    if (/echo/i.test(gomod))                stack.frameworks.add('Echo');
    if (/fiber/i.test(gomod))               stack.frameworks.add('Fiber');
    if (/gorm/i.test(gomod))                stack.databases.add('GORM');
  }

  // Java / Kotlin
  if (fileContents['pom.xml'] || fileContents['build.gradle'] || fileContents['build.gradle.kts']) {
    const jvmFiles = [fileContents['pom.xml'], fileContents['build.gradle'], fileContents['build.gradle.kts']].filter(Boolean).join('\n');
    if (/spring/i.test(jvmFiles))           stack.frameworks.add('Spring Boot');
    if (/junit/i.test(jvmFiles))            stack.testing.add('JUnit');
  }

  // Docker / CI/CD
  if (paths.some(p => p === 'Dockerfile' || p.startsWith('Dockerfile.'))) stack.tools.add('Docker');
  if (paths.some(p => p === 'docker-compose.yml' || p === 'docker-compose.yaml')) stack.tools.add('Docker Compose');
  if (paths.some(p => p.includes('.github/workflows'))) stack.cicd.add('GitHub Actions');
  if (paths.some(p => p.includes('.travis.yml')))       stack.cicd.add('Travis CI');
  if (paths.some(p => p.includes('.circleci')))         stack.cicd.add('CircleCI');
  if (paths.some(p => p === 'Makefile'))                stack.tools.add('Makefile');
  if (paths.some(p => p === 'pubspec.yaml'))            { stack.frameworks.add('Flutter'); stack.runtime = 'Dart'; }

  return stack;
}

// ── Installation Commands ───────────────────────────────────
function getInstallCommands(repoInfo, fileContents, stack, paths) {
  const sections = [];
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;
  const branch = repoInfo.default_branch;

  sections.push(`git clone ${repoInfo.clone_url}`);
  sections.push(`cd ${repo}`);

  if (fileContents['package.json']) {
    const pm = stack.packageManager || 'npm';
    sections.push(pm === 'Yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : pm === 'Bun' ? 'bun install' : 'npm install');
  }

  if (fileContents['requirements.txt']) {
    sections.push('pip install -r requirements.txt');
  }

  if (fileContents['pyproject.toml'] && !fileContents['requirements.txt']) {
    sections.push('pip install -e .');
  }

  if (fileContents['Cargo.toml']) {
    sections.push('cargo build');
  }

  if (fileContents['go.mod']) {
    sections.push('go mod download');
  }

  if (fileContents['Gemfile']) {
    sections.push('bundle install');
  }

  if (fileContents['composer.json']) {
    sections.push('composer install');
  }

  if (fileContents['pubspec.yaml']) {
    sections.push('flutter pub get');
  }

  return sections;
}

// ── Run Commands ────────────────────────────────────────────
function getRunCommands(fileContents, stack, paths) {
  const cmds = [];

  if (fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      const scripts = pkg.scripts || {};
      if (scripts.dev)   cmds.push({ label: 'Development', cmd: `${stack.packageManager === 'Yarn' ? 'yarn' : stack.packageManager === 'pnpm' ? 'pnpm' : 'npm run'} dev` });
      if (scripts.start) cmds.push({ label: 'Production', cmd: `${stack.packageManager === 'Yarn' ? 'yarn' : stack.packageManager === 'pnpm' ? 'pnpm' : 'npm'} start` });
      if (scripts.build) cmds.push({ label: 'Build', cmd: `${stack.packageManager === 'Yarn' ? 'yarn' : stack.packageManager === 'pnpm' ? 'pnpm' : 'npm run'} build` });
    } catch { /* */ }
  }

  if (fileContents['pyproject.toml'] || fileContents['requirements.txt']) {
    if (stack.frameworks.has('FastAPI') || stack.frameworks.has('Flask')) {
      cmds.push({ label: 'Start server', cmd: stack.frameworks.has('FastAPI') ? 'uvicorn main:app --reload' : 'flask run' });
    } else if (stack.frameworks.has('Django')) {
      cmds.push({ label: 'Start server', cmd: 'python manage.py runserver' });
    } else {
      cmds.push({ label: 'Run', cmd: 'python main.py' });
    }
  }

  if (fileContents['Cargo.toml']) {
    cmds.push({ label: 'Run', cmd: 'cargo run' });
    cmds.push({ label: 'Release build', cmd: 'cargo build --release' });
  }

  if (fileContents['go.mod']) {
    cmds.push({ label: 'Run', cmd: 'go run .' });
    cmds.push({ label: 'Build', cmd: 'go build -o app .' });
  }

  if (fileContents['pubspec.yaml']) {
    cmds.push({ label: 'Run', cmd: 'flutter run' });
  }

  return cmds;
}

// ── Test Commands ────────────────────────────────────────────
function getTestCommands(fileContents, stack) {
  const cmds = [];

  if (stack.testing.has('Jest') || stack.testing.has('Vitest')) {
    const pm = stack.packageManager;
    cmds.push(pm === 'Yarn' ? 'yarn test' : pm === 'pnpm' ? 'pnpm test' : 'npm test');
  }

  if (stack.testing.has('pytest')) cmds.push('pytest');
  if (stack.testing.has('Cypress')) cmds.push('npx cypress run');
  if (stack.testing.has('Playwright')) cmds.push('npx playwright test');

  if (fileContents['Cargo.toml']) cmds.push('cargo test');
  if (fileContents['go.mod']) cmds.push('go test ./...');
  if (fileContents['pom.xml']) cmds.push('mvn test');

  if (cmds.length === 0 && fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      if (pkg.scripts?.test) {
        const pm = stack.packageManager;
        cmds.push(pm === 'Yarn' ? 'yarn test' : pm === 'pnpm' ? 'pnpm test' : 'npm test');
      }
    } catch { /* */ }
  }

  return cmds;
}

// ── License Detector ────────────────────────────────────────
function detectLicense(fileContents, repoInfo) {
  if (repoInfo.license) return repoInfo.license.spdx_id || repoInfo.license.name;
  const licenseFile = fileContents['LICENSE'] || fileContents['LICENSE.md'] || fileContents['LICENSE.txt'] || '';
  if (/MIT License/i.test(licenseFile)) return 'MIT';
  if (/Apache License/i.test(licenseFile)) return 'Apache-2.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(licenseFile)) return /Version 3/.test(licenseFile) ? 'GPL-3.0' : 'GPL-2.0';
  if (/BSD/i.test(licenseFile)) return 'BSD';
  return null;
}

// ── Get Project Name ─────────────────────────────────────────
function getProjectName(repoInfo, fileContents) {
  if (fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      if (pkg.name) return toTitle(pkg.name.replace(/^@[\w-]+\//, ''));
    } catch { /* */ }
  }
  return toTitle(repoInfo.name);
}

function toTitle(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Project Description ─────────────────────────────────────
function getDescription(repoInfo, fileContents) {
  if (repoInfo.description) return repoInfo.description;

  // Try package.json
  if (fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      if (pkg.description) return pkg.description;
    } catch { /* */ }
  }
  return null;
}

// ── Directory Structure ──────────────────────────────────────
function buildDirectoryTree(paths, maxDepth = 2) {
  const items = new Set();
  paths.forEach(p => {
    const parts = p.split('/');
    for (let d = 1; d <= Math.min(parts.length, maxDepth); d++) {
      items.add(parts.slice(0, d).join('/'));
    }
  });

  const tree = Array.from(items).sort().slice(0, 24);
  if (tree.length === 0) return null;

  let out = '```\n';
  out += `./\n`;
  tree.forEach(item => {
    const depth = item.split('/').length;
    const name = item.split('/').pop();
    const isDir = paths.some(p => p.startsWith(item + '/'));
    out += `${'│   '.repeat(depth - 1)}├── ${name}${isDir ? '/' : ''}\n`;
  });
  out += '```';
  return out;
}

// ── Badge Builder ────────────────────────────────────────────
function buildBadges(repoInfo, stack, license) {
  const { owner: { login: owner }, name: repo } = repoInfo;
  const badges = [];

  // Language badge
  const langColors = {
    TypeScript: '3178c6', JavaScript: 'f7df1e', Python: '3572A5',
    Rust: 'dea584', Go: '00ADD8', Java: 'b07219', Kotlin: 'F18E33',
    'C#': '178600', 'C++': 'f34b7d', Ruby: '701516', Swift: 'F05138',
    Dart: '00B4AB', PHP: '4F5D95', Elixir: '6e4a7e',
  };

  if (stack.mainLanguage) {
    const color = langColors[stack.mainLanguage] || '555555';
    badges.push(`![${stack.mainLanguage}](https://img.shields.io/badge/${encodeURIComponent(stack.mainLanguage)}-${color}?style=flat-square&logo=${encodeURIComponent(stack.mainLanguage.toLowerCase())}&logoColor=white)`);
  }

  // Framework badges
  const fwBadgeMap = {
    'React': 'React-61DAFB?logo=react&logoColor=black',
    'Next.js': 'Next.js-000000?logo=next.js',
    'Vue.js': 'Vue.js-4FC08D?logo=vue.js&logoColor=white',
    'Nuxt.js': 'Nuxt.js-00DC82?logo=nuxt.js&logoColor=white',
    'Angular': 'Angular-DD0031?logo=angular',
    'Svelte': 'Svelte-FF3E00?logo=svelte&logoColor=white',
    'Express.js': 'Express-000000?logo=express',
    'Fastify': 'Fastify-000000?logo=fastify',
    'NestJS': 'NestJS-E0234E?logo=nestjs',
    'Django': 'Django-092E20?logo=django',
    'FastAPI': 'FastAPI-009688?logo=fastapi',
    'Flask': 'Flask-000000?logo=flask',
    'Electron': 'Electron-47848F?logo=electron',
    'Flutter': 'Flutter-02569B?logo=flutter',
    'Spring Boot': 'Spring_Boot-6DB33F?logo=spring-boot',
    'Tokio': 'Tokio-000000?logo=rust',
    'Gin': 'Gin-00ACD7?logo=go&logoColor=white',
  };

  stack.frameworks.forEach(fw => {
    if (fwBadgeMap[fw]) {
      badges.push(`![${fw}](https://img.shields.io/badge/${fwBadgeMap[fw]}&style=flat-square)`);
    }
  });

  // Stars & Forks
  badges.push(`![GitHub Stars](https://img.shields.io/github/stars/${owner}/${repo}?style=flat-square&logo=github)`);
  badges.push(`![GitHub Forks](https://img.shields.io/github/forks/${owner}/${repo}?style=flat-square&logo=github)`);

  // License
  if (license && license !== 'NOASSERTION') {
    badges.push(`![License](https://img.shields.io/badge/license-${encodeURIComponent(license)}-blue?style=flat-square)`);
  }

  // CI/CD
  if (stack.cicd.has('GitHub Actions')) {
    badges.push(`![CI](https://img.shields.io/github/actions/workflow/status/${owner}/${repo}/ci.yml?style=flat-square&label=CI)`);
  }

  return badges;
}

// ── README Builder ────────────────────────────────────────────
function buildReadme(repoInfo, paths, fileContents) {
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;
  const projectName = getProjectName(repoInfo, fileContents);
  const description = getDescription(repoInfo, fileContents);
  const stack = detectTechStack(paths, fileContents);
  const license = detectLicense(fileContents, repoInfo);
  const installCmds = getInstallCommands(repoInfo, fileContents, stack, paths);
  const runCmds = getRunCommands(fileContents, stack, paths);
  const testCmds = getTestCommands(fileContents, stack);
  const badges = buildBadges(repoInfo, stack, license);
  const hasDocker = paths.some(p => p === 'Dockerfile' || p.startsWith('Dockerfile.'));
  const hasDC = paths.some(p => p.includes('docker-compose'));
  const hasContrib = paths.some(p => /CONTRIBUTING/i.test(p));
  const topics = repoInfo.topics || [];

  // Define stack status variables
  const isWebApp = stack.frameworks.has('React') || 
                   stack.frameworks.has('Next.js') || 
                   stack.frameworks.has('Vue.js') || 
                   stack.frameworks.has('Nuxt.js') || 
                   stack.frameworks.has('Angular') || 
                   stack.frameworks.has('Svelte') ||
                   stack.languages.has('HTML') ||
                   stack.languages.has('CSS');

  const isBackend = stack.frameworks.has('Django') || 
                    stack.frameworks.has('Flask') || 
                    stack.frameworks.has('FastAPI') || 
                    stack.frameworks.has('aiohttp') ||
                    stack.frameworks.has('Express.js') ||
                    stack.frameworks.has('Fastify') ||
                    stack.frameworks.has('Koa') ||
                    stack.frameworks.has('NestJS') ||
                    stack.frameworks.has('Spring Boot') ||
                    stack.frameworks.has('Tokio') ||
                    stack.frameworks.has('Gin') ||
                    stack.frameworks.has('Echo') ||
                    stack.frameworks.has('Fiber') ||
                    stack.runtime === 'Python' || 
                    stack.runtime === 'Go' || 
                    stack.runtime === 'Rust' ||
                    stack.databases.size > 0;

  const isFullStack = isWebApp && isBackend;

  const isMobile = stack.frameworks.has('Flutter') ||
                   stack.frameworks.has('React Native') ||
                   stack.languages.has('Swift') ||
                   stack.languages.has('Kotlin') ||
                   paths.some(p => p.includes('android/') || p.includes('ios/'));

  const pm = stack.packageManager || 'npm';
  const pmLower = pm.toLowerCase();
  const pmRun = pmLower === 'yarn' ? 'yarn' : (pmLower === 'pnpm' ? 'pnpm' : (pmLower === 'bun' ? 'bun run' : 'npm run'));
  const pmExec = pmLower === 'yarn' ? 'yarn' : (pmLower === 'pnpm' ? 'pnpm dlx' : (pmLower === 'bun' ? 'bunx' : 'npx'));

  let defaultPort = '3000';
  if (stack.frameworks.has('FastAPI') || stack.frameworks.has('Flask') || stack.frameworks.has('Django')) {
    defaultPort = '8000';
  } else if (stack.frameworks.has('Spring Boot')) {
    defaultPort = '8080';
  }

  let md = '';

  // ── Title & Badges ──
  md += `<div align="center">\n\n`;
  md += `# 🚀 ${projectName}\n\n`;
  if (badges.length > 0) {
    md += badges.join(' ') + '\n';
  }
  md += `\n**A professional, production-ready implementation built on modern patterns.**\n\n`;
  md += `[Report Bug](https://github.com/${owner}/${repo}/issues) · [Request Feature](https://github.com/${owner}/${repo}/issues) · [Get Help](https://github.com/${owner}/${repo}/discussions)\n\n`;
  md += `</div>\n\n---\n\n`;

  // ── Description ──
  md += `## 📖 Introduction & Overview\n\n`;
  if (description) {
    md += `${description}\n\n`;
  } else {
    md += `${projectName} is a modern, robust, and scalable project designed to address developers' needs efficiently. This repository contains the source code, documentation, and configuration files required to run, test, and deploy the application seamlessly.\n\n`;
  }

  // ── Topics ──
  if (topics.length > 0) {
    md += `### 🏷️ Project Keywords & Tags\n\n`;
    md += topics.map(t => `\`${t}\``).join(' ') + '\n\n';
  }

  // ── Table of Contents ──
  const tocItems = ['Features', 'Tech Stack'];
  if (isBackend || isFullStack) tocItems.push('Architecture & Design');
  tocItems.push('Getting Started', 'Installation');
  if (runCmds.length > 0) tocItems.push('Usage');
  if (isBackend || isFullStack || isWebApp) tocItems.push('API Reference');
  if (testCmds.length > 0) tocItems.push('Running Tests');
  if (hasDocker || hasDC) tocItems.push('Docker & Containers');
  tocItems.push('Project Structure');
  if (isBackend || isFullStack || isWebApp) tocItems.push('Deployment');
  tocItems.push('Troubleshooting FAQ', 'Roadmap', 'Contributing', 'License');

  md += `## 🗂️ Table of Contents\n\n`;
  tocItems.forEach(item => {
    md += `- [${item}](#${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')})\n`;
  });
  md += '\n---\n\n';

  // ── Features ──
  md += `## ✨ Key Features\n\n`;
  const featureSet = [];

  if (stack.frameworks.size > 0) {
    featureSet.push(`**Modern Core Framework**: Built with ${Array.from(stack.frameworks).slice(0, 3).join(', ')} for stellar performance, reliability, and modern lifecycle hooks.`);
  }
  if (stack.databases.size > 0) {
    featureSet.push(`**Robust Persistent Storage**: Seamless database integration with ${Array.from(stack.databases).slice(0, 2).join(' & ')} supporting migration scripts, connection pooling, and optimized query pipelines.`);
  }
  if (stack.testing.size > 0) {
    featureSet.push(`**High Code Coverage & Quality**: Comprehensive test suite executing unit, integration, and E2E specs using ${Array.from(stack.testing).join(', ')}.`);
  }
  if (hasDocker) {
    featureSet.push(`**Dockerized Dev & Prod**: Containerized configuration files enabling reproducible builds, multi-stage builds, and non-root execution for optimal security.`);
  }
  if (stack.cicd.size > 0) {
    featureSet.push(`**Continuous Integration**: Automated testing, lint checks, and preview deployments configured through ${Array.from(stack.cicd).join(', ')}.`);
  }
  if (stack.tools.has('TypeScript')) {
    featureSet.push(`**Type-Safe Core**: End-to-end type safety, strict compile checks, and advanced interface contracts.`);
  }
  if (stack.tools.has('GraphQL')) {
    featureSet.push(`**Flexible API Schema**: Schema-first GraphQL API layer with typed queries, mutations, and resolver mapping.`);
  }
  if (stack.tools.has('Tailwind CSS')) {
    featureSet.push(`**Fluid UI / Responsive Design**: Styled using utility-first classes, design tokens, responsive grid layouts, and automatic dark mode support.`);
  }

  // Generic features
  featureSet.push(
    `**Environment Security**: Segregated development, staging, and production environment configuration parsing via \`.env\` structures.`,
    `**Advanced Logging & Telemetry**: Integrated logging mechanisms for auditing, debugging, and tracing runtime exceptions.`,
    `**Clean & Modular Architecture**: Separation of concerns adhering to modular development best practices, making the codebase highly extendable.`
  );

  featureSet.forEach(f => { md += `- ${f}\n`; });
  md += '\n';

  // ── Tech Stack ──
  md += `## 🛠️ Tech Stack\n\n`;
  md += `| Category | Technologies | Purpose |\n`;
  md += `| :--- | :--- | :--- |\n`;

  if (stack.languages.size > 0) md += `| **Language** | ${Array.from(stack.languages).map(l => `\`${l}\``).join(', ')} | Core programming logic |\n`;
  if (stack.frameworks.size > 0) md += `| **Framework** | ${Array.from(stack.frameworks).map(f => `\`${f}\``).join(', ')} | Application foundation & routing |\n`;
  if (stack.tools.size > 0) md += `| **Tools & Libraries** | ${Array.from(stack.tools).map(t => `\`${t}\``).join(', ')} | Development tools, linters, and helpers |\n`;
  if (stack.databases.size > 0) md += `| **Database** | ${Array.from(stack.databases).map(d => `\`${d}\``).join(', ')} | Persistent data storage & caching |\n`;
  if (stack.testing.size > 0) md += `| **Testing** | ${Array.from(stack.testing).map(t => `\`${t}\``).join(', ')} | Unit, integration, and E2E test suites |\n`;
  if (stack.cicd.size > 0) md += `| **CI/CD** | ${Array.from(stack.cicd).map(c => `\`${c}\``).join(', ')} | Automated builds and deployments |\n`;
  if (stack.packageManager) md += `| **Package Manager** | \`${stack.packageManager}\` | Dependency resolution & script runner |\n`;

  md += '\n---\n\n';

  // ── Architecture & Design ──
  if (isBackend || isFullStack) {
    md += `## 🏗️ Architecture & Design Patterns\n\n`;
    md += `This project utilizes a structured, modular design pattern to separate concerns and ensure maintainability:\n\n`;
    md += `- **Layered Architecture**: Decouples presentation, business logic, data access, and external services.\n`;
    md += `- **Dependency Injection / Modular Pattern**: Encapsulates code blocks into reusable modules with clear dependency resolution.\n`;
    md += `- **Controllers & Services**: Routes delegate to thin controllers, which call heavy-duty services handling actual business logic.\n`;
    md += `- **Middlewares & Interceptors**: Handles authentication, logging, rate-limiting, and error-handling globally.\n\n`;
    md += `### Flow Diagram\n\n`;
    md += `\`\`\`\n`;
    md += `[Client Request] ──► [Routing / Router] ──► [Middlewares] ──► [Controllers] ──► [Services] ──► [Database / ORM]\n`;
    md += `                                                                    │\n`;
    md += `                                                                    └──► [External APIs / Services]\n`;
    md += `\`\`\`\n\n`;
  }

  // ── Getting Started ──
  md += `## 🚀 Getting Started\n\n`;
  md += `Follow these step-by-step instructions to get a local copy of the project running on your machine.\n\n`;
  md += `### Prerequisites\n\n`;
  md += `Before proceeding, make sure your development environment has the following tools installed:\n\n`;

  const prereqs = [];
  if (fileContents['package.json']) {
    prereqs.push(`- **Node.js** (v18.0.0 or higher recommended) — [Install Node.js](https://nodejs.org/)`);
    if (pm === 'Yarn') prereqs.push('- **Yarn** package manager — [Install Yarn](https://yarnpkg.com/)');
    if (pm === 'pnpm') prereqs.push('- **pnpm** package manager — [Install pnpm](https://pnpm.io/)');
    if (pm === 'Bun') prereqs.push('- **Bun** JavaScript runtime — [Install Bun](https://bun.sh/)');
  }
  if (fileContents['requirements.txt'] || fileContents['pyproject.toml'] || fileContents['setup.py']) {
    prereqs.push('- **Python** (v3.9 or higher) — [Install Python](https://python.org/)');
    prereqs.push('- **pip** package installer or **Virtualenv** environment tool');
  }
  if (fileContents['Cargo.toml']) prereqs.push('- **Rust Toolchain** (rustc & cargo, stable channel) — [Install Rust](https://www.rust-lang.org/)');
  if (fileContents['go.mod']) prereqs.push('- **Go Programming Language** (v1.20 or higher) — [Install Go](https://golang.org/)');
  if (fileContents['Gemfile']) prereqs.push('- **Ruby** (v3.0 or higher) & **Bundler** — [Install Ruby](https://www.ruby-lang.org/)');
  if (fileContents['composer.json']) prereqs.push('- **PHP** (v8.1 or higher) & **Composer** package manager — [Install PHP](https://php.net/)');
  if (fileContents['pubspec.yaml']) prereqs.push('- **Flutter SDK** (stable channel) — [Install Flutter](https://flutter.dev/)');
  if (hasDocker) prereqs.push('- **Docker Desktop** (or Docker engine & compose CLI) — [Install Docker](https://docker.com/)');

  if (prereqs.length === 0) prereqs.push('- **Git** command-line interface installed on your host system');
  prereqs.forEach(p => { md += `${p}\n`; });
  md += '\n';

  // ── Installation ──
  md += `## 📥 Installation\n\n`;
  md += `1. **Clone the Repository**\n\n`;
  md += `\`\`\`bash\ngit clone ${repoInfo.clone_url}\ncd ${repo}\n\`\`\`\n\n`;

  // Python environment setup
  if (fileContents['requirements.txt'] || fileContents['pyproject.toml'] || fileContents['setup.py']) {
    md += `2. **Create and Activate a Virtual Environment** (Recommended)\n\n`;
    md += `\`\`\`bash\n# On Windows (CMD/PowerShell)\npython -m venv venv\n.\\\\venv\\\\Scripts\\\\activate\n\n# On macOS/Linux\npython3 -m venv venv\nsource venv/bin/activate\n\`\`\`\n\n`;
    md += `3. **Install Dependencies**\n\n`;
    md += `\`\`\`bash\n${installCmds.slice(2).join('\n')}\n\`\`\`\n\n`;
  } else if (installCmds.length > 2) {
    md += `2. **Install Dependencies**\n\n`;
    md += `\`\`\`bash\n${installCmds.slice(2).join('\n')}\n\`\`\`\n\n`;
  }

  // Environment variables setup
  md += `3. **Set Up Environment Variables**\n\n`;
  const hasEnvExample = paths.some(p => /\.env\.example|\.env\.sample|example\.env/i.test(p));
  if (hasEnvExample) {
    md += `Copy the example environment template file and configure it with your credentials:\n\n`;
    md += `\`\`\`bash\ncp .env.example .env\n\`\`\`\n\n`;
    md += `> 📝 **Note**: Open the generated \`.env\` file in your text editor and fill in the missing key-value configurations.\n\n`;
  } else {
    md += `Create a new \`.env\` file in the root directory. This project requires configuration variables to boot up properly.\n\n`;
  }

  md += `#### Key Environment Variables\n\n`;
  md += `| Variable | Description | Default | Required |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  if (isBackend || isFullStack) {
    md += `| \`NODE_ENV\` | Target environment for runtime configs | \`development\` | No |\n`;
    md += `| \`PORT\` | The HTTP port the server will bind to | \`${defaultPort}\` | No |\n`;
    md += `| \`HOST\` | Binding address for networking | \`0.0.0.0\` | No |\n`;
  }
  if (stack.databases.has('PostgreSQL') || stack.databases.has('SQLAlchemy')) {
    md += `| \`DATABASE_URL\` | PostgreSQL database connection string | — | **Yes** |\n`;
    md += `| \`DB_HOST\` | Database host server | \`localhost\` | No |\n`;
    md += `| \`DB_PORT\` | Database server port | \`5432\` | No |\n`;
    md += `| \`DB_NAME\` | Logical database name | — | **Yes** |\n`;
    md += `| \`DB_USER\` | Database username | — | **Yes** |\n`;
    md += `| \`DB_PASSWORD\` | Database password | — | **Yes** |\n`;
  }
  if (stack.databases.has('MongoDB')) {
    md += `| \`MONGODB_URI\` | Connection connection string | \`mongodb://localhost:27017\` | **Yes** |\n`;
    md += `| \`MONGODB_DB_NAME\` | Logical database name | \`${repo}\` | No |\n`;
  }
  if (stack.databases.has('Redis')) {
    md += `| \`REDIS_URL\` | Redis server connection URI | \`redis://localhost:6379\` | No |\n`;
  }
  if (stack.databases.has('Supabase')) {
    md += `| \`SUPABASE_URL\` | Supabase API Endpoint | — | **Yes** |\n`;
    md += `| \`SUPABASE_ANON_KEY\` | Client anonymous key | — | **Yes** |\n`;
    md += `| \`SUPABASE_SERVICE_KEY\` | Service role administrative key | — | **Yes** |\n`;
  }
  if (stack.databases.has('Firebase')) {
    md += `| \`FIREBASE_PROJECT_ID\` | Firebase Project ID | — | **Yes** |\n`;
    md += `| \`FIREBASE_PRIVATE_KEY\` | Firebase Admin SDK Private Key | — | **Yes** |\n`;
    md += `| \`FIREBASE_CLIENT_EMAIL\` | Service account client email | — | **Yes** |\n`;
  }
  if (isBackend || isFullStack) {
    md += `| \`JWT_SECRET\` | Encryption key for signing user sessions / auth tokens | — | **Yes** |\n`;
    md += `| \`JWT_EXPIRES_IN\` | Session lifespan | \`7d\` | No |\n`;
    md += `| \`CORS_ORIGIN\` | Allowed domains for cross-origin resources | \`*\` | No |\n`;
    md += `| \`LOG_LEVEL\` | Level of logs emitted to stdout (\`error\`, \`warn\`, \`info\`, \`debug\`) | \`info\` | No |\n`;
  }
  if (isWebApp || isFullStack) {
    if (stack.frameworks.has('Next.js') || stack.frameworks.has('Nuxt.js') || stack.frameworks.has('Vue.js') || stack.frameworks.has('React')) {
      md += `| \`NEXT_PUBLIC_API_URL\` | Backend server endpoint accessed by client | \`http://localhost:${defaultPort}\` | **Yes** |\n`;
    }
  }
  if (stack.tools.has('ML/AI')) {
    md += `| \`MODEL_PATH\` | Absolute / relative path to weight binaries | \`./models/\` | **Yes** |\n`;
    md += `| \`BATCH_SIZE\` | Evaluation batch size | \`32\` | No |\n`;
  }

  md += `\n> ⚠️ **IMPORTANT**: Never commit your \`.env\` file to Git version control. Ensure it is ignored by your \`.gitignore\` to prevent exposing production keys.\n\n`;

  // ── Usage ──
  md += `## ▶️ Usage\n\n`;
  md += `Here are the key commands used to run, build, and use the project:\n\n`;

  if (runCmds.length > 0) {
    runCmds.forEach(({ label, cmd }) => {
      md += `### 🛠️ ${label}\n\n\`\`\`bash\n${cmd}\n\`\`\`\n\n`;
    });
  } else {
    md += `\`\`\`bash\n# Run the project\n${fileContents['package.json'] ? `${pmRun} start` : fileContents['Cargo.toml'] ? 'cargo run' : fileContents['go.mod'] ? 'go run .' : 'python main.py'}\n\`\`\`\n\n`;
  }

  if (isWebApp || isFullStack) {
    md += `Once launched, the frontend user interface will be available at:\n\n`;
    md += `> 🌐 **Client Dashboard:** \`http://localhost:${defaultPort}\` (or the port output in console)\n\n`;
  }
  if (isBackend || isFullStack) {
    md += `The server will listen to incoming requests at:\n\n`;
    md += `> 🔗 **REST API Server:** \`http://localhost:${defaultPort}\`${stack.tools.has('GraphQL') ? `\n> 🔗 **GraphQL Interface:** \`http://localhost:${defaultPort}/graphql\`` : ''}\n\n`;
  }
  if (isMobile && stack.frameworks.has('Flutter')) {
    md += `\`\`\`bash\n# List connected simulator/emulator devices\nflutter devices\n\n# Run on active platform emulator\nflutter run\n\n# Build release-ready Android APK bundle\nflutter build apk --release\n\n# Build release-ready iOS application bundle\nflutter build ipa\n\`\`\`\n\n`;
  }

  // ── API Reference ──
  if (isBackend || isFullStack) {
    md += `## 📡 API Reference\n\n`;
    md += `This section documents the primary REST endpoints supported by the API service.\n\n`;

    if (paths.some(p => /swagger|openapi|api-docs/i.test(p))) {
      md += `The project has built-in support for **Swagger API docs / OpenAPI schema**. Once the server is running locally, access it at:\n\n`;
      md += `- 📚 **Interactive Swagger UI:** \`http://localhost:${defaultPort}/docs\`\n`;
      md += `- 📄 **JSON Schema Spec:** \`http://localhost:${defaultPort}/openapi.json\`\n\n`;
    }

    md += `### Authentication\n\n`;
    md += `For endpoints requiring authorization, pass your bearer token in the headers:\n`;
    md += `\`\`\`http\nAuthorization: Bearer <your-jwt-token>\n\`\`\`\n\n`;

    md += `### Key REST Endpoints\n\n`;
    md += `| Method | Endpoint | Description | Auth Required |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    md += `| \`GET\` | \`/api/v1/health\` | Diagnostic check for system status | No |\n`;
    md += `| \`POST\` | \`/api/v1/auth/register\` | Register a new user | No |\n`;
    md += `| \`POST\` | \`/api/v1/auth/login\` | Authenticate and obtain JWT token | No |\n`;
    md += `| \`GET\` | \`/api/v1/users/me\` | Fetch profile data of current user | **Yes** |\n`;
    md += `| \`GET\` | \`/api/v1/items\` | Query list of resource items (supports pagination) | No |\n`;
    md += `| \`POST\` | \`/api/v1/items\` | Create a new item resource | **Yes** |\n`;
    md += `| \`GET\` | \`/api/v1/items/:id\` | Fetch full details of specific item | No |\n`;
    md += `| \`PUT\` | \`/api/v1/items/:id\` | Update fields of specific item | **Yes** |\n`;
    md += `| \`DELETE\` | \`/api/v1/items/:id\` | Delete specific resource | **Yes** |\n\n`;

    md += `### Sample Response Payload\n\n`;
    md += `\`\`\`json\n{\n  "success": true,\n  "data": {\n    "id": "usr_92f8a1",\n    "email": "user@example.com",\n    "role": "member",\n    "createdAt": "2026-01-01T12:00:00Z"\n  },\n  "meta": {\n    "durationMs": 42\n  }\n}\n\`\`\`\n\n`;
  }

  // ── Testing ──
  if (testCmds.length > 0) {
    md += `## 🧪 Testing\n\n`;
    md += `We maintain comprehensive test coverages via automated unit, integration, and E2E testing systems.\n\n`;
    md += `### Run All Test Suites\n\n`;
    md += `\`\`\`bash\n${testCmds.join('\n')}\n\`\`\`\n\n`;

    if (stack.testing.has('Jest') || stack.testing.has('Vitest')) {
      md += `### JS/TS Testing Commands\n\n`;
      md += `\`\`\`bash\n# Run tests in hot-reloader watch mode\n${pmRun} test:watch\n\n# Generate interactive HTML code coverage report\n${pmRun} test:coverage\n\n# Execute specific test file\n${pmExec} ${stack.testing.has('Vitest') ? 'vitest' : 'jest'} path/to/spec.test.ts\n\`\`\`\n\n`;
    }
    if (stack.testing.has('pytest')) {
      md += `### Python Pytest Commands\n\n`;
      md += `\`\`\`bash\n# Run tests with verbose output\npytest -v\n\n# Generate HTML code coverage reports\npytest --cov=src --cov-report=html\n\n# Run specific test function\npytest tests/test_endpoints.py -k "test_login"\n\`\`\`\n\n`;
    }
    if (stack.testing.has('Cypress')) {
      md += `### Cypress E2E Commands\n\n`;
      md += `\`\`\`bash\n# Open Cypress desktop runner GUI\n${pmExec} cypress open\n\n# Run tests headless (production environment / CI)\n${pmExec} cypress run\n\`\`\`\n\n`;
    }
    if (stack.testing.has('Playwright')) {
      md += `### Playwright E2E Commands\n\n`;
      md += `\`\`\`bash\n# Execute Playwright automation suite\n${pmExec} playwright test\n\n# Run tests with UI inspector\n${pmExec} playwright test --ui\n\`\`\`\n\n`;
    }

    md += `### Testing Hierarchy\n\n`;
    md += `\`\`\`\ntests/\n├── unit/             # Testing single functions and business logic\n├── integration/      # Testing database controllers and services\n└── e2e/              # Automated user journeys simulating client actions\n\`\`\`\n\n`;
  }

  // ── Docker ──
  if (hasDocker || hasDC) {
    md += `## 🐳 Docker Containerization\n\n`;
    md += `We provide fully configured container solutions to enable zero-configuration setups.\n\n`;

    if (hasDC) {
      md += `### Bootup with Docker Compose\n\n`;
      md += `To start all stack services (databases, servers, caches) in local environment:\n\n`;
      md += `\`\`\`bash\n# Build images and start container logs in foreground\ndocker compose up --build\n\n# Start stack in detached background mode\ndocker compose up -d\n\n# Inspect active container logs\ndocker compose logs -f\n\n# Shutdown and tear down containers\ndocker compose down\n\`\`\`\n\n`;
    }

    md += `### Build Custom Production Image\n\n`;
    md += `\`\`\`bash\ndocker build -t ${owner}/${repo}:latest .\n\`\`\`\n\n`;

    md += `### Start Independent Container\n\n`;
    md += `\`\`\`bash\ndocker run -d \\\n  -p ${defaultPort}:${defaultPort} \\\n  --env-file .env \\\n  --name ${repo}-container \\\n  ${owner}/${repo}:latest\n\`\`\`\n\n`;
  }

  // ── Deployment ──
  md += `## 🌐 Production Deployment\n\n`;
  md += `The project is designed to run in standard containerized hosts, virtual servers, or serverless web platforms.\n\n`;

  if (isWebApp || isFullStack) {
    md += `### Frontend Deployment (Vercel & Netlify)\n\n`;
    md += `- **Vercel**: Connect your GitHub repository to Vercel and it will automatically deploy your main branch on every commit.\n`;
    md += `- **Netlify**: Deploy using Netlify CLI:\n`;
    md += `  \`\`\`bash\n  npm install -g netlify-cli\n  netlify deploy --prod\n  \`\`\`\n\n`;
  }

  if (isBackend || isFullStack) {
    md += `### Cloud Backend Hosts\n\n`;
    md += `- **Render**: Create a new Web Service on Render, connect your Git repo, set the runtime language, and add the build script and start commands.\n`;
    md += `- **Railway**: Link your repository on [Railway](https://railway.app) dashboard and configure the environment variables. Railway handles build steps automatically.\n\n`;
  }

  md += `### Standard Platforms & Serverless Guides\n\n`;
  md += `| Provider | Setup Resource |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **AWS Elastic Beanstalk** | [Deploying Node/Python Web Services on AWS](https://docs.aws.amazon.com/elasticbeanstalk/) |\n`;
  md += `| **Google Cloud Run** | [Serverless Deployments for Docker Containers](https://cloud.google.com/run/docs) |\n`;
  md += `| **DigitalOcean App Platform** | [Quickstart Guides for App Platform](https://docs.digitalocean.com/products/app-platform/) |\n\n`;

  // ── Project Structure ──
  const tree = buildDirectoryTree(paths, 3);
  if (tree) {
    md += `## 📂 Directory Structure\n\n`;
    md += `Below is a structural directory layout of the primary project files:\n\n`;
    md += `${tree}\n\n`;
    md += `#### Key Directories Explained\n\n`;
    md += `| Folder | Description |\n`;
    md += `| :--- | :--- | \n`;
    md += `| \`src/\` or \`lib/\` | Core application source code files |\n`;
    md += `| \`tests/\` or \`__tests__/\` | Unit, integration, and E2E test suites |\n`;
    md += `| \`config/\` | Configuration handlers, environment loaders, constants |\n`;
    if (isWebApp || isFullStack) {
      md += `| \`components/\` | Reusable user-interface visual components |\n`;
      md += `| \`public/\` | Static assets, logo files, and favicon files |\n`;
    }
    if (isBackend || isFullStack) {
      md += `| \`controllers/\` | Request entry orchestrators validating input payloads |\n`;
      md += `| \`models/\` | Database entities, schema validation tables, and queries |\n`;
      md += `| \`routes/\` | Endpoint pathway mappings linking verbs to controllers |\n`;
    }
    md += `\n---\n\n`;
  }

  // ── Troubleshooting FAQ ──
  md += `## ❓ Troubleshooting & FAQ\n\n`;
  md += `**Q: I receive a \`Port already in use\` exception on application boot.**\n`;
  md += `> **A**: The default port (e.g. ${defaultPort}) is likely occupied by another local service. Open your \`.env\` file and update the \`PORT\` variable to an unoccupied port (e.g. \`3005\` or \`8085\`).\n\n`;
  md += `**Q: Database connection errors or authentication failures occur during initialization.**\n`;
  md += `> **A**: Verify that your database server instance (e.g., PostgreSQL, MongoDB) is running locally or is accessible online. Double check the username, password, host, and port configurations in your \`.env\` file.\n\n`;
  md += `**Q: Missing dependencies or compile errors occur after pulling updates.**\n`;
  md += `> **A**: Run the package installation command corresponding to your environment (e.g. \`${fileContents['package.json'] ? `${pm} install` : `pip install -r requirements.txt`}\`) to sync any new requirements.\n\n`;
  md += `\n---\n\n`;

  // ── Roadmap ──
  md += `## 🗺️ Project Roadmap\n\n`;
  md += `- [x] **v1.0.0** — Release core functional specifications & base architectures.\n`;
  md += `- [ ] **v1.1.0** — Implement robust server-side caching (e.g., Redis layer).\n`;
  md += `- [ ] **v1.2.0** — Integrate OAuth 2.0 third-party authentication (Google/GitHub/Apple).\n`;
  md += `- [ ] **v2.0.0** — Perform platform localization & comprehensive internationalization (i18n).\n\n`;
  md += `\n---\n\n`;

  // ── Contributing ──
  md += `## 🤝 Contributing\n\n`;
  md += `Contributions are always welcome! Here's how you can help:\n\n`;
  md += `1. **Fork** the repository\n`;
  md += `2. **Create** a feature branch: \`git checkout -b feature/amazing-feature\`\n`;
  md += `3. **Commit** your changes: \`git commit -m 'Add some amazing feature'\`\n`;
  md += `4. **Push** to the branch: \`git push origin feature/amazing-feature\`\n`;
  md += `5. **Open** a Pull Request\n\n`;
  if (hasContrib) {
    md += `Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.\n\n`;
  }
  md += `> 💡 Make sure to update tests as appropriate and follow the existing code style.\n\n`;

  // ── License ──
  md += `## 📄 License\n\n`;
  if (license && license !== 'NOASSERTION') {
    md += `This project is licensed under the **${license} License**. See the [LICENSE](./LICENSE) file for details.\n\n`;
  } else {
    md += `This project is currently not licensed. Please contact the maintainer for usage rights.\n\n`;
  }

  // ── Footer ──
  md += `---\n\n`;
  md += `<div align="center">\n\n`;
  md += `Made with ❤️ by [${owner}](https://github.com/${owner}) &nbsp;·&nbsp; `;
  md += `⭐ Star this repo if you find it helpful!\n\n`;
  md += `</div>\n`;

  return md;
}

// ── Markdown to HTML renderer (lightweight) ─────────────────
function renderMarkdown(md) {
  let html = escapeForRendering(md);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<pre>${langLabel}<code>${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Images (badges)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="badge-img" loading="lazy" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables
  html = html.replace(
    /(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/gm,
    tableStr => {
      const rows = tableStr.trim().split('\n');
      const headers = rows[0].split('|').filter(c => c.trim());
      const dataRows = rows.slice(2).map(r => r.split('|').filter(c => c.trim()));
      let t = '<table><thead><tr>';
      headers.forEach(h => { t += `<th>${h.trim()}</th>`; });
      t += '</tr></thead><tbody>';
      dataRows.forEach(row => {
        t += '<tr>';
        row.forEach(cell => { t += `<td>${cell.trim()}</td>`; });
        t += '</tr>';
      });
      t += '</tbody></table>';
      return t;
    }
  );

  // Lists
  html = html.replace(/^(\s*)([-*+]) (.+)$/gm, '$1<li-ul>$3</li-ul>');
  html = html.replace(/^(\s*)(\d+)\. (.+)$/gm, '$1<li-ol>$3</li-ol>');
  html = html.replace(/(<li-ul>.*<\/li-ul>(\n)?)+/g, m => `<ul>${m.replace(/<li-ul>/g, '<li>').replace(/<\/li-ul>/g, '</li>')}</ul>`);
  html = html.replace(/(<li-ol>.*<\/li-ol>(\n)?)+/g, m => `<ol>${m.replace(/<li-ol>/g, '<li>').replace(/<\/li-ol>/g, '</li>')}</ol>`);

  // div align
  html = html.replace(/<div align="center">([\s\S]*?)<\/div>/gm, '<div style="text-align:center">$1</div>');

  // Paragraphs (lines not already in tags)
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  // Badge rows (consecutive img tags on same paragraph)
  html = html.replace(/<p>(<img[^>]+>(\s*<img[^>]+>)*)\s*<\/p>/g, '<div class="badge-row">$1</div>');

  // Clean up blank lines
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

function escapeForRendering(md) {
  // We preserve markdown syntax but escape HTML entities in non-code parts
  return md
    .replace(/&(?!(amp|lt|gt|quot|#);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── UI Functions ────────────────────────────────────────────
function showLoading() {
  hideAll();
  loadingState.classList.remove('hidden');
  generateBtn.disabled = true;
  // Reset steps
  ['step1','step2','step3','step4'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    el.querySelector('.step-dot').classList.remove('active', 'done');
  });
  setStep(1);
}

function setStep(n) {
  for (let i = 1; i < n; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.add('done');
    el.classList.remove('active');
    el.querySelector('.step-dot').classList.remove('active');
    el.querySelector('.step-dot').classList.add('done');
  }
  const el = document.getElementById(`step${n}`);
  if (el) {
    el.classList.add('active');
    el.querySelector('.step-dot').classList.add('active');
  }
  const labels = ['', 'Fetching repository info', 'Scanning file structure', 'Reading key files', 'Generating README...'];
  document.getElementById('loadingStep').textContent = labels[n] || '';
}

function showError(msg) {
  hideAll();
  errorState.classList.remove('hidden');
  errorMessage.textContent = msg;
  generateBtn.disabled = false;
}

function showResult(info, markdown) {
  hideAll();
  resultSection.classList.remove('hidden');
  generateBtn.disabled = false;

  // Stats bar
  const statsBar = document.getElementById('repoStatsBar');
  const lang = info.language || '';
  const stars = formatNum(info.stargazers_count);
  const forks = formatNum(info.forks_count);
  const watchers = formatNum(info.watchers_count);
  const updatedAt = new Date(info.updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  statsBar.innerHTML = `
    <div class="stat-item">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
      <strong>${info.full_name}</strong>
    </div>
    ${lang ? `<div class="stat-separator"></div><div class="stat-item"><span class="stat-badge">${lang}</span></div>` : ''}
    <div class="stat-separator"></div>
    <div class="stat-item">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      ${stars}
    </div>
    <div class="stat-item">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 3.314-2.686 6-6 6-3.314 0-6-2.686-6-6V9"/></svg>
      ${forks} forks
    </div>
    <div class="stat-item">Updated ${updatedAt}</div>
    <a href="${info.html_url}" target="_blank" rel="noopener" class="repo-link">
      View on GitHub ↗
    </a>
  `;

  // Render markdown preview
  document.getElementById('markdownPreview').innerHTML = renderMarkdown(markdown);
  document.getElementById('rawMarkdown').textContent = markdown;

  // Scroll to result
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideAll() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  resultSection.classList.add('hidden');
}

function resetUI() {
  hideAll();
  currentMarkdown = '';
  repoData = null;
  generateBtn.disabled = false;
  repoUrlInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchTab(tab) {
  const previewTab = document.getElementById('previewTab');
  const rawTab = document.getElementById('rawTab');

  if (tab === 'preview') {
    previewTab.classList.add('active');
    rawTab.classList.remove('active');
    previewPane.classList.remove('hidden');
    rawPane.classList.add('hidden');
  } else {
    rawTab.classList.add('active');
    previewTab.classList.remove('active');
    rawPane.classList.remove('hidden');
    previewPane.classList.add('hidden');
  }
}

async function copyMarkdown() {
  if (!currentMarkdown) return;
  const btn = document.getElementById('copyBtn');
  try {
    await navigator.clipboard.writeText(currentMarkdown);
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Copied!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy`;
    }, 2500);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = currentMarkdown;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function downloadMarkdown() {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'README.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

function formatApiError(err) {
  if (err.status === 404) return 'Repository not found. Make sure the URL is correct and the repository is public.';
  if (err.status === 403) return 'GitHub API rate limit exceeded (60 requests/hour for unauthenticated users). Please wait a few minutes and try again.';
  if (err.status === 451) return 'This repository is unavailable due to a legal reason.';
  if (err.message?.includes('NetworkError') || err.message?.includes('Failed to fetch')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  return `Unexpected error: ${err.message || 'Unknown error'}. Please try again.`;
}

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => { el.style.animation = ''; }, 400);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Inject shake keyframes
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}
.code-lang {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
`;
document.head.appendChild(shakeStyle);
