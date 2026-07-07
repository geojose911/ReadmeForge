# README GENERATOR

<div align="center">

# 📄 ReadmeForge

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![GitHub API](https://img.shields.io/badge/GitHub_API-181717?style=flat-square&logo=github&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

**Instantly generate a beautiful, professional `README.md` for any public GitHub repository — no login, no API key, no server needed.**

[🚀 Usage](#-usage) · [🐛 Troubleshooting](#-troubleshooting) · [🗺️ Roadmap](#%EF%B8%8F-roadmap)

</div>

---

## 📖 Overview

**ReadmeForge** is a fully client-side web application that turns any public GitHub repository URL into a comprehensive, production-quality `README.md` in seconds. Simply paste a repo URL, and ReadmeForge will:

- Fetch repository metadata via the **GitHub Public REST API**
- Scan the full **file tree** to detect languages, frameworks, databases, and tooling
- Read key configuration files (`package.json`, `requirements.txt`, `Cargo.toml`, etc.)
- Auto-generate a richly structured Markdown document with badges, installation steps, API references, deployment guides, and more

No login required. No data stored. Everything runs in your browser.

---

## ✨ Features

- **🔍 Intelligent Tech Stack Detection** — Identifies languages (20+), frameworks (React, Next.js, Django, FastAPI, Gin, Flutter, and more), databases, testing libraries, and CI/CD pipelines from file extensions and config contents
- **📦 Smart Install & Run Commands** — Auto-generates correct install (`npm install`, `pip install`, `cargo build`, etc.) and run commands based on the detected package manager and framework
- **🏷️ Dynamic Badge Generation** — Produces `shields.io` badges for the detected language, frameworks, stars, forks, license, and CI status
- **👁️ Live Markdown Preview** — Renders the generated README in a styled preview pane side-by-side with the raw Markdown source
- **📋 One-Click Copy & Download** — Copy the Markdown to clipboard or download `README.md` directly with a single click
- **⚡ Animated Loading States** — Step-by-step progress indicator with animated dots during generation
- **🎨 Premium Dark UI** — Glassmorphism design with animated ambient orbs, gradient text, and smooth micro-animations built entirely in vanilla CSS
- **🔗 No API Key Required** — Uses the unauthenticated GitHub Public API (60 requests/hour per IP)

---

## 🛠️ Tech Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Structure** | HTML5 | Semantic markup and UI layout |
| **Styling** | Vanilla CSS3 | Glassmorphism design, animations, responsive layout |
| **Logic** | Vanilla JavaScript (ES2020+) | GitHub API calls, Markdown generation, DOM rendering |
| **Fonts** | Inter + JetBrains Mono (Google Fonts) | Typography — UI text and monospace code blocks |
| **Data Source** | GitHub Public REST API v3 | Repository metadata, file tree, raw file contents |

> No build step. No bundler. No dependencies. Zero-install, open-in-browser ready.

---

## 🗂️ Project Structure

```
README generator/
├── index.html      # App shell — layout, hero, result panes, loading & error states
├── style.css       # Full design system — tokens, components, animations, markdown renderer
└── app.js          # Core logic — GitHub API, tech detection, Markdown builder, UI control
```

### File Responsibilities

| File | Role |
| :--- | :--- |
| `index.html` | Declares the static shell: sticky header, hero input card, animated loading/error states, tabbed result section (Preview + Raw), and the "How it works" step grid |
| `style.css` | Defines all CSS custom properties (`--purple`, `--gradient`, etc.), component styles (cards, tabs, action buttons), floating background orbs, and a full GitHub-style Markdown preview renderer |
| `app.js` | Orchestrates the entire pipeline: URL parsing → GitHub API fetching → tech stack detection → README Markdown assembly → DOM injection and UI state transitions |

---

## 🚀 Getting Started

ReadmeForge requires **no installation** — it is plain HTML/CSS/JS.

### Option 1 — Open directly in a browser

```bash
# Clone the repository
git clone https://github.com/your-username/readme-generator.git
cd "README generator"

# Open in browser
# Windows:
start index.html

# macOS:
open index.html

# Linux:
xdg-open index.html
```

### Option 2 — Serve locally (recommended to avoid CORS edge cases)

```bash
# Using Python's built-in server
python -m http.server 8080

# Using Node.js (npx, no install needed)
npx serve .

# Using VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

Then navigate to `http://localhost:8080` in your browser.

---

## 📋 Usage

1. **Paste a GitHub URL** into the input field:
   ```
   https://github.com/facebook/react
   ```
2. Press **Enter** or click the **Generate README** button
3. Watch the animated step-by-step progress as ReadmeForge:
   - Fetches repository info
   - Scans the file structure
   - Reads key config files
   - Generates the README
4. Switch between **Preview** (rendered) and **Raw Markdown** tabs
5. Click **Copy** to copy to clipboard or **Download** to save `README.md`

### Example Repositories to Try

| Repository | What Gets Detected |
| :--- | :--- |
| `facebook/react` | JavaScript, npm, GitHub Actions CI badges |
| `tiangolo/fastapi` | Python, FastAPI, pytest, Docker |
| `axios/axios` | TypeScript, npm, Jest |
| `tokio-rs/tokio` | Rust, Cargo.toml, Tokio async runtime |
| `gin-gonic/gin` | Go, `go.mod`, Gin web framework |

---

## ⚙️ Technical Deep Dive

### 1. URL Parsing — `parseGitHubUrl(url)`
Validates and extracts `{ owner, repo }` from any GitHub URL using the Web `URL` API. Strips `.git` suffixes automatically. Returns `null` for invalid or non-GitHub URLs.

### 2. GitHub API Fetching — `generateReadme(owner, repo)`
Three sequential fetch calls:
| Step | Endpoint | Data Retrieved |
| :--- | :--- | :--- |
| 1 | `api.github.com/repos/{owner}/{repo}` | Name, description, stars, forks, license, topics, default branch |
| 2 | `api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1` | Full file path list (falls back to top-level on large repos) |
| 3 | `raw.githubusercontent.com/{owner}/{repo}/{branch}/{file}` | Raw content of up to 10 priority config files |

### 3. Tech Stack Detection — `detectTechStack(paths, fileContents)`
Two complementary strategies:
- **Extension frequency counting** — maps `.ts`, `.py`, `.rs`, `.go`, etc. to language names, ranked by count to determine the primary language
- **Config file parsing** — reads `package.json` dependencies, Python requirements, `Cargo.toml`, and `go.mod` to surface specific frameworks, databases, test libraries (Jest, pytest, Playwright, etc.), and CI/CD tools (GitHub Actions, Travis CI, CircleCI)

### 4. README Assembly — `buildReadme(repoInfo, paths, fileContents)`
Generates a Markdown string section by section:
- Centered header with title, `shields.io` badges, and links
- Overview, topics/tags, and table of contents
- Feature list, tech stack table
- Architecture diagram (for backend/full-stack projects)
- Prerequisites, clone + install commands, environment variable table
- Usage / run commands; API reference table with sample payload
- Testing commands (with watch/coverage variants); Docker Compose snippets
- Deployment guide (Vercel, Netlify, Render, Railway, AWS, GCP, DigitalOcean)
- Directory tree (up to 3 levels), troubleshooting FAQ, roadmap, contributing, license

### 5. Markdown Rendering
A lightweight built-in parser converts the raw Markdown string to HTML, handling: headings (`#`–`###`), bold/italic, fenced code blocks, inline code, links, unordered/ordered lists, blockquotes, tables, `<div>` pass-through, and horizontal rules.

---

## 🌐 GitHub API Rate Limits

ReadmeForge uses the **unauthenticated** GitHub Public API, which allows **60 requests per hour per IP address**. Each README generation consumes approximately 3–5 requests.

If you hit the rate limit, the error card will display a descriptive message. You can:
- Wait ~1 hour for the limit to reset
- Add a Personal Access Token to `app.js`:

```js
// In the fetchJSON() function, add the Authorization header:
headers: {
  'Accept': 'application/vnd.github.v3+json',
  'Authorization': 'token ghp_YOUR_PERSONAL_ACCESS_TOKEN'
}
```

> ⚠️ **Never commit a real token to a public repository.**

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** this repository
2. **Create** a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit** your changes:
   ```bash
   git commit -m "feat: add Bun lockfile detection"
   ```
4. **Push** to your fork and open a **Pull Request**

### Areas to Contribute

- [ ] Support for GitLab / Bitbucket URLs
- [ ] Optional Personal Access Token input for higher rate limits
- [ ] More framework detections (Remix, SvelteKit, Hono, Axum, etc.)
- [ ] Section toggle UI to selectively include/exclude README sections
- [ ] Multiple README templates / themes (minimal, detailed, academic)
- [ ] Export to PDF or HTML

---

## ❓ Troubleshooting

**"GitHub API error: 403" or rate limit message**
> Exceeded the 60 req/hr unauthenticated limit. Wait ~1 hour, or add a Personal Access Token (see [GitHub API Rate Limits](#-github-api-rate-limits)).

**"GitHub API error: 404"**
> The repository is private, doesn't exist, or the URL is malformed. Only **public** repositories are supported.

**Some sections (frameworks, databases) are missing from the generated README**
> ReadmeForge detects these from config files at the repository root. Repos with non-standard structures may have incomplete detection.

**The file tree seems incomplete for a very large repository**
> GitHub's recursive tree API has a size limit. ReadmeForge automatically falls back to a top-level listing in this case.

**Fonts don't load when opening `index.html` directly**
> Google Fonts requires a network connection. Ensure you are online, or use Option 2 (local server).

---

## 🗺️ Roadmap

- [x] Core README generation from GitHub Public API
- [x] Tech stack detection (20+ languages, 30+ frameworks)
- [x] Live tabbed Preview / Raw Markdown panes
- [x] Copy to clipboard & download as `README.md`
- [x] Animated step-by-step loading UI
- [x] Repository stats bar (stars, forks, language, license)
- [ ] GitLab & Bitbucket URL support
- [ ] Authenticated API mode (optional PAT input field)
- [ ] Per-section toggle checkboxes before generation
- [ ] Multiple README template themes
- [ ] Export to PDF / standalone HTML

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

<div align="center">

Built with ❤️ using the **GitHub Public API** &nbsp;·&nbsp; No login required &nbsp;·&nbsp; No data stored

</div>


