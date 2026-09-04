/* ============================================================
   ReadmeForge – Core Application Logic v4.0
   GitHub Public REST API + Google Gemini Flash AI
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
let currentMarkdown = '';
let repoData = null;
let isSplitView = false;

// ── UI References ──────────────────────────────────────────
const repoUrlInput  = document.getElementById('repoUrl');
const generateBtn   = document.getElementById('generateBtn');
const loadingState  = document.getElementById('loadingState');
const errorState    = document.getElementById('errorState');
const errorMessage  = document.getElementById('errorMessage');
const resultSection = document.getElementById('resultSection');
const previewPane   = document.getElementById('previewPane');
const rawPane       = document.getElementById('rawPane');
const inputBlock    = document.getElementById('inputBlock');

// ── API Key Management ──────────────────────────────────────
function getApiKey() {
  return localStorage.getItem('rf_gemini_key') || '';
}

function getSelectedModel() {
  const model = localStorage.getItem('rf_gemini_model');
  // Auto-migrate legacy or deprecated models
  if (!model || model === 'gemini-1.5-flash' || model === 'gemini-1.5-pro' || model === 'gemini-2.5-flash') {
    localStorage.setItem('rf_gemini_model', 'gemini-3.6-flash');
    return 'gemini-3.6-flash';
  }
  return model;
}

function saveModel() {
  const select = document.getElementById('modelSelect');
  if (select) {
    localStorage.setItem('rf_gemini_model', select.value);
    updateModeIndicator();
  }
}

function saveApiKey() {
  const input = document.getElementById('apiKeyInput');
  const key = (input.value || '').trim();
  if (key) {
    localStorage.setItem('rf_gemini_key', key);
    updateKeyStatus(true);
    updateModeIndicator();
    toggleSettings();
  } else {
    localStorage.removeItem('rf_gemini_key');
    updateKeyStatus(false);
    updateModeIndicator();
  }
}

function updateKeyStatus(hasKey) {
  const statusEl = document.getElementById('keyStatus');
  const settingsBtn = document.getElementById('settingsBtn');
  const input = document.getElementById('apiKeyInput');
  if (!statusEl) return;
  if (hasKey) {
    statusEl.textContent = 'API key saved — AI mode active';
    statusEl.className = 'settings-status set';
    if (settingsBtn) settingsBtn.classList.add('active');
    if (input) input.value = '';
  } else {
    statusEl.textContent = 'No key configured — will use template mode';
    statusEl.className = 'settings-status';
    if (settingsBtn) settingsBtn.classList.remove('active');
  }
}

function updateModeIndicator() {
  const el = document.getElementById('modeIndicator');
  const badge = document.getElementById('aiBadge');
  if (!el) return;
  const hasKey = !!getApiKey();
  if (hasKey) {
    const model = getSelectedModel();
    const modelLabels = {
      'gemini-3.6-flash': 'Gemini 3.6 Flash',
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gemini-2.5-pro': 'Gemini 2.5 Pro'
    };
    const modelLabel = modelLabels[model] || model;
    el.textContent = `AI mode active (${modelLabel})`;
    if (badge) badge.style.display = 'inline-flex';
  } else {
    el.textContent = 'Code-aware mode — reads actual source files';
    if (badge) badge.style.opacity = '0.4';
  }
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  const btn = document.getElementById('settingsBtn');
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (btn) {
    btn.setAttribute('aria-expanded', (!isOpen).toString());
  }
}

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('settingsPanel');
  const btn = document.getElementById('settingsBtn');
  if (panel && !panel.classList.contains('hidden')) {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }
});

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const key = getApiKey();
  updateKeyStatus(!!key);
  updateModeIndicator();
  if (key) {
    const input = document.getElementById('apiKeyInput');
    if (input) input.placeholder = '••••••••••••••••••••';
  }

  // Set model select dropdown
  const model = getSelectedModel();
  const select = document.getElementById('modelSelect');
  if (select) select.value = model;
});

// ── Notification Toast ──────────────────────────────────────
function showNotification(message, duration = 8000) {
  const toast = document.getElementById('notificationToast');
  const msgEl = document.getElementById('notificationMessage');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.style.visibility = 'visible';
  toast.style.opacity = '1';
  
  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    dismissNotification();
  }, duration);
}

function dismissNotification() {
  const toast = document.getElementById('notificationToast');
  if (!toast) return;
  toast.style.opacity = '0';
  toast.style.visibility = 'hidden';
}

// ── Keyboard shortcuts ──────────────────────────────────────
repoUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleGenerate();
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  if (e.key === 'Escape') {
    const panel = document.getElementById('settingsPanel');
    if (panel && !panel.classList.contains('hidden')) {
      toggleSettings();
    }
  }
});

function setExample(url) {
  repoUrlInput.value = url;
  repoUrlInput.focus();
}

// ── Main Entry Point ────────────────────────────────────────
async function handleGenerate() {
  const raw = repoUrlInput.value.trim();
  if (!raw) {
    shake(inputBlock);
    return;
  }

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
    setStep(1, 20);
    const repoInfo = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);

    setStep(2, 38);
    const treeData = await fetchFileTree(owner, repo, repoInfo.default_branch || 'main');

    setStep(3, 58);
    // Read config files AND source code entry points in parallel
    const [fileContents, sourceFiles] = await Promise.all([
      readKeyFiles(owner, repo, repoInfo.default_branch || 'main', treeData),
      readSourceFiles(owner, repo, repoInfo.default_branch || 'main', treeData),
    ]);

    // Extract code insights from source files
    const codeInsights = extractCodeInsights(sourceFiles);

    setStep(4, 78);

    let markdown;
    const apiKey = getApiKey();

    if (apiKey) {
      // Try AI generation with full context including source code
      try {
        markdown = await generateWithGemini(repoInfo, treeData, fileContents, sourceFiles, codeInsights, apiKey);
      } catch (aiErr) {
        const activeModel = getSelectedModel();
        const modelNames = { 'gemini-3.6-flash': 'Gemini 3.6 Flash', 'gemini-2.0-flash': 'Gemini 2.0 Flash', 'gemini-2.5-pro': 'Gemini 2.5 Pro' };
        const displayModel = modelNames[activeModel] || activeModel;
        showNotification(`AI generation failed (${displayModel}): ${aiErr.message}. Falling back to template mode README.`);
        markdown = buildReadme(repoInfo, treeData, fileContents, codeInsights, sourceFiles);
      }
    } else {
      markdown = buildReadme(repoInfo, treeData, fileContents, codeInsights, sourceFiles);
    }

    setStep(5, 100);
    await sleep(350);

    currentMarkdown = markdown;
    repoData = repoInfo;
    showResult(repoInfo, markdown);

  } catch (err) {
    const msg = formatApiError(err);
    showError(msg);
  }
}

// ── Gemini AI Integration ───────────────────────────────────
async function generateWithGemini(repoInfo, paths, fileContents, sourceFiles, codeInsights, apiKey) {
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;
  const stack = detectTechStack(paths, fileContents);
  const category = detectProjectCategory(repoInfo, paths, fileContents, stack);
  const license = detectLicense(fileContents, repoInfo);
  const badges = buildBadges(repoInfo, stack, license);

  // Compose a rich context for the AI
  const fileList = paths.slice(0, 100).join('\n');

  // Existing README gets a dedicated section — it's the highest-signal source
  const existingReadme = fileContents['README.md'] || fileContents['README.rst'] ||
                          fileContents['README.txt'] || fileContents['README'] || '';
  const readmeParsed = existingReadme ? parseExistingReadme(fileContents) : null;

  const keyFileSummary = Object.entries(fileContents)
    .filter(([name]) => !/^README/i.test(name)) // README gets its own section below
    .map(([name, content]) => `### ${name}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``)
    .join('\n\n');

  // Source code snippets — limited to keep token budget lean
  const sourceSummary = Object.entries(sourceFiles)
    .map(([name, content]) => `### ${name}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``)
    .join('\n\n');

  // Code insights summary
  const insightsSummary = [
    codeInsights.description ? `Extracted description: "${codeInsights.description}"` : '',
    codeInsights.classes.length ? `Classes found: ${codeInsights.classes.join(', ')}` : '',
    codeInsights.functions.length ? `Key functions: ${codeInsights.functions.slice(0, 12).join(', ')}` : '',
    codeInsights.routes.length ? `API routes detected: ${codeInsights.routes.join(', ')}` : '',
    codeInsights.imports.length ? `External imports: ${codeInsights.imports.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const stackSummary = [
    stack.languages.size ? `Languages: ${[...stack.languages].join(', ')}` : '',
    stack.frameworks.size ? `Frameworks: ${[...stack.frameworks].join(', ')}` : '',
    stack.tools.size ? `Tools/Libraries: ${[...stack.tools].join(', ')}` : '',
    stack.databases.size ? `Databases: ${[...stack.databases].join(', ')}` : '',
    stack.testing.size ? `Testing: ${[...stack.testing].join(', ')}` : '',
    stack.cicd.size ? `CI/CD: ${[...stack.cicd].join(', ')}` : '',
    stack.packageManager ? `Package Manager: ${stack.packageManager}` : '',
  ].filter(Boolean).join('\n');

  const installCmds = getInstallCommands(repoInfo, fileContents, stack);
  const runCmds = getRunCommands(fileContents, stack);
  const testCmds = getTestCommands(fileContents, stack);
  const acks = buildAcknowledgements(stack, repoInfo);

  const hasDocker = paths.some(p => p === 'Dockerfile' || p.startsWith('Dockerfile.'));
  const hasDC = paths.some(p => p.includes('docker-compose'));
  const hasContrib = paths.some(p => /CONTRIBUTING/i.test(p));
  const topics = repoInfo.topics || [];
  const projectEmoji = getProjectEmoji(category);

    const prompt = `You are an expert developer writing a professional README.md for a GitHub repository.
Your goal is to produce a genuinely helpful, accurate, and well-structured README that sounds like it was written by the project's own development team — not generated by AI. Be specific, technical, and precise. Do NOT include generic filler sentences, generic boilerplate, or obvious placeholder text.

CRITICAL RULE: You MUST base the Overview, Features, and all descriptive content primarily on the actual repository files provided below. Read the source code, config files, and existing README carefully to understand what this project ACTUALLY does. Do NOT describe the language or framework generically — describe what THIS specific project does with them.

## Repository Metadata

**Repo:** ${owner}/${repo}
**Full Name:** ${repoInfo.full_name}
**GitHub Description:** ${repoInfo.description || 'Not provided'}
**Primary Language:** ${repoInfo.language || 'Unknown'}
**Stars:** ${repoInfo.stargazers_count} | **Forks:** ${repoInfo.forks_count}
**Topics:** ${topics.length ? topics.join(', ') : 'None'}
**Homepage:** ${repoInfo.homepage || 'None'}
**License:** ${license || 'Not specified'}
**Clone URL:** ${repoInfo.clone_url}
**Project Category:** ${category}

## ⭐ EXISTING REPOSITORY README (HIGHEST PRIORITY — This tells you what the project actually does)
${existingReadme
  ? existingReadme.slice(0, 6000)
  : 'No existing README found — you MUST infer the project purpose from the source code and config files below.'}

## Detected Tech Stack
${stackSummary || 'Could not detect specific stack'}

## File Structure (top 100 files)
${fileList}

## Key Configuration Files
${keyFileSummary || 'None found'}

## Source Code Entry Points (READ CAREFULLY — this is the actual code)
${sourceSummary || 'None found'}

## Code Insights (auto-extracted from source)
${insightsSummary || 'Could not extract insights'}

## Pre-computed Data
**Shields.io Badges (include these exactly):**
${badges.join('\n')}

**Install Commands:**
${installCmds.join('\n')}

**Run Commands:**
${runCmds.map(c => `${c.label}: ${c.cmd}`).join('\n') || 'Not detected'}

**Test Commands:**
${testCmds.join('\n') || 'Not detected'}

**Has Docker:** ${hasDocker} | **Has docker-compose:** ${hasDC}
**Has CONTRIBUTING.md:** ${hasContrib}

**Acknowledgements:**
${acks ? acks.join('\n') : 'None'}

---

## Instructions

Write a complete, production-quality README.md in **GitHub Flavored Markdown**. Follow these rules strictly:

1. **Start with** a centered header block:
   - \`<div align="center">\` wrapping: H1 title with the emoji ${projectEmoji}, a one-line italic description, all badges on one line, and three links: [View Demo] [Report Bug] [Request Feature]
   - Close with \`</div>\`
   - Then \`---\`

2. **Table of Contents** — Use the actual sections you include. Link format: \`[Section Name](#section-name)\`

3. **Overview** — Write a comprehensive, multi-paragraph overview (at least 2 paragraphs) that clearly explains what this project does, who it's for, and why it exists. Detail its unique value proposition, architecture summary, and key goals. Do NOT start with "This project is..." or use generic templates.

4. **Features** — 5–7 detailed, specific bullet points drawn from the actual tech stack, file structure, and scanned code. Format: \`- **Bold title** — Detailed multi-sentence description explaining what this feature does, how it is implemented technically, and which tools/languages it leverages.\`. Reference real technologies detected. Absolutely no generic or speculative features.

5. **Tech Stack** — A markdown table with columns: Category | Technology | Purpose. **One row per technology** — do NOT lump multiple technologies into a single cell. Each row must have a specific, accurate, and detailed Purpose description for that exact technology.

6. **Architecture** (only for api/fullstack categories, and ONLY if enough architectural context is present in scanned source files) — A short ASCII diagram showing how components connect.

7. **Getting Started** → Prerequisites (with version requirements and links) → Installation:
   - For pure static HTML/CSS/JS repos (no package.json, no build step): show **Option 1** (open directly in browser with platform-specific commands) and **Option 2** (serve locally with \`python -m http.server\` / \`npx serve\`).
   - For all other repos: numbered steps (**1. Clone** → **2. Install** → etc.) with code blocks.

8. **Configuration** (only if database/auth/API dependencies detected or env variables are referenced in source files) — .env table: Variable | Description | Default | Required. Do NOT include generic env vars unless they are found in source files/docs.

9. **Usage** — Write as **detailed, numbered steps** (not bare commands). Each step must have a clear label, a brief explanatory paragraph, and a fenced code block showing a realistic command or API call. Show how to use/interact with *this specific repository*, based on its scanned entry points and CLI/web interface. Do NOT write instructions for ReadmeForge itself.

10. **Testing** (only if test commands detected) — Show the commands.

11. **API Reference** — Only include this if actual API routes are detected in the code insights. Do NOT generate a skeleton endpoint table with generic endpoints (like /auth/login) unless those endpoints are actually detected in the source code.

12. **Docker** (only if Dockerfile found) — docker compose and docker run commands.

13. **Deployment** — 1–2 specific platform recommendations based on the tech stack.

14. **Project Structure** — A compact directory tree (max 20 lines, depth 2–3), followed by a **File Responsibilities** table:
    - Columns: File | Role
    - One row per key file detected (e.g. \`index.html\`, \`app.js\`, \`style.css\`, \`package.json\`, \`Dockerfile\`)
    - Each Role must be a deep, 2-to-3 sentence technical description of what that exact file does, its role in the overall architecture, and how it communicates with other files.

15. **Troubleshooting** — Use GitHub \`<details>\`/\`<summary>\` collapsible blocks. Include 3–4 realistic technical troubleshooting steps specific to the repository's tech stack (e.g., Python venv activation, Node peer dependencies, Docker networking). Do NOT include ReadmeForge-specific troubleshooting items (such as GitHub rate limits, unauthenticated API limits, or repository-not-found errors). End with a \`> [!TIP]\` alert linking to the issues page.

16. **Roadmap** — 4–6 realistic future items for this repository using GitHub task list syntax: \`- [x]\` for done, \`- [ ]\` for planned. Do not make up generic features; base them on topics or typical extensions of this technology.

17. **Contributing** — Standard fork/branch/PR workflow.

18. **License** — One line referencing the detected license.

19. **Footer** — \`<div align="center">\`Made with ❤️ by [${owner}](https://github.com/${owner})\`</div>\`

**Critical rules:**
- Use real data from the context. No placeholders like "[Your project name]" or "[Add description here]".
- Code blocks must have language tags (e.g. \`\`\`bash, \`\`\`json).
- GitHub Alerts syntax: \`> [!NOTE]\`, \`> [!WARNING]\`, etc.
- Do NOT include any preamble, explanation, or text outside the README content itself.
- Return ONLY the raw Markdown content. Start immediately with \`<div align="center">\`.`;


  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${getSelectedModel()}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 16384,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 400) throw new Error(`Gemini API error: Invalid API key or bad request.`);
    if (response.status === 429) throw new Error(`Gemini API quota exceeded. Try again in a moment.`);
    throw new Error(`Gemini API error ${response.status}: ${errData?.error?.message || 'Unknown'}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('Gemini returned empty response.');

  return text.trim();
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
    // README first — most informative for understanding project purpose
    'README.md', 'README.rst', 'README.txt', 'README',
    // Package manifests
    'package.json', 'pyproject.toml', 'setup.py', 'setup.cfg',
    'requirements.txt', 'Cargo.toml', 'go.mod', 'composer.json',
    'pom.xml', 'build.gradle', 'build.gradle.kts',
    'Gemfile', 'mix.exs', 'pubspec.yaml',
    'Makefile', 'CMakeLists.txt', 'CONTRIBUTING.md',
    'LICENSE', 'LICENSE.md', 'LICENSE.txt',
    '.github/workflows', 'docker-compose.yml', 'Dockerfile',
    'CHANGELOG.md', 'CHANGELOG', 'HISTORY.md',
    'SECURITY.md', '.eslintrc.js', '.eslintrc.json',
    'tsconfig.json', 'tailwind.config.js', 'vite.config.js',
    'next.config.js', 'webpack.config.js',
  ];

  const toRead = priority.filter(p =>
    allPaths.some(f => f === p || f.startsWith(p + '/'))
  ).slice(0, 16);

  const results = {};

  await Promise.allSettled(
    toRead.map(async filePath => {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
        );
        if (res.ok) {
          const text = await res.text();
          // Capture more of README (up to 12000 chars) for richer context
          const limit = /^README/i.test(filePath) ? 12000 : 8000;
          results[filePath] = text.slice(0, limit);
        }
      } catch { /* skip */ }
    })
  );

  return results;
}

// ── Source Code Reader ─────────────────────────────────────
// Reads actual source code entry points to understand what the project does.
// Caps each file at 3000 chars to stay token-efficient while reading more content.
async function readSourceFiles(owner, repo, branch, allPaths) {
  // Priority-ordered candidates for entry point detection
  const candidates = [
    // Python
    'main.py', 'app.py', 'run.py', 'cli.py', 'server.py', '__main__.py',
    'src/main.py', 'src/app.py', 'src/__init__.py',
    // JS / TS
    'index.js', 'index.ts', 'src/index.ts', 'src/index.js',
    'src/main.ts', 'src/main.js', 'src/app.ts', 'src/app.js',
    'app.js', 'app.ts', 'server.js', 'server.ts',
    // Go
    'main.go', 'cmd/main.go', 'cmd/root.go',
    // Rust
    'src/main.rs', 'src/lib.rs',
    // Ruby
    'lib/main.rb', 'app.rb', 'bin/main',
    // Java / Kotlin
    'src/main/java', // dir — will match first .java in it
    // Shell
    'install.sh', 'run.sh', 'start.sh', 'main.sh',
    // C/C++
    'main.c', 'main.cpp', 'src/main.cpp',
    // HTML (for pure frontend repos)
    'index.html',
  ];

  // Match exact files first, then try prefix matching for directories
  const toRead = [];
  const seen = new Set();
  for (const c of candidates) {
    const exact = allPaths.find(f => f === c);
    if (exact && !seen.has(exact)) { seen.add(exact); toRead.push(exact); continue; }
    // Java: find first file under src/main/java
    if (c === 'src/main/java') {
      const javaFile = allPaths.find(f => f.startsWith('src/main/java') && f.endsWith('.java'));
      if (javaFile && !seen.has(javaFile)) { seen.add(javaFile); toRead.push(javaFile); }
    }
  }

  // Fallback 1: any source file inside src/
  if (toRead.length < 2) {
    const srcFiles = allPaths.filter(f =>
      /^src\/.*\.(py|ts|js|go|rs|rb|java|kt|ex|exs|c|cpp|cs|swift)$/.test(f) &&
      !seen.has(f)
    ).slice(0, 3);
    srcFiles.forEach(f => { seen.add(f); toRead.push(f); });
  }

  // Fallback 2: any source file at the repo root level
  if (toRead.length < 2) {
    const rootFiles = allPaths.filter(f =>
      !f.includes('/') &&
      /\.(py|ts|js|go|rs|rb|java|kt|ex|exs|c|cpp|cs|swift|sh)$/.test(f) &&
      !seen.has(f)
    ).slice(0, 3);
    rootFiles.forEach(f => { seen.add(f); toRead.push(f); });
  }

  // Fallback 3: any non-vendor source file anywhere
  if (toRead.length === 0) {
    const anyFile = allPaths.find(f =>
      /^(?!node_modules|dist|build|vendor|\.).*\.(py|ts|js|go|rs)$/.test(f)
    );
    if (anyFile) toRead.push(anyFile);
  }

  const sourceFiles = {};
  const MAX_SRC = 8; // Read more files for better coverage

  await Promise.allSettled(
    toRead.slice(0, MAX_SRC).map(async filePath => {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
        );
        if (res.ok) {
          const text = await res.text();
          sourceFiles[filePath] = text.slice(0, 3000);
        }
      } catch { /* skip */ }
    })
  );

  return sourceFiles;
}

// ── Code Insights Extractor ────────────────────────────────
// Parses source files to extract meaningful signals without sending all the code.
function extractCodeInsights(sourceFiles) {
  const insights = {
    functions: [],
    classes: [],
    routes: [],
    imports: new Set(),
    description: '',
    entryPoints: Object.keys(sourceFiles),
  };

  for (const [filePath, content] of Object.entries(sourceFiles)) {
    const lines = content.split('\n');

    // Extract Python functions / classes
    lines.forEach(line => {
      const fnMatch = line.match(/^def ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (fnMatch && !fnMatch[1].startsWith('_')) insights.functions.push(fnMatch[1]);

      const classMatch = line.match(/^class ([A-Z][a-zA-Z0-9_]*)/);
      if (classMatch) insights.classes.push(classMatch[1]);

      // JS/TS functions
      const jsFn = line.match(/(?:function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(?:async\s*)?(?:\([^)]*\)|[^=]+)\s*=>|\()/);
      if (jsFn && jsFn[1] && !/^(const|let|var|if|for|while)$/.test(jsFn[1])) insights.functions.push(jsFn[1]);

      // Routes (Flask/FastAPI/Express)
      const routeMatch = line.match(/@(?:app|router|blueprint)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/);
      if (routeMatch) insights.routes.push(`${routeMatch[1].toUpperCase()} ${routeMatch[2]}`);

      const expressRoute = line.match(/(?:app|router)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/);
      if (expressRoute) insights.routes.push(`${expressRoute[1].toUpperCase()} ${expressRoute[2]}`);

      // Imports
      const pyImport = line.match(/^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/);
      if (pyImport) insights.imports.add(pyImport[1].split('.')[0]);

      const jsImport = line.match(/(?:import|require).*?['"]([^'"./][^'"]*)['"]/);
      if (jsImport) insights.imports.add(jsImport[1].split('/')[0]);
    });

    // Extract docstrings / top comments as description — try multiple patterns
    if (!insights.description) {
      // Python triple-quote docstring (""" or ''')
      const pyDoc = content.match(/^\s*['"`]{3}([\s\S]{10,500}?)['"`]{3}/m);
      if (pyDoc) {
        const desc = pyDoc[1].trim().replace(/\n\s*/g, ' ').slice(0, 250);
        if (desc.length > 10) { insights.description = desc; }
      }
      // Block comment /** ... */ or /* ... */
      if (!insights.description) {
        const blockDoc = content.match(/\/\*[*!]?\s*([\s\S]{10,600}?)\*\//);
        if (blockDoc) {
          const desc = blockDoc[1].replace(/^\s*\*+\s*/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);
          if (desc.length > 10) { insights.description = desc; }
        }
      }
      // Leading # or // comments (first 5 meaningful comment lines)
      if (!insights.description) {
        const commentLines = content.split('\n').slice(0, 20)
          .filter(l => /^\s*(#[^!]|\/\/[^/!])/.test(l))
          .map(l => l.replace(/^\s*(#|\/\/)+\s*/, '').trim())
          .filter(l => l.length > 15 && !/^(coding|copyright|license|author|version|date|todo|fixme|eslint|@)/i.test(l))
          .slice(0, 4);
        if (commentLines.length > 0) {
          const desc = commentLines.join(' ').slice(0, 250);
          if (desc.length > 15) { insights.description = desc; }
        }
      }
    }
  }

  // Deduplicate
  insights.functions = [...new Set(insights.functions)].slice(0, 20);
  insights.classes = [...new Set(insights.classes)].slice(0, 10);
  insights.routes = [...new Set(insights.routes)].slice(0, 12);
  insights.imports = [...insights.imports].slice(0, 20);

  return insights;
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
    '.lua': 'Lua', '.nim': 'Nim', '.zig': 'Zig',
  };

  const extCount = {};
  paths.forEach(p => {
    const m = p.match(/\.[a-zA-Z0-9]+$/);
    if (m) {
      const lang = extMap[m[0].toLowerCase()] || extMap[m[0]];
      if (lang) extCount[lang] = (extCount[lang] || 0) + 1;
    }
  });

  Object.entries(extCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([lang]) => stack.languages.add(lang));

  stack.mainLanguage = Object.entries(extCount).sort((a, b) => b[1] - a[1])[0]?.[0];

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
      if (deps.hono)                                  stack.frameworks.add('Hono');
      if (deps['@solidjs/start'] || deps['solid-js']) stack.frameworks.add('SolidJS');
      if (deps['@remix-run/react'])                   stack.frameworks.add('Remix');
      if (deps['astro'])                              stack.frameworks.add('Astro');
      if (deps.tailwindcss)                           stack.tools.add('Tailwind CSS');
      if (deps.typescript || deps['@types/node'])     stack.tools.add('TypeScript');
      if (deps.webpack)                               stack.tools.add('Webpack');
      if (deps.vite)                                  stack.tools.add('Vite');
      if (deps.esbuild)                               stack.tools.add('esbuild');
      if (deps.prisma || deps['@prisma/client'])      stack.databases.add('Prisma ORM');
      if (deps.mongoose)                              stack.databases.add('MongoDB');
      if (deps.pg)                                    stack.databases.add('PostgreSQL');
      if (deps.mysql || deps.mysql2)                  stack.databases.add('MySQL');
      if (deps.redis || deps.ioredis)                 stack.databases.add('Redis');
      if (deps.drizzle)                               stack.databases.add('Drizzle ORM');
      if (deps.jest)                                  stack.testing.add('Jest');
      if (deps.mocha)                                 stack.testing.add('Mocha');
      if (deps.vitest)                                stack.testing.add('Vitest');
      if (deps.cypress)                               stack.testing.add('Cypress');
      if (deps.playwright || deps['@playwright/test']) stack.testing.add('Playwright');
      if (deps['@testing-library/react'])             stack.testing.add('Testing Library');
      if (deps.graphql)                               stack.tools.add('GraphQL');
      if (deps['socket.io'])                          stack.tools.add('Socket.IO');
      if (deps['@supabase/supabase-js'])              stack.databases.add('Supabase');
      if (deps.firebase)                              stack.databases.add('Firebase');
      if (deps['@trpc/server'])                       stack.tools.add('tRPC');
      if (deps.zod)                                   stack.tools.add('Zod');
      if (deps['openai'])                             stack.tools.add('OpenAI API');
      if (deps['@anthropic-ai/sdk'])                  stack.tools.add('Anthropic API');
      if (deps.stripe)                                stack.tools.add('Stripe');
      if (deps['shadcn-ui'] || deps['@radix-ui/react-dialog']) stack.tools.add('shadcn/ui');
      if (deps['lucide-react'] || deps['@heroicons/react']) stack.tools.add('Icon Library');
      if (deps['framer-motion'])                      stack.tools.add('Framer Motion');
      if (deps.jsonwebtoken || deps['jose'] || deps['@auth/core']) stack.tools.add('JWT Auth');
      if (deps['next-auth'] || deps['passport'] || deps['@auth/core']) stack.tools.add('OAuth/Auth');
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
    if (/django/i.test(pyFiles))           stack.frameworks.add('Django');
    if (/flask/i.test(pyFiles))            stack.frameworks.add('Flask');
    if (/fastapi/i.test(pyFiles))          stack.frameworks.add('FastAPI');
    if (/aiohttp/i.test(pyFiles))          stack.frameworks.add('aiohttp');
    if (/litestar/i.test(pyFiles))         stack.frameworks.add('Litestar');
    if (/sqlalchemy/i.test(pyFiles))       stack.databases.add('SQLAlchemy');
    if (/psycopg2/i.test(pyFiles))         stack.databases.add('PostgreSQL');
    if (/pymongo/i.test(pyFiles))          stack.databases.add('MongoDB');
    if (/redis/i.test(pyFiles))            stack.databases.add('Redis');
    if (/pytest/i.test(pyFiles))           stack.testing.add('pytest');
    if (/celery/i.test(pyFiles))           stack.tools.add('Celery');
    if (/pydantic/i.test(pyFiles))         stack.tools.add('Pydantic');
    if (/numpy/i.test(pyFiles))            stack.tools.add('NumPy');
    if (/pandas/i.test(pyFiles))           stack.tools.add('Pandas');
    if (/torch/i.test(pyFiles))            stack.tools.add('PyTorch');
    if (/tensorflow|keras/i.test(pyFiles)) stack.tools.add('TensorFlow');
    if (/scikit/i.test(pyFiles))           stack.tools.add('scikit-learn');
    if (/openai/i.test(pyFiles))           stack.tools.add('OpenAI API');
    if (/langchain/i.test(pyFiles))        stack.tools.add('LangChain');
    if (/alembic/i.test(pyFiles))          stack.tools.add('Alembic');
    if (/uvicorn/i.test(pyFiles))          stack.tools.add('Uvicorn');
  }

  // Rust
  if (fileContents['Cargo.toml']) {
    stack.runtime = 'Rust';
    const cargo = fileContents['Cargo.toml'];
    if (/tokio/i.test(cargo))    stack.frameworks.add('Tokio');
    if (/axum/i.test(cargo))     stack.frameworks.add('Axum');
    if (/actix/i.test(cargo))    stack.frameworks.add('Actix-web');
    if (/warp/i.test(cargo))     stack.frameworks.add('Warp');
    if (/serde/i.test(cargo))    stack.tools.add('Serde');
    if (/diesel/i.test(cargo))   stack.databases.add('Diesel ORM');
    if (/sqlx/i.test(cargo))     stack.databases.add('SQLx');
    if (/clap/i.test(cargo))     stack.tools.add('Clap CLI');
    if (/tauri/i.test(cargo))    stack.frameworks.add('Tauri');
  }

  // Go
  if (fileContents['go.mod']) {
    stack.runtime = 'Go';
    const gomod = fileContents['go.mod'];
    if (/gin-gonic|gin/i.test(gomod)) stack.frameworks.add('Gin');
    if (/echo/i.test(gomod))          stack.frameworks.add('Echo');
    if (/fiber/i.test(gomod))         stack.frameworks.add('Fiber');
    if (/chi/i.test(gomod))           stack.frameworks.add('Chi');
    if (/gorm/i.test(gomod))          stack.databases.add('GORM');
    if (/cobra/i.test(gomod))         stack.tools.add('Cobra CLI');
  }

  // JVM
  if (fileContents['pom.xml'] || fileContents['build.gradle'] || fileContents['build.gradle.kts']) {
    const jvmFiles = [fileContents['pom.xml'], fileContents['build.gradle'], fileContents['build.gradle.kts']].filter(Boolean).join('\n');
    if (/spring/i.test(jvmFiles))     stack.frameworks.add('Spring Boot');
    if (/junit/i.test(jvmFiles))      stack.testing.add('JUnit');
    if (/hibernate/i.test(jvmFiles))  stack.databases.add('Hibernate ORM');
  }

  // Docker / CI/CD
  if (paths.some(p => p === 'Dockerfile' || p.startsWith('Dockerfile.'))) stack.tools.add('Docker');
  if (paths.some(p => p === 'docker-compose.yml' || p === 'docker-compose.yaml')) stack.tools.add('Docker Compose');
  if (paths.some(p => p.includes('.github/workflows'))) stack.cicd.add('GitHub Actions');
  if (paths.some(p => p.includes('.travis.yml')))       stack.cicd.add('Travis CI');
  if (paths.some(p => p.includes('.circleci')))         stack.cicd.add('CircleCI');
  if (paths.some(p => p.includes('vercel.json') || p.includes('.vercel'))) stack.tools.add('Vercel');
  if (paths.some(p => p === 'Makefile'))                stack.tools.add('Make');
  if (paths.some(p => p === 'pubspec.yaml'))            { stack.frameworks.add('Flutter'); stack.runtime = 'Dart'; }
  if (paths.some(p => /\.github\/ISSUE_TEMPLATE/i.test(p))) stack.tools.add('Issue Templates');
  if (paths.some(p => /\.github\/PULL_REQUEST_TEMPLATE/i.test(p))) stack.tools.add('PR Template');

  return stack;
}

// ── Project Category Detection ──────────────────────────────
function detectProjectCategory(repoInfo, paths, fileContents, stack) {
  const topics = repoInfo.topics || [];
  const description = (repoInfo.description || '').toLowerCase();
  const name = (repoInfo.name || '').toLowerCase();

  if (stack.frameworks.has('Flutter') || stack.frameworks.has('React Native') ||
      stack.languages.has('Swift') || stack.languages.has('Kotlin') ||
      paths.some(p => p.includes('android/') || p.includes('ios/'))) {
    return 'mobile';
  }

  if (stack.tools.has('PyTorch') || stack.tools.has('TensorFlow') || stack.tools.has('scikit-learn') ||
      stack.tools.has('NumPy') || stack.tools.has('Pandas') || stack.tools.has('LangChain') ||
      stack.tools.has('OpenAI API') || stack.tools.has('Anthropic API') ||
      topics.some(t => ['ml', 'ai', 'machine-learning', 'deep-learning', 'llm', 'nlp'].includes(t)) ||
      /machine.learning|deep.learning|neural|ml|ai|llm|nlp/i.test(description)) {
    return 'ml_ai';
  }

  if (stack.frameworks.has('Electron') || stack.frameworks.has('Tauri')) return 'desktop';

  if (topics.some(t => ['cli', 'command-line', 'terminal', 'shell-script'].includes(t)) ||
      stack.tools.has('Cobra CLI') || stack.tools.has('Clap CLI') ||
      /command.line|cli tool|terminal/i.test(description) ||
      (name.includes('cli') || name.endsWith('-cli'))) {
    return 'cli';
  }

  const isLibrary = (topics.some(t => ['library', 'package', 'sdk', 'npm', 'module', 'plugin'].includes(t)) ||
    /library|package|sdk|plugin|module|component/i.test(description) ||
    (fileContents['package.json'] && (() => {
      try {
        const pkg = JSON.parse(fileContents['package.json']);
        return pkg.main || pkg.exports || (pkg.files && !pkg.scripts?.dev);
      } catch { return false; }
    })()));

  if (isLibrary) return 'library';

  if (paths.some(p => p === 'manifest.json') &&
      paths.some(p => p.includes('background') || p.includes('content_script') || p.includes('popup'))) {
    return 'browser_extension';
  }

  const hasUI = stack.frameworks.has('React') || stack.frameworks.has('Next.js') ||
                 stack.frameworks.has('Vue.js') || stack.frameworks.has('Nuxt.js') ||
                 stack.frameworks.has('Angular') || stack.frameworks.has('Svelte') ||
                 stack.frameworks.has('SolidJS') || stack.frameworks.has('Remix') ||
                 stack.frameworks.has('Astro') || stack.languages.has('HTML');

  const hasBackend = stack.frameworks.has('Express.js') || stack.frameworks.has('Fastify') ||
                     stack.frameworks.has('NestJS') || stack.frameworks.has('Koa') ||
                     stack.frameworks.has('Django') || stack.frameworks.has('Flask') ||
                     stack.frameworks.has('FastAPI') || stack.frameworks.has('Spring Boot') ||
                     stack.frameworks.has('Gin') || stack.frameworks.has('Echo') ||
                     stack.frameworks.has('Axum') || stack.frameworks.has('Fiber') ||
                     stack.databases.size > 0;

  if (hasUI && hasBackend) return 'fullstack';
  if (hasUI) return 'webapp';
  if (hasBackend) return 'api';

  if (paths.some(p => /mkdocs|docusaurus|jekyll|gatsby|hugo|11ty/i.test(p))) return 'docs_site';
  if (paths.every(p => /\.md$|\.txt$|\.rst$/i.test(p))) return 'docs';

  return 'generic';
}

// ── Installation Commands ───────────────────────────────────
function getInstallCommands(repoInfo, fileContents, stack) {
  const sections = [];
  const repo = repoInfo.name;

  sections.push(`git clone ${repoInfo.clone_url}`);
  sections.push(`cd ${repo}`);

  if (fileContents['package.json']) {
    const pm = stack.packageManager || 'npm';
    sections.push(pm === 'Yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : pm === 'Bun' ? 'bun install' : 'npm install');
  }
  if (fileContents['requirements.txt']) sections.push('pip install -r requirements.txt');
  if (fileContents['pyproject.toml'] && !fileContents['requirements.txt']) sections.push('pip install -e .');
  if (fileContents['Cargo.toml']) sections.push('cargo build');
  if (fileContents['go.mod']) sections.push('go mod download');
  if (fileContents['Gemfile']) sections.push('bundle install');
  if (fileContents['composer.json']) sections.push('composer install');
  if (fileContents['pubspec.yaml']) sections.push('flutter pub get');

  return sections;
}

// ── Run Commands ────────────────────────────────────────────
function getRunCommands(fileContents, stack) {
  const cmds = [];

  if (fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      const scripts = pkg.scripts || {};
      const pm = stack.packageManager || 'npm';
      const run = pm === 'Yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'Bun' ? 'bun run' : 'npm run';
      const start = pm === 'Yarn' ? 'yarn start' : pm === 'pnpm' ? 'pnpm start' : pm === 'Bun' ? 'bun start' : 'npm start';

      if (scripts.dev)   cmds.push({ label: 'Development server', cmd: `${run} dev` });
      if (scripts.start) cmds.push({ label: 'Production', cmd: start });
      if (scripts.build) cmds.push({ label: 'Build for production', cmd: `${run} build` });
      if (scripts.preview) cmds.push({ label: 'Preview production build', cmd: `${run} preview` });
    } catch { /* */ }
  }

  if (fileContents['pyproject.toml'] || fileContents['requirements.txt']) {
    if (stack.frameworks.has('FastAPI')) {
      cmds.push({ label: 'Start server', cmd: 'uvicorn app.main:app --reload' });
    } else if (stack.frameworks.has('Flask')) {
      cmds.push({ label: 'Start server', cmd: 'flask run --debug' });
    } else if (stack.frameworks.has('Django')) {
      cmds.push({ label: 'Run migrations', cmd: 'python manage.py migrate' });
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
    cmds.push({ label: 'Run on connected device', cmd: 'flutter run' });
    cmds.push({ label: 'Build Android APK', cmd: 'flutter build apk --release' });
  }

  return cmds;
}

// ── Test Commands ────────────────────────────────────────────
function getTestCommands(fileContents, stack) {
  const cmds = [];
  const pm = stack.packageManager || 'npm';
  const run = pm === 'Yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'Bun' ? 'bun run' : 'npm run';

  if (stack.testing.has('Jest') || stack.testing.has('Vitest') || stack.testing.has('Testing Library')) {
    cmds.push(`${run} test`);
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
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        cmds.push(`${run} test`);
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
  if (/Apache License.*2\.0/i.test(licenseFile)) return 'Apache-2.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(licenseFile)) return /Version 3/.test(licenseFile) ? 'GPL-3.0' : 'GPL-2.0';
  if (/BSD/i.test(licenseFile)) return 'BSD-3-Clause';
  if (/ISC License/i.test(licenseFile)) return 'ISC';
  if (/Mozilla Public License/i.test(licenseFile)) return 'MPL-2.0';
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

// ── Parse Existing README ────────────────────────────────────
// Extracts meaningful paragraphs from an existing README to seed
// the generated output with repo-specific purpose & context.
function parseExistingReadme(fileContents) {
  const raw = fileContents['README.md'] || fileContents['README.rst'] ||
               fileContents['README.txt'] || fileContents['README'] || '';
  if (!raw || raw.length < 40) return null;

  // Strip HTML tags, badges (shield.io image lines), and heading hashes
  const cleaned = raw
    .replace(/<[^>]+>/g, '')              // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Markdown images/badges
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // Keep link text, drop URLs
    .replace(/^#{1,6}\s+/gm, '')          // Strip heading hashes
    .replace(/^\s*[-*>]\s*/gm, '')        // Strip list/blockquote markers
    .replace(/`{1,3}[^`]*`{1,3}/g, '')   // Inline code
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // Bold/italic
    .replace(/\n{3,}/g, '\n\n')           // Collapse excess newlines
    .trim();

  // Collect non-trivial paragraphs (> 60 chars)
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p =>
      p.length > 60 &&
      !/^(table of contents|toc|installation|usage|contributing|license|getting started|prerequisites|quick start|features|tech stack|acknowledgements)/i.test(p)
    );

  if (paragraphs.length === 0) return null;

  return {
    // First meaningful paragraph as the one-liner description
    headline: paragraphs[0].slice(0, 300),
    // Up to 3 paragraphs for the Overview section
    overview: paragraphs.slice(0, 3).join('\n\n'),
    // Raw truncated README for AI context
    raw: raw.slice(0, 6000),
  };
}

// ── Smart Description ────────────────────────────────────────
function buildSmartDescription(repoInfo, fileContents, projectCategory, stack, sourceFiles = {}) {
  // Priority 1: GitHub repo description
  let base = repoInfo.description || '';

  // Priority 2: package.json / manifest description fields
  if (!base && fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      if (pkg.description) base = pkg.description;
    } catch { /* */ }
  }
  if (!base && fileContents['pyproject.toml']) {
    const m = fileContents['pyproject.toml'].match(/description\s*=\s*['"]([^'"]{10,300})['"]/);
    if (m) base = m[1];
  }
  if (!base && fileContents['Cargo.toml']) {
    const m = fileContents['Cargo.toml'].match(/description\s*=\s*['"]([^'"]{10,300})['"]/);
    if (m) base = m[1];
  }
  if (!base && fileContents['go.mod']) {
    // Go module name gives a hint about purpose
    const modMatch = fileContents['go.mod'].match(/^module\s+(\S+)/m);
    if (modMatch) base = `Go module ${modMatch[1]}`;
  }

  // Priority 3: extract from existing README headline
  if (!base) {
    const readmeParsed = parseExistingReadme(fileContents);
    if (readmeParsed) base = readmeParsed.headline;
  }

  // Priority 4: mine the actual source files for a top-of-file description
  if (!base && Object.keys(sourceFiles).length > 0) {
    for (const content of Object.values(sourceFiles)) {
      if (!content) continue;
      // Python triple-quote
      const pyDoc = content.match(/^\s*['"`]{3}([\s\S]{15,400}?)['"`]{3}/m);
      if (pyDoc) { base = pyDoc[1].trim().replace(/\n\s*/g, ' ').slice(0, 200); break; }
      // Block comment
      const blockDoc = content.match(/\/\*[*!]?\s*([\s\S]{15,400}?)\*\//);
      if (blockDoc) { base = blockDoc[1].replace(/^\s*\*+\s*/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); break; }
      // Leading hash/slash comments
      const commentLines = content.split('\n').slice(0, 15)
        .filter(l => /^\s*(#[^!]|\/\/[^/!])/.test(l))
        .map(l => l.replace(/^\s*(#|\/\/)+\s*/, '').trim())
        .filter(l => l.length > 15 && !/^(coding|copyright|license|author|version|date|todo|fixme|@)/i.test(l));
      if (commentLines.length > 0) { base = commentLines.slice(0, 2).join(' ').slice(0, 200); break; }
    }
  }

  const topics = repoInfo.topics || [];
  const projectName = getProjectName(repoInfo, fileContents);
  const mainLang = stack.mainLanguage || (stack.runtime) || 'code';
  const mainFw = Array.from(stack.frameworks)[0] || null;

  if (base) {
    let expanded = base;
    if (mainFw && !base.toLowerCase().includes(mainFw.toLowerCase())) {
      expanded += ` Built with ${mainFw}`;
      if (stack.databases.size > 0) expanded += ` and ${Array.from(stack.databases)[0]}`;
      expanded += '.';
    }
    return expanded;
  }

  const categoryDescriptions = {
    webapp: `${projectName} is a modern web application${mainFw ? ` built with ${mainFw}` : ''}${stack.databases.size > 0 ? `, backed by ${Array.from(stack.databases)[0]}` : ''}. It provides a clean, responsive interface designed for${topics.length ? ' ' + topics.slice(0, 2).join(' and ') : ' everyday use'}.`,
    api: `${projectName} is a ${mainFw ? mainFw + ' ' : ''}API service${stack.databases.size > 0 ? ` with ${Array.from(stack.databases)[0]} integration` : ''}. It exposes a clean, versioned REST API for${topics.length ? ' ' + topics.slice(0, 2).join(' and ') : ' your application needs'}.`,
    fullstack: `${projectName} is a full-stack application${mainFw ? ` powered by ${mainFw}` : ''}${stack.databases.size > 0 ? ` with ${Array.from(stack.databases)[0]}` : ''}. It includes both a modern frontend interface and a robust backend API.`,
    cli: `${projectName} is a command-line tool${mainLang !== 'code' ? ` written in ${mainLang}` : ''}. It provides a simple, fast interface for${topics.length ? ' ' + topics.slice(0, 2).join(' and ') : ' common development workflows'} directly from your terminal.`,
    library: `${projectName} is a ${mainLang !== 'code' ? mainLang + ' ' : ''}library${topics.length ? ' for ' + topics.slice(0, 2).join(' and ') : ''}. It provides a clean, well-tested API that integrates seamlessly into your existing projects.`,
    mobile: `${projectName} is a ${stack.frameworks.has('Flutter') ? 'Flutter' : stack.frameworks.has('React Native') ? 'React Native' : 'mobile'} application. It delivers a native experience across${stack.frameworks.has('Flutter') ? ' iOS, Android, and Web' : ' iOS and Android'}.`,
    ml_ai: `${projectName} is a ${stack.tools.has('PyTorch') ? 'PyTorch' : stack.tools.has('TensorFlow') ? 'TensorFlow' : 'Python'}-based machine learning project. It provides tools and models for intelligent data processing and analysis.`,
    desktop: `${projectName} is a desktop application built with ${stack.frameworks.has('Electron') ? 'Electron' : 'Tauri'}${mainLang !== 'code' ? ` and ${mainLang}` : ''}.`,
    docs_site: `${projectName} is the official documentation site. It provides comprehensive guides, API references, and tutorials.`,
    generic: `${projectName} is a ${mainLang !== 'code' ? mainLang + ' ' : ''}project${topics.length ? ' focused on ' + topics.slice(0, 2).join(' and ') : ''}${mainFw ? ', built with ' + mainFw : ''}.`,
  };

  return categoryDescriptions[projectCategory] || categoryDescriptions.generic;
}

// ── Badge Builder ────────────────────────────────────────────
function buildBadges(repoInfo, stack, license) {
  const { owner: { login: owner }, name: repo } = repoInfo;
  const badges = [];

  const langColors = {
    TypeScript: '3178c6', JavaScript: 'f7df1e&logoColor=black', Python: '3572A5',
    Rust: 'ce422b', Go: '00ADD8', Java: 'b07219', Kotlin: 'F18E33',
    'C#': '178600', 'C++': 'f34b7d', Ruby: '701516', Swift: 'F05138',
    Dart: '00B4AB', PHP: '4F5D95', Elixir: '6e4a7e',
  };

  if (stack.mainLanguage) {
    const color = langColors[stack.mainLanguage] || '555555';
    badges.push(`![${stack.mainLanguage}](https://img.shields.io/badge/${encodeURIComponent(stack.mainLanguage)}-${color}?style=flat-square&logo=${encodeURIComponent(stack.mainLanguage.toLowerCase())}&logoColor=white)`);
  }

  const fwBadgeMap = {
    'React': 'React-20232A?logo=react&logoColor=61DAFB',
    'Next.js': 'Next.js-000000?logo=next.js',
    'Vue.js': 'Vue.js-4FC08D?logo=vue.js&logoColor=white',
    'Nuxt.js': 'Nuxt.js-00DC82?logo=nuxt.js&logoColor=white',
    'Angular': 'Angular-DD0031?logo=angular',
    'Svelte': 'Svelte-FF3E00?logo=svelte&logoColor=white',
    'SolidJS': 'SolidJS-2C4F7C?logo=solid&logoColor=white',
    'Remix': 'Remix-000000?logo=remix',
    'Astro': 'Astro-BC52EE?logo=astro&logoColor=white',
    'Express.js': 'Express-000000?logo=express',
    'Fastify': 'Fastify-000000?logo=fastify',
    'Hono': 'Hono-E36002?logo=hono&logoColor=white',
    'NestJS': 'NestJS-E0234E?logo=nestjs',
    'Django': 'Django-092E20?logo=django',
    'FastAPI': 'FastAPI-009688?logo=fastapi',
    'Flask': 'Flask-000000?logo=flask',
    'Electron': 'Electron-47848F?logo=electron',
    'Tauri': 'Tauri-24C8D8?logo=tauri&logoColor=white',
    'Flutter': 'Flutter-02569B?logo=flutter',
    'React Native': 'React_Native-20232A?logo=react',
    'Spring Boot': 'Spring_Boot-6DB33F?logo=spring-boot',
    'Gin': 'Gin-00ACD7?logo=go&logoColor=white',
    'Fiber': 'Fiber-00ACD7?logo=go&logoColor=white',
  };

  stack.frameworks.forEach(fw => {
    if (fwBadgeMap[fw]) {
      badges.push(`![${fw}](https://img.shields.io/badge/${fwBadgeMap[fw]}&style=flat-square)`);
    }
  });

  const dbBadgeMap = {
    'PostgreSQL': 'PostgreSQL-316192?logo=postgresql&logoColor=white',
    'MongoDB': 'MongoDB-4EA94B?logo=mongodb&logoColor=white',
    'MySQL': 'MySQL-005C84?logo=mysql&logoColor=white',
    'Redis': 'Redis-DC382D?logo=redis&logoColor=white',
    'Supabase': 'Supabase-3ECF8E?logo=supabase&logoColor=white',
    'Firebase': 'Firebase-FFCA28?logo=firebase&logoColor=black',
  };

  stack.databases.forEach(db => {
    if (dbBadgeMap[db]) {
      badges.push(`![${db}](https://img.shields.io/badge/${dbBadgeMap[db]}&style=flat-square)`);
    }
  });

  badges.push(`![GitHub Stars](https://img.shields.io/github/stars/${owner}/${repo}?style=flat-square&logo=github)`);
  badges.push(`![GitHub Forks](https://img.shields.io/github/forks/${owner}/${repo}?style=flat-square&logo=github)`);

  if (license && license !== 'NOASSERTION') {
    badges.push(`![License](https://img.shields.io/badge/license-${encodeURIComponent(license)}-blue?style=flat-square)`);
  }

  if (stack.cicd.has('GitHub Actions')) {
    badges.push(`![CI](https://img.shields.io/github/actions/workflow/status/${owner}/${repo}/ci.yml?style=flat-square&label=CI)`);
  }

  return badges;
}

// ── Emoji for project type ───────────────────────────────────
function getProjectEmoji(category) {
  const map = {
    webapp: '🌐', api: '🔌', fullstack: '🚀', cli: '⚡', library: '📦',
    mobile: '📱', ml_ai: '🤖', desktop: '🖥️', docs_site: '📚',
    browser_extension: '🧩', docs: '📄', generic: '🔧'
  };
  return map[category] || '🚀';
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

  const tree = Array.from(items).sort().slice(0, 28);
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

// ── Acknowledgements ─────────────────────────────────────────
function buildAcknowledgements(stack, repoInfo) {
  const items = [];
  const ackMap = {
    'React': '[React](https://react.dev/) — The library for web and native user interfaces',
    'Next.js': '[Next.js](https://nextjs.org/) — The React framework for production',
    'Vue.js': '[Vue.js](https://vuejs.org/) — The Progressive JavaScript Framework',
    'Angular': '[Angular](https://angular.io/) — Platform for building web applications',
    'Svelte': '[Svelte](https://svelte.dev/) — Cybernetically enhanced web apps',
    'Express.js': '[Express.js](https://expressjs.com/) — Fast, unopinionated web framework for Node',
    'FastAPI': '[FastAPI](https://fastapi.tiangolo.com/) — Modern, fast web framework for Python',
    'Django': '[Django](https://www.djangoproject.com/) — The web framework for perfectionists',
    'Flask': '[Flask](https://flask.palletsprojects.com/) — A lightweight WSGI web framework',
    'NestJS': '[NestJS](https://nestjs.com/) — A progressive Node.js framework',
    'Gin': '[Gin](https://gin-gonic.com/) — HTTP web framework written in Go',
    'Axum': '[Axum](https://github.com/tokio-rs/axum) — Ergonomic and modular web framework for Rust',
    'Tailwind CSS': '[Tailwind CSS](https://tailwindcss.com/) — A utility-first CSS framework',
    'Flutter': '[Flutter](https://flutter.dev/) — Build apps for any screen from a single codebase',
    'PyTorch': '[PyTorch](https://pytorch.org/) — An open-source machine learning framework',
    'TensorFlow': '[TensorFlow](https://www.tensorflow.org/) — End-to-end open-source ML platform',
    'Electron': '[Electron](https://www.electronjs.org/) — Build cross-platform desktop apps',
    'Tauri': '[Tauri](https://tauri.app/) — Build smaller, faster, and more secure desktop apps',
    'Vite': '[Vite](https://vitejs.dev/) — Next generation frontend tooling',
    'Prisma ORM': '[Prisma](https://www.prisma.io/) — Next-generation Node.js and TypeScript ORM',
    'Supabase': '[Supabase](https://supabase.com/) — The open-source Firebase alternative',
    'shadcn/ui': '[shadcn/ui](https://ui.shadcn.com/) — Beautifully designed accessible components',
  };

  [...stack.frameworks, ...stack.tools, ...stack.databases].forEach(item => {
    if (ackMap[item]) items.push(ackMap[item]);
  });

  return items.slice(0, 6);
}

function projectUsesAuth(stack, paths) {
  return stack.tools.has('JWT Auth') || stack.tools.has('OAuth/Auth') ||
         paths.some(p => /auth|passport|middleware/i.test(p));
}

function buildEnvVarsTable(repoInfo, stack, projectCategory, paths) {
  const rows = [];
  const defaultPort = stack.frameworks.has('FastAPI') || stack.frameworks.has('Flask') || stack.frameworks.has('Django')
    ? '8000' : stack.frameworks.has('Spring Boot') ? '8080' : '3000';

  const isServerProject = ['api', 'fullstack', 'webapp'].includes(projectCategory) && stack.databases.size > 0;
  const needsAuth = projectUsesAuth(stack, paths);

  if (isServerProject || projectCategory === 'api') {
    rows.push(`| \`NODE_ENV\` | Runtime environment | \`development\` | No |`);
    rows.push(`| \`PORT\` | Server port | \`${defaultPort}\` | No |`);
  }

  if (stack.databases.has('PostgreSQL') || stack.databases.has('SQLAlchemy') || stack.databases.has('Prisma ORM') || stack.databases.has('Drizzle ORM')) {
    rows.push(`| \`DATABASE_URL\` | PostgreSQL connection string | — | **Yes** |`);
  }
  if (stack.databases.has('MongoDB')) {
    rows.push(`| \`MONGODB_URI\` | MongoDB connection URI | \`mongodb://localhost:27017/${repoInfo.name}\` | **Yes** |`);
  }
  if (stack.databases.has('Redis')) {
    rows.push(`| \`REDIS_URL\` | Redis server URI | \`redis://localhost:6379\` | No |`);
  }
  if (stack.databases.has('Supabase')) {
    rows.push(`| \`SUPABASE_URL\` | Your Supabase project URL | — | **Yes** |`);
    rows.push(`| \`SUPABASE_ANON_KEY\` | Public anon key | — | **Yes** |`);
    rows.push(`| \`SUPABASE_SERVICE_ROLE_KEY\` | Server-side admin key | — | **Yes** |`);
  }
  if (stack.databases.has('Firebase')) {
    rows.push(`| \`FIREBASE_PROJECT_ID\` | Firebase project ID | — | **Yes** |`);
    rows.push(`| \`FIREBASE_PRIVATE_KEY\` | Firebase Admin SDK private key | — | **Yes** |`);
    rows.push(`| \`FIREBASE_CLIENT_EMAIL\` | Service account email | — | **Yes** |`);
  }
  if (needsAuth) {
    rows.push(`| \`JWT_SECRET\` | Secret key for signing authentication tokens | — | **Yes** |`);
    rows.push(`| \`JWT_EXPIRES_IN\` | Token expiry duration | \`7d\` | No |`);
  }
  if (stack.tools.has('OAuth/Auth')) {
    rows.push(`| \`GITHUB_CLIENT_ID\` | OAuth app client ID | — | **Yes** |`);
    rows.push(`| \`GITHUB_CLIENT_SECRET\` | OAuth app secret | — | **Yes** |`);
  }
  if (stack.tools.has('Stripe')) {
    rows.push(`| \`STRIPE_SECRET_KEY\` | Stripe API secret key | — | **Yes** |`);
    rows.push(`| \`STRIPE_WEBHOOK_SECRET\` | Stripe webhook signing secret | — | **Yes** |`);
  }
  if (stack.tools.has('OpenAI API')) rows.push(`| \`OPENAI_API_KEY\` | OpenAI API key | — | **Yes** |`);
  if (stack.tools.has('Anthropic API')) rows.push(`| \`ANTHROPIC_API_KEY\` | Anthropic API key | — | **Yes** |`);

  return rows;
}

// ── Project Purpose Extractor ────────────────────────────────
// Mines actual source file content for repo-specific descriptions.
// Returns an array of meaningful content strings ranked by quality.
function extractProjectPurpose(sourceFiles, fileContents) {
  const snippets = [];

  // 1. Mine Python module docstrings (triple-quoted at top of file)
  for (const [, content] of Object.entries(sourceFiles)) {
    if (!content) continue;
    // Python triple-quote docstring at top
    const pyDoc = content.match(/^[^\S\r\n]*['"`]{3}([\s\S]{20,800}?)['"`]{3}/m);
    if (pyDoc) snippets.push(pyDoc[1].trim().replace(/\n/g, ' ').slice(0, 400));

    // Block comment at top of file (/** ... */ or /* ... */)
    const blockComment = content.match(/^\/\*\*?\s*([\s\S]{20,600}?)\*\//m);
    if (blockComment) snippets.push(blockComment[1].replace(/\s*\*\s*/g, ' ').trim().slice(0, 400));

    // Leading # comments in Python/Shell (first 10 lines)
    const hashLines = content.split('\n').slice(0, 10)
      .filter(l => /^#[^!]/.test(l.trim()))
      .map(l => l.replace(/^\s*#+\s*/, '').trim())
      .filter(l => l.length > 20);
    if (hashLines.length > 0) snippets.push(hashLines.join(' ').slice(0, 400));

    // Leading // comments in JS/TS/Go/Rust (first 10 lines)
    const slashLines = content.split('\n').slice(0, 10)
      .filter(l => /^\/\/[^/!]/.test(l.trim()))
      .map(l => l.replace(/^\s*\/\/\s*/, '').trim())
      .filter(l => l.length > 20);
    if (slashLines.length > 0) snippets.push(slashLines.join(' ').slice(0, 400));
  }

  // 2. Mine existing README paragraphs
  const readmeParsed = parseExistingReadme(fileContents);
  if (readmeParsed) snippets.unshift(readmeParsed.overview); // highest priority

  // 3. package.json / pyproject.toml description
  if (fileContents['package.json']) {
    try {
      const pkg = JSON.parse(fileContents['package.json']);
      if (pkg.description && pkg.description.length > 20) snippets.unshift(pkg.description);
    } catch { /* */ }
  }
  if (fileContents['pyproject.toml']) {
    const m = fileContents['pyproject.toml'].match(/description\s*=\s*['"]([^'"]{20,400})['"]/);
    if (m) snippets.unshift(m[1]);
  }
  if (fileContents['Cargo.toml']) {
    const m = fileContents['Cargo.toml'].match(/description\s*=\s*['"]([^'"]{20,400})['"]/);
    if (m) snippets.unshift(m[1]);
  }

  // 4. GitHub repo description
  return snippets.filter(Boolean);
}

// ── Code Signal Paragraph Builder ───────────────────────────
// Generates a repo-specific narrative paragraph by combining signals extracted
// from the actual source files: docstrings, functions, classes, routes, imports.
function buildCodeSignalParagraph(codeInsights, sourceFiles, stack, projectName, projectCategory) {
  const parts = [];

  // Docstring / top-comment snippet from source files
  if (codeInsights.description && codeInsights.description.length > 15) {
    parts.push(codeInsights.description.trim());
  }

  // Describe detected classes
  if (codeInsights.classes && codeInsights.classes.length > 0) {
    const classNames = codeInsights.classes.slice(0, 4).map(c => `\`${c}\``).join(', ');
    parts.push(`The codebase defines ${codeInsights.classes.length > 1 ? 'classes' : 'a class'} ${classNames}${codeInsights.classes.length > 4 ? ` and ${codeInsights.classes.length - 4} more` : ''}.`);
  }

  // Describe API routes
  if (codeInsights.routes && codeInsights.routes.length > 0) {
    const routeCount = codeInsights.routes.length;
    const routeSample = codeInsights.routes.slice(0, 4).join(', ');
    parts.push(`${routeCount} API endpoint${routeCount > 1 ? 's' : ''} ${routeCount > 1 ? 'are' : 'is'} defined in the source, including ${routeSample}${routeCount > 4 ? `, and ${routeCount - 4} more` : ''}.`);
  }

  // Describe key functions
  const publicFns = (codeInsights.functions || [])
    .filter(f => !/^(test|spec|mock|stub|_)/i.test(f))
    .slice(0, 5);
  if (publicFns.length > 2) {
    parts.push(`Key functions include \`${publicFns.slice(0, 3).join('`, `')}\`${publicFns.length > 3 ? `, and \`${publicFns.slice(3).join('`, `')}\`` : ''}.`);
  }

  // Describe notable third-party imports (skip stdlib/internal names)
  const stdlibNames = new Set([
    'os','sys','re','json','math','time','io','pathlib','typing','abc','subprocess',
    'fs','path','http','https','url','util','events','stream','buffer','child_process',
    'fmt','log','errors','strings','context','strconv','net','sync',
    'std','core','std::io','std::fmt','std::env',
  ]);
  const notableImports = (codeInsights.imports || [])
    .filter(imp => !stdlibNames.has(imp) && imp.length > 1)
    .slice(0, 5);
  if (notableImports.length > 0) {
    parts.push(`Third-party integrations detected: \`${notableImports.join('`, `')}\`.`);
  }

  // Entry points
  const entryPoints = (codeInsights.entryPoints || []).slice(0, 3);
  if (entryPoints.length > 0 && (codeInsights.classes || []).length === 0 && publicFns.length === 0) {
    // Only show entry points if we don't have richer signals — avoids redundancy
    parts.push(`Source entry point${entryPoints.length > 1 ? 's' : ''}: ${entryPoints.map(e => `\`${e}\``).join(', ')}.`);
  }

  if (parts.length === 0) return null;
  return parts.join(' ');
}

// ── Template README Builder ──────────────────────────────────
// Reads actual source code (sourceFiles) and config files to produce
// repo-specific content — not generic templates.
function buildReadme(repoInfo, paths, fileContents, codeInsights = {}, sourceFiles = {}) {
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;
  const projectName = getProjectName(repoInfo, fileContents);
  const stack = detectTechStack(paths, fileContents);
  const projectCategory = detectProjectCategory(repoInfo, paths, fileContents, stack);
  const description = buildSmartDescription(repoInfo, fileContents, projectCategory, stack, sourceFiles);
  const license = detectLicense(fileContents, repoInfo);
  const installCmds = getInstallCommands(repoInfo, fileContents, stack);
  const runCmds = getRunCommands(fileContents, stack);
  const testCmds = getTestCommands(fileContents, stack);
  const badges = buildBadges(repoInfo, stack, license);
  const acks = buildAcknowledgements(stack, repoInfo);

  // Extract real content from source files
  const purposeSnippets = extractProjectPurpose(sourceFiles, fileContents);

  const isStaticSite = !fileContents['package.json'] && !fileContents['requirements.txt'] &&
                       !fileContents['pyproject.toml'] && !fileContents['Cargo.toml'] &&
                       !fileContents['go.mod'] && paths.some(p => p === 'index.html');

  const hasDocker = paths.some(p => p === 'Dockerfile' || p.startsWith('Dockerfile.'));
  const hasDC = paths.some(p => p.includes('docker-compose'));
  const hasContrib = paths.some(p => /CONTRIBUTING/i.test(p));
  const hasSecurity = paths.some(p => /SECURITY\.md/i.test(p));
  const hasChangelog = paths.some(p => /CHANGELOG|HISTORY/i.test(p));
  const hasEnvExample = paths.some(p => /\.env\.example|\.env\.sample|example\.env/i.test(p));
  const topics = repoInfo.topics || [];

  const isWebApp = ['webapp', 'fullstack'].includes(projectCategory);
  const isBackend = ['api', 'fullstack'].includes(projectCategory);
  const isMobile = projectCategory === 'mobile';
  const isCLI = projectCategory === 'cli';
  const isLibrary = projectCategory === 'library';
  const isML = projectCategory === 'ml_ai';

  const needsEnvVars = stack.databases.size > 0 || stack.tools.has('OpenAI API') ||
                       stack.tools.has('Anthropic API') || stack.tools.has('Stripe') ||
                       projectUsesAuth(stack, paths);

  const pm = stack.packageManager || 'npm';
  const pmLower = pm.toLowerCase();
  const pmRun = pmLower === 'yarn' ? 'yarn' : (pmLower === 'pnpm' ? 'pnpm' : (pmLower === 'bun' ? 'bun run' : 'npm run'));
  const pmExec = pmLower === 'yarn' ? 'yarn' : (pmLower === 'pnpm' ? 'pnpm dlx' : (pmLower === 'bun' ? 'bunx' : 'npx'));

  let defaultPort = '3000';
  if (stack.frameworks.has('FastAPI') || stack.frameworks.has('Flask') || stack.frameworks.has('Django')) defaultPort = '8000';
  else if (stack.frameworks.has('Spring Boot')) defaultPort = '8080';

  const emoji = getProjectEmoji(projectCategory);

  let md = '';

  // ── Title & Badges ──
  md += `<div align="center">\n\n`;
  md += `# ${emoji} ${projectName}\n\n`;
  if (description) {
    md += `*${description}*\n\n`;
  }
  if (badges.length > 0) {
    md += badges.join(' ') + '\n\n';
  }
  md += `[View Demo](https://github.com/${owner}/${repo}) · [Report Bug](https://github.com/${owner}/${repo}/issues/new?labels=bug) · [Request Feature](https://github.com/${owner}/${repo}/issues/new?labels=enhancement)\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  const hasScreenshots = paths.some(p =>
    /(^|\/)(screenshots|images|assets)\/.*\.(png|jpg|jpeg|gif|svg)$/i.test(p) ||
    /screenshot|mockup|demo-ui/i.test(p) && /\.(png|jpg|jpeg|gif|svg)$/i.test(p)
  );

  // ── Table of Contents ──
  const tocItems = [];
  if ((isWebApp || isMobile || isML) && hasScreenshots) tocItems.push('Screenshots');
  tocItems.push('Overview', 'Features', 'Tech Stack');
  if (isBackend || projectCategory === 'fullstack') tocItems.push('Architecture');
  tocItems.push('Getting Started', 'Installation');
  if (needsEnvVars) tocItems.push('Configuration');
  tocItems.push('Usage');
  if (testCmds.length > 0) tocItems.push('Testing');
  if (isBackend) tocItems.push('API Reference');
  if (hasDocker || hasDC) tocItems.push('Docker');
  if (isBackend || isWebApp) tocItems.push('Deployment');
  tocItems.push('Project Structure');
  if (isBackend) tocItems.push('Security');
  tocItems.push('Troubleshooting', 'Roadmap', 'Contributing');
  if (acks && acks.length > 0) tocItems.push('Acknowledgements');
  tocItems.push('License');

  md += `## 📋 Table of Contents\n\n`;
  tocItems.forEach(item => {
    const anchor = item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    md += `- [${item}](#${anchor})\n`;
  });
  md += '\n---\n\n';

  // ── Screenshots ──
  if ((isWebApp || isMobile || isML) && hasScreenshots) {
    md += `## 📸 Screenshots\n\n`;
    md += `> Add screenshots here to make your README more engaging!\n\n`;
    md += `| Home Screen | Feature Demo |\n`;
    md += `|---|---|\n`;
    md += `| ![Home](screenshots/home.png) | ![Feature](screenshots/feature.png) |\n\n`;
    md += `> 📌 Drop screenshots into a \`screenshots/\` folder in the repo root and update the paths above.\n\n`;
    md += `---\n\n`;
  }

  // ── Overview ──
  md += `## 📖 Overview\n\n`;

  // Try to use the parsed existing README for a richer, repo-specific overview
  const readmeParsed = parseExistingReadme(fileContents);
  if (readmeParsed && readmeParsed.overview && readmeParsed.overview.length > 80) {
    // Use actual content from the repository's existing README
    md += `${readmeParsed.overview}\n\n`;

    // Still append a code-signals paragraph so we show what was actually found in the source
    const codeSignalPara = buildCodeSignalParagraph(codeInsights, sourceFiles, stack, projectName, projectCategory);
    if (codeSignalPara) md += `${codeSignalPara}\n\n`;
  } else {
    // ── Paragraph 1: repo-specific description ──
    // Prefer purposeSnippets (from docstrings, manifests, top-of-file comments) over generic fallback
    const bestSnippet = purposeSnippets.find(s => s && s.length > 30);
    if (bestSnippet && bestSnippet !== description) {
      // Use the snippet as the primary description; append the description as an extra sentence if different
      md += `${bestSnippet}\n\n`;
      if (description && description.length > 20 && !bestSnippet.toLowerCase().includes(description.toLowerCase().slice(0, 30))) {
        md += `${description}\n\n`;
      }
    } else {
      md += `${description}\n\n`;
    }

    // ── Paragraph 2: tech-stack context ──
    const stackList = [
      ...Array.from(stack.frameworks),
      ...Array.from(stack.tools).filter(t => !['Docker','Make','Issue Templates','PR Template'].includes(t)),
      ...Array.from(stack.databases),
    ].slice(0, 4);

    if (stackList.length > 0) {
      const stackStr = stackList.length > 1
        ? stackList.slice(0, -1).join(', ') + ' and ' + stackList[stackList.length - 1]
        : stackList[0];
      const categoryContext = {
        webapp:    `The project is built with ${stackStr}, offering a modern and responsive user experience. It is designed to be easy to set up locally and straightforward to deploy to a production environment.`,
        api:       `The API is powered by ${stackStr} and designed for high performance and reliability. It follows REST conventions and is straightforward to integrate into any frontend or mobile client.`,
        fullstack: `The stack uses ${stackStr} to deliver both a polished frontend and a robust backend within a single repository. Shared utilities and types keep the codebase coherent across layers.`,
        cli:       `Written with ${stackStr}, the tool runs entirely from the terminal with no GUI dependencies. It is designed for scripting, piping, and automation inside CI/CD environments.`,
        library:   `Built on ${stackStr}, the library exposes a minimal, well-typed public API. It is designed for tree-shaking, has zero mandatory peer dependencies, and works in both Node.js and browser environments.`,
        mobile:    `Using ${stackStr}, the application shares a single codebase across iOS and Android, reducing maintenance overhead while delivering a native look and feel on each platform.`,
        ml_ai:     `Built with ${stackStr}, the project covers data ingestion, preprocessing, model training, and evaluation in a reproducible and configurable pipeline.`,
        desktop:   `Leveraging ${stackStr}, the app delivers a native desktop experience with access to system APIs while being built entirely with web technologies.`,
        generic:   `The project leverages ${stackStr} to accomplish its core objectives. Refer to the sections below for setup instructions, usage examples, and contribution guidelines.`,
      };
      const para2 = categoryContext[projectCategory] || categoryContext.generic;
      md += `${para2}\n\n`;
    }

    // ── Paragraph 3: code-signal summary (what was actually found in the source) ──
    const codeSignalPara = buildCodeSignalParagraph(codeInsights, sourceFiles, stack, projectName, projectCategory);
    if (codeSignalPara) md += `${codeSignalPara}\n\n`;
  }

  if (topics.length > 0) {
    md += topics.map(t => `\`${t}\``).join(' ') + '\n\n';
  }
  if (repoInfo.homepage) {
    md += `🔗 **Live Site:** [${repoInfo.homepage}](${repoInfo.homepage})\n\n`;
  }

  // ── Features ──
  md += `## ✨ Features\n\n`;
  const featureSet = [];

  if (stack.frameworks.size > 0) {
    const fwList = Array.from(stack.frameworks).slice(0, 3).join(', ');
    const labels = {
      webapp: `Built with ${fwList} for a fast, reactive user experience`,
      api: `${fwList}-powered backend for high-performance request handling`,
      fullstack: `Full-stack architecture using ${fwList} from client to server`,
      cli: `Ergonomic CLI experience powered by ${fwList}`,
      library: `Clean, tree-shakeable API built on top of ${fwList}`,
      mobile: `Cross-platform mobile app built with ${fwList}`,
      ml_ai: `ML pipeline using ${fwList} for model training and inference`,
      desktop: `Desktop-native experience via ${fwList}`,
      generic: `Core powered by ${fwList}`,
    };
    featureSet.push(`**${labels[projectCategory] || `Built on ${fwList}`}**`);
  }

  if (stack.databases.size > 0) {
    const dbList = Array.from(stack.databases).slice(0, 2).join(' & ');
    featureSet.push(`**Persistent data layer** — ${dbList} integration with efficient query patterns`);
  }
  if (stack.testing.size > 0) {
    featureSet.push(`**Tested & reliable** — ${Array.from(stack.testing).join(', ')} test suite with comprehensive coverage`);
  }
  if (hasDocker) featureSet.push(`**Containerised** — Docker setup for consistent dev and production environments`);
  if (stack.cicd.size > 0) featureSet.push(`**CI/CD pipeline** — Automated checks via ${Array.from(stack.cicd).join(', ')} on every push`);
  if (stack.tools.has('TypeScript')) featureSet.push(`**Type-safe** — Full TypeScript coverage with strict mode enabled`);
  if (stack.tools.has('Tailwind CSS') || stack.tools.has('shadcn/ui')) {
    featureSet.push(`**Polished UI** — ${stack.tools.has('shadcn/ui') ? 'shadcn/ui components with ' : ''}Tailwind CSS for a consistent design system`);
  }
  if (stack.tools.has('tRPC')) featureSet.push(`**End-to-end type safety** — tRPC for fully typed client-server communication`);
  if (stack.tools.has('GraphQL')) featureSet.push(`**GraphQL API** — Schema-first data layer with typed queries and mutations`);
  if (stack.tools.has('OpenAI API') || stack.tools.has('Anthropic API') || stack.tools.has('LangChain')) {
    featureSet.push(`**AI-powered** — Integrates with ${stack.tools.has('OpenAI API') ? 'OpenAI' : 'Anthropic'} for intelligent features`);
  }
  if (stack.tools.has('Socket.IO')) featureSet.push(`**Real-time** — WebSocket support via Socket.IO for live updates`);
  if (isCLI) { featureSet.push(`**Zero-config** — Works out of the box`); featureSet.push(`**Composable** — Commands are modular and can be scripted`); }
  if (isLibrary) { featureSet.push(`**Minimal footprint** — Keeps your bundle size in check`); featureSet.push(`**Tree-shakeable** — Import only what you use`); }
  if (isMobile) featureSet.push(`**Cross-platform** — Single codebase runs on iOS, Android${stack.frameworks.has('Flutter') ? ', and Web' : ''}`);
  if (isML) { featureSet.push(`**Reproducible experiments** — Config-driven training with logged metrics`); }

  // Code-insight driven features
  if (codeInsights.routes && codeInsights.routes.length > 0) {
    const routeCount = codeInsights.routes.length;
    featureSet.push(`**${routeCount} API endpoint${routeCount > 1 ? 's' : ''}** — ${codeInsights.routes.slice(0, 4).join(', ')}${routeCount > 4 ? ` and ${routeCount - 4} more` : ''}`);
  }
  if (codeInsights.classes && codeInsights.classes.length > 0) {
    featureSet.push(`**Object-oriented design** — Core classes: \`${codeInsights.classes.slice(0, 4).join('\`, \`')}\``);
  }

  // ── Source-code-derived feature bullets ──
  // Use extracted functions to describe the capability surface of the repo
  if (codeInsights.functions && codeInsights.functions.length > 3) {
    const publicFns = codeInsights.functions
      .filter(f => !/^(test|spec|mock|stub|helper|util|_)/i.test(f))
      .slice(0, 6);
    if (publicFns.length > 0) {
      featureSet.push(`**${publicFns.length} public functions / handlers** — including \`${publicFns.slice(0, 3).join('\`, \`')}\`${publicFns.length > 3 ? ` and ${publicFns.length - 3} more` : ''} — covering the core logic of the project`);
    }
  }

  // Use detected imports to highlight key library integrations not already in featureSet
  if (codeInsights.imports && codeInsights.imports.length > 0) {
    const notableImports = codeInsights.imports.filter(imp =>
      !['os','sys','re','json','math','time','io','pathlib','typing','abc',
        'fs','path','http','url','util','events',
        'fmt','log','errors','strings','context'].includes(imp)
    ).slice(0, 4);
    if (notableImports.length > 0) {
      featureSet.push(`**Key integrations** — actively imports \`${notableImports.join('\`, \`')}\`, indicating built-in support for those libraries`);
    }
  }

  if (featureSet.length < 3) {
    featureSet.push(`**Well-documented** — Detailed README, inline comments, and clear code structure`);
    featureSet.push(`**Open-source** — Fork, extend, and contribute freely`);
  }

  featureSet.forEach(f => { md += `- ${f}\n`; });
  md += '\n---\n\n';

  // ── Tech Stack ──
  md += `## 🛠️ Tech Stack\n\n`;
  md += `| Category | Technology | Purpose |\n`;
  md += `| :--- | :--- | :--- |\n`;

  const techPurposeMap = {
    // Languages
    'TypeScript': 'Type-safe superset of JavaScript for robust application code',
    'JavaScript': 'Core scripting language for application logic and interactivity',
    'Python': 'General-purpose language for backend logic and scripting',
    'Rust': 'Systems programming language for performance-critical code',
    'Go': 'Compiled language for fast, concurrent server-side services',
    'Java': 'Object-oriented language for enterprise-scale applications',
    'Kotlin': 'Modern JVM language for Android and server-side development',
    'C#': 'Strongly typed language for .NET applications',
    'C++': 'Systems language for performance-critical components',
    'C': 'Low-level language for system programming',
    'Ruby': 'Dynamic language optimised for developer happiness',
    'PHP': 'Server-side scripting language for web development',
    'Swift': 'Apple-platform language for iOS/macOS native apps',
    'Dart': 'Client-optimised language powering Flutter',
    'Elixir': 'Functional language built on Erlang VM for scalable apps',
    'HTML': 'Semantic markup and application UI structure',
    'CSS': 'Styling, layout, animations, and responsive design',
    'SCSS': 'CSS preprocessor for maintainable stylesheets',
    'Shell': 'Automation scripts and development tooling',
    // Frameworks
    'React': 'Component-based UI library for reactive web interfaces',
    'Next.js': 'React framework with SSR, SSG, and API routes',
    'Vue.js': 'Progressive JavaScript framework for building UIs',
    'Nuxt.js': 'Vue meta-framework with SSR and file-based routing',
    'Angular': 'Full-featured MVC framework for enterprise web apps',
    'Svelte': 'Compile-time UI framework with minimal runtime overhead',
    'SolidJS': 'Fine-grained reactive UI library with no virtual DOM',
    'Remix': 'Full-stack React framework focused on web fundamentals',
    'Astro': 'Content-first framework with islands architecture',
    'Express.js': 'Minimal, unopinionated Node.js web framework',
    'Fastify': 'High-performance, low-overhead Node.js web framework',
    'NestJS': 'Progressive Node.js framework with DI and decorators',
    'Koa': 'Lightweight middleware-driven Node.js framework',
    'Hono': 'Ultra-fast edge-native web framework',
    'Django': 'Batteries-included Python web framework',
    'Flask': 'Lightweight WSGI micro-framework for Python APIs',
    'FastAPI': 'Modern, async Python framework with auto OpenAPI docs',
    'Spring Boot': 'Convention-over-configuration Java web framework',
    'Gin': 'High-performance HTTP web framework written in Go',
    'Echo': 'High-performance, extensible Go web framework',
    'Fiber': 'Express-inspired web framework built on Go',
    'Tokio': 'Asynchronous runtime for Rust',
    'Axum': 'Ergonomic, modular web framework for Rust',
    'Actix-web': 'High-performance actor-based Rust web framework',
    'Electron': 'Build cross-platform desktop apps with web technologies',
    'Tauri': 'Lightweight Rust-backed desktop app framework',
    'Flutter': 'Cross-platform UI toolkit from a single codebase',
    'React Native': 'Native mobile apps using React and JavaScript',
    // Tools
    'TypeScript': 'Static type checking across the entire codebase',
    'Vite': 'Next-generation frontend build tool and dev server',
    'Webpack': 'Module bundler for JavaScript applications',
    'esbuild': 'Extremely fast JavaScript/TypeScript bundler',
    'Tailwind CSS': 'Utility-first CSS framework for rapid UI development',
    'shadcn/ui': 'Accessible, composable component library',
    'Framer Motion': 'Production-ready motion and animation library',
    'GraphQL': 'Query language and runtime for flexible APIs',
    'tRPC': 'End-to-end type-safe API layer without code generation',
    'Zod': 'TypeScript-first schema validation library',
    'Socket.IO': 'Real-time bidirectional event-based communication',
    'JWT Auth': 'Stateless authentication via signed JSON Web Tokens',
    'OAuth/Auth': 'Third-party OAuth and session-based authentication',
    'OpenAI API': 'GPT-powered AI capabilities and completions',
    'Anthropic API': 'Claude-powered AI capabilities and completions',
    'Stripe': 'Payment processing and subscription management',
    'Celery': 'Distributed task queue for async background jobs',
    'Pydantic': 'Data validation and settings management via Python types',
    'NumPy': 'Scientific computing and array operations',
    'Pandas': 'Data manipulation and analysis library',
    'PyTorch': 'Open-source machine learning framework',
    'TensorFlow': 'End-to-end open-source ML platform',
    'scikit-learn': 'Machine learning algorithms and utilities',
    'LangChain': 'Framework for LLM-powered application development',
    'Uvicorn': 'Lightning-fast ASGI server for Python',
    'Alembic': 'Database migration tool for SQLAlchemy',
    'Cobra CLI': 'Powerful library for building CLI applications in Go',
    'Clap CLI': 'Command-line argument parser for Rust',
    'Serde': 'Serialization and deserialization framework for Rust',
    'Make': 'Task automation via Makefile targets',
    'Docker': 'Containerisation for consistent build environments',
    'Docker Compose': 'Multi-service container orchestration',
    'Vercel': 'Edge deployment platform for frontend and serverless',
    'Issue Templates': 'Structured GitHub issue reporting',
    'PR Template': 'Standardised pull request workflow',
    'Icon Library': 'Consistent icon set for UI components',
    // Databases
    'PostgreSQL': 'Relational database for structured, transactional data',
    'MySQL': 'Relational database for web applications',
    'MongoDB': 'Document-oriented NoSQL database',
    'Redis': 'In-memory data store for caching and pub/sub',
    'Supabase': 'Open-source Firebase alternative with Postgres',
    'Firebase': 'Google-managed real-time database and auth',
    'Prisma ORM': 'Next-generation ORM with type-safe query builder',
    'Drizzle ORM': 'Lightweight TypeScript ORM with SQL-like syntax',
    'SQLAlchemy': 'Python SQL toolkit and ORM',
    'GORM': 'Full-featured ORM library for Go',
    'Diesel ORM': 'Safe, extensible ORM and query builder for Rust',
    'SQLx': 'Async Rust SQL toolkit with compile-time checked queries',
    'Hibernate ORM': 'Object-relational mapping for Java',
    // Testing
    'Jest': 'JavaScript testing framework with snapshot support',
    'Vitest': 'Vite-native unit testing framework',
    'Mocha': 'Flexible JavaScript test framework',
    'Testing Library': 'DOM-centric testing utilities for UI components',
    'Cypress': 'End-to-end browser testing framework',
    'Playwright': 'Cross-browser end-to-end automation',
    'pytest': 'Python testing framework with rich plugin ecosystem',
    'JUnit': 'Unit testing framework for JVM languages',
    // CI/CD
    'GitHub Actions': 'Automated CI/CD pipelines via YAML workflows',
    'Travis CI': 'Hosted continuous integration service',
    'CircleCI': 'Cloud-based CI/CD platform',
  };

  // Build per-technology rows grouped by category
  const techRows = [];
  if (stack.languages.size > 0) {
    Array.from(stack.languages).forEach(tech => {
      techRows.push(`| **Structure** | \`${tech}\` | ${techPurposeMap[tech] || 'Core implementation language'} |`);
    });
  }
  if (stack.frameworks.size > 0) {
    Array.from(stack.frameworks).forEach(tech => {
      techRows.push(`| **Framework** | \`${tech}\` | ${techPurposeMap[tech] || 'Application foundation'} |`);
    });
  }
  if (stack.tools.size > 0) {
    Array.from(stack.tools).forEach(tech => {
      techRows.push(`| **Tooling** | \`${tech}\` | ${techPurposeMap[tech] || 'Developer tooling and utilities'} |`);
    });
  }
  if (stack.databases.size > 0) {
    Array.from(stack.databases).forEach(tech => {
      techRows.push(`| **Data** | \`${tech}\` | ${techPurposeMap[tech] || 'Persistent data storage'} |`);
    });
  }
  if (stack.testing.size > 0) {
    Array.from(stack.testing).forEach(tech => {
      techRows.push(`| **Testing** | \`${tech}\` | ${techPurposeMap[tech] || 'Quality assurance'} |`);
    });
  }
  if (stack.cicd.size > 0) {
    Array.from(stack.cicd).forEach(tech => {
      techRows.push(`| **CI/CD** | \`${tech}\` | ${techPurposeMap[tech] || 'Automated build and deploy pipelines'} |`);
    });
  }
  if (stack.packageManager) {
    techRows.push(`| **Package Manager** | \`${stack.packageManager}\` | Dependency installation and script running |`);
  }

  if (techRows.length === 0) {
    // Fallback for repos with no detectable stack
    md += `| **Source** | GitHub Public API | Repository metadata, file tree, raw file contents |\n`;
    md += `| **Fonts** | Google Fonts | Typography and monospace code rendering |\n`;
  } else {
    techRows.forEach(row => { md += `${row}\n`; });
  }

  if (isStaticSite) {
    md += '\n> No build step. No bundler. No dependencies. Zero-install, open-in-browser ready.\n\n---\n\n';
  } else {
    md += '\n---\n\n';
  }

  // ── Architecture ──
  if (isBackend || projectCategory === 'fullstack') {
    md += `## 🏗️ Architecture\n\n`;
    if (projectCategory === 'fullstack') {
      md += `This project follows a **full-stack** structure, separating frontend and backend concerns while sharing types and utilities.\n\n`;
      md += `\`\`\`\n`;
      md += `┌─────────────┐    HTTP/WebSocket    ┌──────────────────┐\n`;
      md += `│   Browser   │ ◄─────────────────► │   API Server     │\n`;
      md += `│  (${Array.from(stack.frameworks)[0] || 'Frontend'})  │                     │  (${Array.from(stack.frameworks).slice(-1)[0] || 'Backend'})    │\n`;
      md += `└─────────────┘                     └────────┬─────────┘\n`;
      md += `                                             │\n`;
      md += `                                    ┌────────▼─────────┐\n`;
      md += `                                    │     Database     │\n`;
      md += `                                    │  (${Array.from(stack.databases)[0] || 'Storage'})    │\n`;
      md += `                                    └──────────────────┘\n`;
      md += `\`\`\`\n\n`;
    } else {
      md += `\`\`\`\n[Request] → [Router] → [Middleware] → [Controller] → [Service] → [Database]\n\`\`\`\n\n`;
      md += `- **Router** — maps HTTP verbs and paths to controllers\n`;
      md += `- **Middleware** — handles auth, validation, logging, rate limiting\n`;
      md += `- **Controller** — parses input, calls services, returns responses\n`;
      md += `- **Service** — holds business logic, pure functions, testable\n`;
      md += `- **Repository/ORM** — abstracts database queries\n\n`;
    }
    md += `---\n\n`;
  }

  // ── Getting Started ──
  md += `## 🚀 Getting Started\n\n### Prerequisites\n\n`;
  const prereqs = [];
  if (fileContents['package.json']) {
    prereqs.push(`- **Node.js** ≥ 18.x — [nodejs.org](https://nodejs.org/)`);
    if (pm === 'Yarn') prereqs.push('- **Yarn** — `npm install -g yarn`');
    if (pm === 'pnpm') prereqs.push('- **pnpm** — `npm install -g pnpm`');
    if (pm === 'Bun') prereqs.push('- **Bun** — [bun.sh](https://bun.sh/)');
  }
  if (fileContents['requirements.txt'] || fileContents['pyproject.toml'] || fileContents['setup.py']) {
    prereqs.push('- **Python** ≥ 3.9 — [python.org](https://www.python.org/)');
    prereqs.push('- **pip** or **pipenv** for package management');
  }
  if (fileContents['Cargo.toml']) prereqs.push('- **Rust & Cargo** (stable) — [rustup.rs](https://rustup.rs/)');
  if (fileContents['go.mod']) prereqs.push('- **Go** ≥ 1.21 — [golang.org](https://golang.org/)');
  if (fileContents['Gemfile']) prereqs.push('- **Ruby** ≥ 3.0 & **Bundler** — [ruby-lang.org](https://www.ruby-lang.org/)');
  if (fileContents['composer.json']) prereqs.push('- **PHP** ≥ 8.1 & **Composer** — [getcomposer.org](https://getcomposer.org/)');
  if (fileContents['pubspec.yaml']) prereqs.push('- **Flutter SDK** (stable) — [flutter.dev](https://flutter.dev/)');
  if (hasDocker) prereqs.push('- **Docker** & **Docker Compose** — [docker.com](https://www.docker.com/)');
  if (prereqs.length === 0) prereqs.push('- **Git** — [git-scm.com](https://git-scm.com/)');
  prereqs.forEach(p => { md += `${p}\n`; });
  md += '\n';


  // ── Installation ──
  md += `## 📥 Installation\n\n`;

  // For pure static / HTML repos: show Option 1 + Option 2 (mirrors reference README style)
  if (isStaticSite) {
    md += `${projectName} requires **no installation** — it is plain HTML/CSS/JS.\n\n`;
    md += `### Option 1 — Open directly in a browser\n\n`;
    md += `\`\`\`bash\n# Clone the repository\ngit clone ${repoInfo.clone_url}\ncd "${repo}"\n\n# Windows\nstart index.html\n\n# macOS\nopen index.html\n\n# Linux\nxdg-open index.html\n\`\`\`\n\n`;
    md += `### Option 2 — Serve locally (recommended to avoid CORS edge cases)\n\n`;
    md += `\`\`\`bash\n# Using Python's built-in server\npython -m http.server 8080\n\n# Using Node.js (npx, no install needed)\nnpx serve .\n\n# Using VS Code Live Server\n# Right-click index.html → "Open with Live Server"\n\`\`\`\n\n`;
    md += `Then navigate to \`http://localhost:8080\` in your browser.\n\n`;
  } else {
    md += `**1. Clone the repository**\n\n\`\`\`bash\ngit clone ${repoInfo.clone_url}\ncd ${repo}\n\`\`\`\n\n`;
    if (fileContents['requirements.txt'] || fileContents['pyproject.toml'] || fileContents['setup.py']) {
      md += `**2. Create & activate a virtual environment**\n\n\`\`\`bash\npython -m venv .venv\n\n# macOS/Linux\nsource .venv/bin/activate\n\n# Windows\n.venv\\\\Scripts\\\\activate\n\`\`\`\n\n`;
      md += `**3. Install dependencies**\n\n\`\`\`bash\n${installCmds.slice(2).join('\n')}\n\`\`\`\n\n`;
    } else if (installCmds.length > 2) {
      md += `**2. Install dependencies**\n\n\`\`\`bash\n${installCmds.slice(2).join('\n')}\n\`\`\`\n\n`;
    }
  }


  // ── Configuration ──
  if (needsEnvVars) {
    md += `## ⚙️ Configuration\n\n`;
    if (hasEnvExample) {
      md += `Copy the example environment file and fill in your values:\n\n\`\`\`bash\ncp .env.example .env\n\`\`\`\n\n`;
    } else {
      md += `Create a \`.env\` file in the project root:\n\n\`\`\`bash\ntouch .env\n\`\`\`\n\n`;
    }
    const envRows = buildEnvVarsTable(repoInfo, stack, projectCategory, paths);
    if (envRows.length > 0) {
      md += `| Variable | Description | Default | Required |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      envRows.forEach(r => { md += `${r}\n`; });
      md += '\n';
    }
    md += `> [!WARNING]\n> Never commit your \`.env\` file. Ensure \`.env\` is listed in your \`.gitignore\`.\n\n---\n\n`;
  }

  // ── Usage ──
  md += `## ▶️ Usage\n\n`;
  if (runCmds.length > 0) {
    // Numbered steps with explanations
    let stepNum = 1;
    if (isWebApp || projectCategory === 'fullstack') {
      // Step 1: paste URL / open the app
      md += `${stepNum++}. **Start the application**\n\n`;
      runCmds.forEach(({ label, cmd }) => {
        md += `   \`\`\`bash\n   ${cmd}\n   \`\`\`\n\n`;
      });
      md += `${stepNum++}. Open [http://localhost:${defaultPort}](http://localhost:${defaultPort}) in your browser\n\n`;
    } else if (isBackend) {
      runCmds.forEach(({ label, cmd }) => {
        md += `${stepNum++}. **${label}**\n\n   \`\`\`bash\n   ${cmd}\n   \`\`\`\n\n`;
      });
      md += `${stepNum++}. The API will be available at \`http://localhost:${defaultPort}\`${stack.tools.has('GraphQL') ? ` — GraphQL playground at \`http://localhost:${defaultPort}/graphql\`` : ''}\n\n`;
    } else {
      runCmds.forEach(({ label, cmd }) => {
        md += `${stepNum++}. **${label}**\n\n   \`\`\`bash\n   ${cmd}\n   \`\`\`\n\n`;
      });
    }
    if (isCLI) {
      md += `${stepNum++}. **Explore available commands**\n\n   \`\`\`bash\n   ${repo} --help\n\n   # Example\n   ${repo} [command] [flags]\n   \`\`\`\n\n`;
    }
    if (isMobile) {
      md += `${stepNum++}. **List connected devices**\n\n   \`\`\`bash\n   flutter devices\n   \`\`\`\n\n`;
      md += `${stepNum++}. **Run on a device or emulator**\n\n   \`\`\`bash\n   flutter run\n   \`\`\`\n\n`;
    }
  } else {
    // Fallback: build a usage section based on main language / files
    md += `1. **Import or reference the project** in your environment.\n\n`;
    if (codeInsights.entryPoints && codeInsights.entryPoints.length > 0) {
      md += `2. **Run or inspect the main entry point**:\n\n   \`\`\`bash\n`;
      const ep = codeInsights.entryPoints[0];
      if (ep.endsWith('.py')) {
        md += `   python ${ep}\n`;
      } else if (ep.endsWith('.js')) {
        md += `   node ${ep}\n`;
      } else if (ep.endsWith('.ts')) {
        md += `   npx ts-node ${ep}\n`;
      } else if (ep.endsWith('.go')) {
        md += `   go run ${ep}\n`;
      } else {
        md += `   # Entry file: ${ep}\n`;
      }
      md += `   \`\`\`\n\n`;
    } else {
      md += `2. Refer to the source files for module structure and functions.\n\n`;
    }
  }
  md += `---\n\n`;


  // ── Testing ──
  if (testCmds.length > 0) {
    md += `## 🧪 Testing\n\n\`\`\`bash\n${testCmds.join('\n')}\n\`\`\`\n\n`;
    if (stack.testing.has('Jest') || stack.testing.has('Vitest')) {
      md += `\`\`\`bash\n# Watch mode (during development)\n${pmRun} test:watch\n\n# Coverage report\n${pmRun} test:coverage\n\`\`\`\n\n`;
    }
    if (stack.testing.has('pytest')) {
      md += `\`\`\`bash\n# Verbose output\npytest -v\n\n# With coverage\npytest --cov=. --cov-report=html\n\`\`\`\n\n`;
    }
    md += `---\n\n`;
  }

  // ── API Reference ──
  if (isBackend) {
    md += `## 📡 API Reference\n\n`;
    if (paths.some(p => /swagger|openapi/i.test(p))) {
      md += `Interactive docs: **Swagger UI** at \`/docs\` · **ReDoc** at \`/redoc\`\n\n`;
    }
    if (codeInsights.routes && codeInsights.routes.length > 0) {
      md += `The following endpoints were detected in the source code:\n\n`;
      md += `| Method | Endpoint | Description |\n`;
      md += `| :--- | :--- | :--- |\n`;
      codeInsights.routes.forEach(route => {
        const [method, ...pathParts] = route.split(' ');
        md += `| \`${method}\` | \`${pathParts.join(' ')}\` | Auto-detected route |\n`;
      });
      md += '\n';
    } else {
      md += `| Method | Endpoint | Description |\n`;
      md += `| :--- | :--- | :--- |\n`;
      md += `| \`GET\` | \`/\` | API root / health check |\n\n`;
    }
    md += `---\n\n`;
  }

  // ── Docker ──
  if (hasDocker || hasDC) {
    md += `## 🐳 Docker\n\n`;
    if (hasDC) {
      md += `**Start all services with Docker Compose:**\n\n\`\`\`bash\ndocker compose up --build\ndocker compose up -d\ndocker compose logs -f\ndocker compose down\n\`\`\`\n\n`;
    }
    md += `**Build and run standalone container:**\n\n\`\`\`bash\ndocker build -t ${owner}/${repo}:latest .\ndocker run -d -p ${defaultPort}:${defaultPort} --env-file .env ${owner}/${repo}:latest\n\`\`\`\n\n---\n\n`;
  }

  // ── Deployment ──
  if (isBackend || isWebApp) {
    md += `## 🌐 Deployment\n\n`;
    if (isWebApp || projectCategory === 'fullstack') {
      md += `### Frontend\n\n`;
      if (stack.frameworks.has('Next.js')) {
        md += `The easiest way to deploy is via [Vercel](https://vercel.com/) — connect your GitHub repo, and it handles builds, preview deployments, and edge functions automatically.\n\n`;
      } else {
        md += `- **Vercel** — zero-config, connect your repo and deploy\n`;
        md += `- **Netlify** — \`netlify deploy --prod\`\n`;
        md += `- **Cloudflare Pages** — excellent for static and edge-rendered apps\n\n`;
      }
    }
    if (isBackend || projectCategory === 'fullstack') {
      md += `### Backend\n\n`;
      md += `| Platform | Notes |\n| :--- | :--- |\n`;
      md += `| **Railway** | Link your repo, add env vars — Railway auto-detects the runtime |\n`;
      md += `| **Render** | Create a Web Service, set build & start commands |\n`;
      md += `| **Fly.io** | \`fly launch\` then \`fly deploy\` for container-based deploys |\n`;
      md += `| **AWS / GCP / Azure** | Containerised deploys via ECS, Cloud Run, or AKS |\n\n`;
    }
    md += `---\n\n`;
  }

  // ── Project Structure ──
  const tree = buildDirectoryTree(paths, 3);
  if (tree) {
    md += `## 📂 Project Structure\n\n${tree}\n\n`;

    // ── File Responsibilities table ──
    // Map key files detected in the repo to their roles
    const fileRoles = [];
    const roleMap = {
      'index.html':       ['`index.html`',       'Serves as the main HTML5 application entry point. It declares the static DOM structure, wraps responsive cards, mounts the core design elements, and imports stylesheets and scripts.'],
      'index.js':         ['`index.js`',          'The primary JavaScript entry point of the project. It bootstraps the application lifecycle, mounts components to the DOM, and orchestrates global events.'],
      'index.ts':         ['`index.ts`',          'The main TypeScript entry point file. It establishes static types, bootstraps components, and handles initial app configuration in a type-safe environment.'],
      'app.js':           ['`app.js`',            'Orchestrates the core logical workflow of the application. It handles DOM event listener bindings, state mutations, calculations, external fetch requests, and utility integration.'],
      'app.ts':           ['`app.ts`',            'Implements the type-safe core orchestration logic. It defines data models/interfaces, coordinates service operations, and manages system state transitions.'],
      'main.py':          ['`main.py`',           'The primary entry point for Python applications. It parses command-line flags, initializes configuration variables, starts server processes, or triggers scripting pipelines.'],
      'app.py':           ['`app.py`',            'Serves as the application factory file for Flask, FastAPI, or Django frameworks. It creates instances of the app object, attaches routes, and registers middleware modules.'],
      'main.go':          ['`main.go`',           'The entry point file for Go services. It defines the main package, parses input arguments, configures database engines, and binds HTTP servers.'],
      'src/main.rs':      ['`src/main.rs`',       'The binary entry point for Rust applications. It boots the Tokio async runtime, binds server sockets, manages threads, and prints structural error traces.'],
      'style.css':        ['`style.css`',         'Declares the CSS design system. It handles CSS custom property declarations, custom layout setups (Grid/Flexbox), smooth theme transitions, and interface styling.'],
      'styles.css':       ['`styles.css`',        'Declares global layout styles and resets. It applies standardized baseline variables, utility utility alignments, and cross-browser styling fixes.'],
      'package.json':     ['`package.json`',      'Defines the project metadata for Node environments. It manages external dependencies, defines scripts (dev, build, start), and locks engine versions.'],
      'requirements.txt': ['`requirements.txt`',  'A simple flat list of Python dependencies. It specifies locked third-party package names and exact versions to guarantee reproducible builds.'],
      'pyproject.toml':   ['`pyproject.toml`',    'Declares build-system requirements and tool parameters for Python packages. It configures linters, code formatters, dependency constraints, and metadata.'],
      'Cargo.toml':       ['`Cargo.toml`',        'Declares project metadata and dependency crates for Rust packages. It defines compiler profiles, library binaries, feature flags, and package attributes.'],
      'go.mod':           ['`go.mod`',            'Establishes the Go module path and lists direct/indirect dependencies. It acts as the manifest for resolving version constraints and integrity hashes.'],
      'Dockerfile':       ['`Dockerfile`',        'Declares the multi-stage Docker build recipe. It optimizes production image layers, copies build artifacts, exposes ports, and sets entrypoints.'],
      'docker-compose.yml': ['`docker-compose.yml`', 'Orchestrates multi-container development and staging environments. It links application components with backend databases, caches, and reverse proxies.'],
      'docker-compose.yaml': ['`docker-compose.yaml`', 'Orchestrates multi-container development and staging environments. It links application components with backend databases, caches, and reverse proxies.'],
      '.env.example':     ['`.env.example`',      'Acts as a template for secret variables. It documents required environment variables (DB URLs, API keys) without committing production values.'],
      'tsconfig.json':    ['`tsconfig.json`',     'Configures compiler behaviors for TypeScript. It enforces strict type checks, configures build target platforms, and configures path aliases.'],
      'vite.config.js':   ['`vite.config.js`',    'Configures build plugins and server properties for Vite. It declares asset resolvers, dev proxy setups, environment loading, and optimization options.'],
      'vite.config.ts':   ['`vite.config.ts`',    'Provides type-safe configuration specifications for Vite. It handles JSX transpilation rules, production bundler parameters, and type checks.'],
      'next.config.js':   ['`next.config.js`',    'Customizes Next.js framework behavior. It configures server-side image domains, API redirects, custom headers, and experimental engine features.'],
      'tailwind.config.js': ['`tailwind.config.js`', 'Customizes the Tailwind CSS framework tokens. It declares content-matching directories, custom color schemes, layout breakpoints, and utility classes.'],
      'CONTRIBUTING.md':  ['`CONTRIBUTING.md`',   'Provides community contribution guidelines. It outlines code style rules, testing instructions, branch naming conventions, and the pull request review process.'],
      'CHANGELOG.md':     ['`CHANGELOG.md`',      'Lists all release versions and semantic differences. It categorizes changes into Added, Changed, Fixed, and Removed categories to inform users of updates.'],
      'SECURITY.md':      ['`SECURITY.md`',       'Outlines the project vulnerability disclosure policy. It details secure contact channels, supported release versions, and coordinate response strategies.'],
    };

    const detectedRoles = Object.entries(roleMap)
      .filter(([file]) => paths.some(p => p === file || p.endsWith('/' + file)))
      .slice(0, 8);

    if (detectedRoles.length > 0) {
      md += `### File Responsibilities\n\n`;
      md += `| File | Role |\n`;
      md += `| :--- | :--- |\n`;
      detectedRoles.forEach(([, [label, role]]) => {
        md += `| ${label} | ${role} |\n`;
      });
      md += '\n';
    } else if (codeInsights.entryPoints && codeInsights.entryPoints.length > 0) {
      md += `**Key entry points scanned:**\n`;
      codeInsights.entryPoints.forEach(ep => { md += `- \`${ep}\`\n`; });
      md += '\n';
    }

    md += `---\n\n`;
  }

  // ── Security ──
  if (isBackend || projectCategory === 'fullstack') {
    md += `## 🔒 Security\n\n`;
    if (hasSecurity) {
      md += `Please read our [Security Policy](./SECURITY.md) for details on reporting vulnerabilities.\n\n`;
    } else {
      md += `If you discover a security vulnerability, please **do not** open a public issue. Instead, use [GitHub's private vulnerability reporting](https://github.com/${owner}/${repo}/security/advisories/new).\n\n`;
    }
    md += `---\n\n`;
  }

  // API endpoints are already displayed under API Reference section above if detected

  // ── Troubleshooting ──
  md += `## 🐛 Troubleshooting\n\n`;

  const troubleshootItems = [];

  // CORS / file:// issue for web apps
  if (isWebApp || projectCategory === 'generic') {
    troubleshootItems.push({
      q: 'Blank output or CORS error when opening `index.html` directly',
      a: `Browsers block certain API calls when a page is opened from the file system (\`file://\`). Serve the project locally instead:\n  \`\`\`bash\n  python -m http.server 8080\n  # then open http://localhost:8080\n  \`\`\``,
    });
  }

  // Node version / install issues
  if (fileContents['package.json']) {
    troubleshootItems.push({
      q: `\`${pm === 'Yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : 'npm install'}\` fails with peer dependency errors`,
      a: `Ensure you are running **Node.js ≥ 18**. Try clearing the cache:\n  \`\`\`bash\n  ${pm === 'Yarn' ? 'yarn cache clean' : pm === 'pnpm' ? 'pnpm store prune' : 'npm cache clean --force'}\n  \`\`\``,
    });
  }

  // Python venv issues
  if (fileContents['requirements.txt'] || fileContents['pyproject.toml']) {
    troubleshootItems.push({
      q: '`ModuleNotFoundError` after installing dependencies',
      a: `Make sure you have activated the virtual environment before running:\n  \`\`\`bash\n  source .venv/bin/activate  # macOS/Linux\n  .venv\\Scripts\\activate    # Windows\n  \`\`\``,
    });
  }

  // Docker startup issues
  if (hasDocker || hasDC) {
    troubleshootItems.push({
      q: 'Docker container exits immediately on startup',
      a: `Check the container logs for the error:\n  \`\`\`bash\n  docker compose logs -f\n  \`\`\`\n  Common causes: missing \`.env\` file, port already in use, or missing database migrations.`,
    });
  }

  if (troubleshootItems.length > 0) {
    troubleshootItems.forEach(({ q, a }) => {
      md += `<details>\n<summary><strong>${q}</strong></summary>\n\n${a}\n\n</details>\n\n`;
    });
    md += `> [!TIP]\n> Still stuck? [Open an issue](https://github.com/${owner}/${repo}/issues/new) on the repository to get help.\n\n---\n\n`;
  }

  // ── Roadmap ──
  md += `## 🗺️ Roadmap\n\n`;
  const roadmapItems = ['- [x] Initial release'];
  if (isWebApp || projectCategory === 'fullstack') {
    if (!projectUsesAuth(stack, paths)) roadmapItems.push('- [ ] User authentication & account management');
    roadmapItems.push('- [ ] Dark/light mode toggle');
    roadmapItems.push('- [ ] Accessibility (WCAG 2.1 AA) audit and fixes');
    roadmapItems.push('- [ ] Internationalisation (i18n) support');
  }
  if (isBackend || projectCategory === 'fullstack') {
    if (!stack.databases.has('Redis')) roadmapItems.push('- [ ] API response caching with Redis');
    roadmapItems.push('- [ ] Rate limiting and abuse protection');
    roadmapItems.push('- [ ] OpenAPI / Swagger documentation');
  }
  if (isCLI) {
    roadmapItems.push('- [ ] Shell completions (bash, zsh, fish)');
    roadmapItems.push('- [ ] Plugin system for extending functionality');
  }
  if (testCmds.length === 0) roadmapItems.push('- [ ] Test suite with >80% coverage');
  if (!stack.cicd.has('GitHub Actions')) roadmapItems.push('- [ ] CI/CD pipeline with GitHub Actions');

  roadmapItems.slice(0, 8).forEach(item => { md += `${item}\n`; });
  md += `\nSee [open issues](https://github.com/${owner}/${repo}/issues) for a full list of proposed features and known bugs.\n\n---\n\n`;

  // ── Contributing ──
  md += `## 🤝 Contributing\n\n`;
  md += `Contributions make the open-source community a better place — thank you!\n\n`;
  md += `1. **Fork** the repository\n`;
  md += `2. **Create** a feature branch — \`git checkout -b feat/your-feature-name\`\n`;
  md += `3. **Commit** your changes — \`git commit -m 'feat: add your feature'\`\n`;
  md += `4. **Push** to the branch — \`git push origin feat/your-feature-name\`\n`;
  md += `5. **Open** a Pull Request and describe what you've done\n\n`;
  if (hasContrib) {
    md += `Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.\n\n`;
  }
  if (stack.tools.has('TypeScript') || fileContents['.eslintrc.js'] || fileContents['.eslintrc.json']) {
    md += `> [!TIP]\n> Run \`${pmRun} lint\` and \`${pmRun} type-check\` before submitting your PR to catch issues early.\n\n`;
  }
  md += `---\n\n`;

  // ── Changelog ──
  if (hasChangelog) {
    md += `## 📝 Changelog\n\nAll notable changes are documented in [CHANGELOG.md](./CHANGELOG.md).\n\n---\n\n`;
  }

  // ── Acknowledgements ──
  if (acks && acks.length > 0) {
    md += `## 🙏 Acknowledgements\n\nThis project is built on top of excellent open-source work:\n\n`;
    acks.forEach(a => { md += `- ${a}\n`; });
    md += '\n---\n\n';
  }

  // ── License ──
  md += `## 📄 License\n\n`;
  if (license && license !== 'NOASSERTION') {
    md += `Distributed under the **${license} License**. See [\`LICENSE\`](./LICENSE) for more information.\n\n`;
  } else {
    md += `This project does not currently specify a license. Contact the author for usage permissions.\n\n`;
  }

  md += `---\n\n`;
  md += `<div align="center">\n\nMade with ❤️ by [${owner}](https://github.com/${owner})\n\n`;
  md += `⭐ **If this project helped you, please give it a star!**\n\n</div>\n`;

  return md;
}

// ── Markdown to HTML renderer ─────────────────────────────────
function renderMarkdown(md) {
  let html = escapeForRendering(md);

  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Code blocks (before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<pre>${langLabel}<code>${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // GitHub Alerts
  html = html.replace(/^&gt; \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n&gt; (.+)$/gm, (_, type, content) => {
    const typeMap = {
      NOTE: { icon: 'ℹ️', cls: 'alert-note' },
      TIP: { icon: '💡', cls: 'alert-tip' },
      IMPORTANT: { icon: '📌', cls: 'alert-important' },
      WARNING: { icon: '⚠️', cls: 'alert-warning' },
      CAUTION: { icon: '🚨', cls: 'alert-caution' },
    };
    const t = typeMap[type] || typeMap.NOTE;
    return `<div class="gh-alert ${t.cls}"><span class="alert-icon">${t.icon}</span><span>${type}</span><p>${content}</p></div>`;
  });

  // Bold & Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

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

  // Task lists
  html = html.replace(/^(\s*)- \[x\] (.+)$/gm, '$1<li class="task-item done"><span class="task-check checked">✓</span>$2</li>');
  html = html.replace(/^(\s*)- \[ \] (.+)$/gm, '$1<li class="task-item"><span class="task-check">○</span>$2</li>');

  // Regular lists
  html = html.replace(/^(\s*)([-*+]) (.+)$/gm, '$1<li-ul>$3</li-ul>');
  html = html.replace(/^(\s*)(\d+)\. (.+)$/gm, '$1<li-ol>$3</li-ol>');
  html = html.replace(/(<li-ul>.*<\/li-ul>(\n)?)+/g, m => `<ul>${m.replace(/<li-ul>/g, '<li>').replace(/<\/li-ul>/g, '</li>')}</ul>`);
  html = html.replace(/(<li-ol>.*<\/li-ol>(\n)?)+/g, m => `<ol>${m.replace(/<li-ol>/g, '<li>').replace(/<\/li-ol>/g, '</li>')}</ol>`);

  // Task list groups
  html = html.replace(/(<li class="task-item[^"]*">.*<\/li>(\n)?)+/g, m => `<ul class="task-list">${m}</ul>`);

  // div align
  html = html.replace(/<div align="center">([\s\S]*?)<\/div>/gm, '<div style="text-align:center">$1</div>');

  // Paragraphs
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  // Badge rows
  html = html.replace(/<p>(<img[^>]+>(\s*<img[^>]+>)*)\s*<\/p>/g, '<div class="badge-row">$1</div>');

  // Clean up
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

function escapeForRendering(md) {
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
  generateBtn.classList.add('loading');
  ['step1','step2','step3','step4','step5'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'done');
    const dot = el.querySelector('.step-dot');
    if (dot) dot.classList.remove('active', 'done');
  });
  setStep(1, 10);
}

function setStep(n, progress) {
  for (let i = 1; i < n; i++) {
    const el = document.getElementById(`step${i}`);
    if (!el) continue;
    el.classList.add('done');
    el.classList.remove('active');
    const dot = el.querySelector('.step-dot');
    if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
  }
  const el = document.getElementById(`step${n}`);
  if (el) {
    el.classList.add('active');
    const dot = el.querySelector('.step-dot');
    if (dot) dot.classList.add('active');
  }

  const bar = document.getElementById('loadingBar');
  if (bar && progress != null) bar.style.width = `${progress}%`;

  const labels = ['', 'Fetching repository info', 'Scanning file structure', 'Reading config & source files', 'Generating README…', 'Finalising output'];
  const stepEl = document.getElementById('loadingStep');
  if (stepEl) stepEl.textContent = labels[n] || '';
}

function showError(msg) {
  hideAll();
  errorState.classList.remove('hidden');
  errorMessage.textContent = msg;
  generateBtn.disabled = false;
  generateBtn.classList.remove('loading');
}

function showResult(info, markdown) {
  hideAll();
  resultSection.classList.remove('hidden');
  generateBtn.disabled = false;
  generateBtn.classList.remove('loading');

  buildStatsBar(info);
  buildOutlinePanel(markdown);

  document.getElementById('markdownPreview').innerHTML = renderMarkdown(markdown);
  document.getElementById('rawMarkdown').textContent = markdown;

  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildStatsBar(info) {
  const statsBar = document.getElementById('repoStatsBar');
  const lang = info.language || '';
  const stars = formatNum(info.stargazers_count);
  const forks = formatNum(info.forks_count);
  const updatedAt = new Date(info.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const size = info.size > 1024 ? (info.size / 1024).toFixed(1) + ' MB' : info.size + ' KB';

  statsBar.innerHTML = `
    <div class="stat-repo-info">
      <a href="${info.html_url}" target="_blank" rel="noopener" class="stat-repo-name">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
        ${info.full_name}
      </a>
      ${info.description ? `<span class="stat-repo-desc">${info.description}</span>` : ''}
    </div>
    <div class="stat-chips">
      ${lang ? `<div class="stat-chip"><span class="lang-dot" style="background:${getLangColor(lang)}"></span>${lang}</div>` : ''}
      <div class="stat-chip">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
        ${stars}
      </div>
      <div class="stat-chip">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 3.314-2.686 6-6 6-3.314 0-6-2.686-6-6V9"/></svg>
        ${forks}
      </div>
      <div class="stat-chip">Updated ${updatedAt}</div>
      <div class="stat-chip">${size}</div>
    </div>
  `;
}

function getLangColor(lang) {
  const colors = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26',
    CSS: '#563d7c', Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', Kotlin: '#F18E33',
    'C#': '#178600', 'C++': '#f34b7d', Ruby: '#701516', Swift: '#F05138', PHP: '#4F5D95',
    Dart: '#00B4AB', Shell: '#89e051', Vue: '#41b883', Svelte: '#ff3e00',
  };
  return colors[lang] || '#8b949e';
}

function buildOutlinePanel(markdown) {
  const outlineEl = document.getElementById('outlinePanel');
  if (!outlineEl) return;

  const headings = [];
  markdown.split('\n').forEach(line => {
    const m = line.match(/^(#{2,3}) (.+)$/);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/[*_`]/g, '').replace(/:[a-z_]+:/g, '').trim();
      headings.push({ level, text });
    }
  });

  if (headings.length < 3) { outlineEl.style.display = 'none'; return; }

  outlineEl.style.display = 'block';
  outlineEl.innerHTML = `
    <div class="outline-title">On this page</div>
    <nav class="outline-nav">
      ${headings.map(h => `
        <a class="outline-link level-${h.level}" href="#" onclick="scrollToHeading(event, '${h.text.replace(/'/g, "\\'")}')">
          ${h.text}
        </a>
      `).join('')}
    </nav>
  `;
}

function scrollToHeading(e, text) {
  e.preventDefault();
  const preview = document.getElementById('markdownPreview');
  if (!preview) return;
  const headings = preview.querySelectorAll('h1, h2, h3, h4');
  for (const el of headings) {
    if (el.textContent.trim().toLowerCase().includes(text.toLowerCase().substring(0, 20))) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
  }
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
  generateBtn.classList.remove('loading');
  repoUrlInput.focus();
  if (isSplitView) toggleSplitView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchTab(tab) {
  const ptab = document.getElementById('previewTab');
  const rtab = document.getElementById('rawTab');

  if (tab === 'preview') {
    ptab.classList.add('active');
    rtab.classList.remove('active');
    previewPane.classList.remove('hidden');
    rawPane.classList.add('hidden');
  } else {
    rtab.classList.add('active');
    ptab.classList.remove('active');
    rawPane.classList.remove('hidden');
    previewPane.classList.add('hidden');
    if (isSplitView) toggleSplitView();
  }
}

function toggleSplitView() {
  const resultEl = document.getElementById('resultSection');
  const splitBtn = document.getElementById('splitViewBtn');
  isSplitView = !isSplitView;

  if (isSplitView) {
    resultEl.classList.add('split-active');
    previewPane.classList.remove('hidden');
    rawPane.classList.remove('hidden');
    document.getElementById('previewTab').classList.add('active');
    document.getElementById('rawTab').classList.remove('active');
    if (splitBtn) { splitBtn.classList.add('active'); splitBtn.title = 'Exit split view'; }
  } else {
    resultEl.classList.remove('split-active');
    rawPane.classList.add('hidden');
    previewPane.classList.remove('hidden');
    if (splitBtn) { splitBtn.classList.remove('active'); splitBtn.title = 'Split view'; }
  }
}

async function copyMarkdown() {
  if (!currentMarkdown) return;
  const btn = document.getElementById('copyBtn');
  try {
    await navigator.clipboard.writeText(currentMarkdown);
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    }, 2500);
  } catch {
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
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

function formatApiError(err) {
  if (err.status === 404) return 'Repository not found. Make sure the URL is correct and the repository is public.';
  if (err.status === 403) return 'GitHub API rate limit reached (60 req/hr for unauthenticated users). Please wait a few minutes and try again.';
  if (err.status === 451) return 'This repository is unavailable due to a legal reason (DMCA takedown).';
  if (err.message?.includes('NetworkError') || err.message?.includes('Failed to fetch')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  return `Unexpected error: ${err.message || 'Unknown error'}. Please try again.`;
}

function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
