# Silent Feed - English Documentation

<div align="center">

<img src="assets/icons/128/base-static.png" width="128" height="128" alt="Silent Feed Logo" />

**An AI-powered RSS reader that brings you quiet, focused reading experience**

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue.svg)](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/wxy/SilentFeed)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Language](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)

[中文](README.zh-CN.md) | [Back to Home](README.md)

</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Why Silent Feed](#why-silent-feed)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Architecture](#architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## About

Silent Feed is an innovative RSS reader browser extension that works differently from traditional RSS readers.

### Core Philosophy

**Not about managing RSS, but letting AI be your "information gatekeeper"**

Traditional RSS readers' problems:
- 📚 50+ subscriptions, 200+ daily articles
- 😰 Unread accumulation anxiety, afraid of missing important content
- ⏱️ No time to browse everything, inaccurate recommendations
- 🔧 Requires frequent tag and category maintenance

Silent Feed's solution:
- 🤫 **Silent Learning**: Automatically analyze browsing behavior in background
- 🎯 **Smart Filtering**: AI automatically filters out 3-5 most interesting articles
- 🔒 **Privacy First**: All analysis done locally by default
- 🌱 **Progressive Growth**: 100-page cold start, gradually learns your interests

### Name Meaning

- **Silent**: Non-intrusive, works quietly in background
- **Feed**: RSS feed source
- **静阅 (Jìng Yuè)**: Quiet reading, restrained information consumption

---

## Features

### 1. 🤫 Automatic Browsing Behavior Analysis

**No setup required, automatically learn your interests**

- Auto-collect browsing history (privacy-protected mode)
- Smart filter valid pages (dwell time > 30s)
- Extract keywords using TF-IDF and NLP
- Build localized user interest profile

<details>
<summary>📊 Profile Building Details</summary>

Silent Feed analyzes following dimensions:
- **Topic Classification**: 11 topics (technology, science, business, arts, etc.)
- **Keyword Extraction**: TF-IDF algorithm
- **Behavior Weighting**: Dwell time, visit frequency
- **Privacy Protection**: Auto-filter sensitive domains (banking, medical, etc.)

</details>

### 2. 🎯 AI-Powered Recommendations

**Only pushes content you truly care about**

- **Multiple AI Engines**:
  - 🤖 DeepSeek Chat (Low cost, great performance)
  - 🧮 Rule-based Recommender (No API required)
  - 👽 DeepSeek Reasoner (Deep reasoning mode)
  - ⚙️ More engines coming (OpenAI, Anthropic)

- **Recommendation Strategy**:
  - 3-5 recommendations per time
  - Match user profile with article content
  - Recommendation score visualization
  - Detailed reasoning explanation

<details>
<summary>💡 AI Cost Control</summary>

Silent Feed provides transparent cost control:
- **DeepSeek Chat**: $0.0001/article (Recommended)
- **DeepSeek Reasoner**: $0.001/article (Deep reasoning)
- **Rule Engine**: Completely free

You can:
- View real-time AI cost statistics
- Set daily/monthly budget
- Switch recommendation engine anytime
- Use free rule-based engine

</details>

### 3. 📡 RSS Auto-discovery and Management

**Intelligent RSS subscription experience**

- 🔍 Auto-detect RSS feeds on current page
- ⚡ One-click subscription
- 📥 Batch import (OPML files)
- 🎯 Article quality scoring
- ⏰ Smart fetch scheduling

<details>
<summary>🔧 RSS Management Features</summary>

- **Auto Scheduling**: Adjust fetch interval based on update frequency
- **Quality Scoring**: Evaluate article quality (title, summary, content completeness)
- **Error Handling**: Auto-retry failed fetches
- **Data Statistics**: Feed analysis, article trends
- **OPML Support**: Import/export subscription lists

</details>

### 4. 🔔 Restrained Notifications

**Only notifies when valuable**

- Smart notification timing
- Avoid frequent interruptions
- Customizable notification rules
- Desktop notifications + extension icon badges

### 5. 🌱 Gamification Experience

**Visualize interest growth**

- 📊 100-page cold start countdown
- 🎯 Interest profile visualization
- 📈 Data collection progress
- 🏆 Achievement system (planned)

---

## Why Silent Feed

### Comparison with Traditional RSS Readers

| Feature | Traditional RSS Reader | Silent Feed |
|---------|----------------------|-------------|
| **Info Filtering** | ❌ Manual classification | ✅ AI auto-filtering |
| **Personalization** | ❌ Based on settings | ✅ Based on actual behavior |
| **Interaction** | ❌ Active checking | ✅ Passive notifications |
| **Learning Curve** | ❌ Requires configuration | ✅ Zero-config auto-learning |
| **Info Burden** | ❌ Unread anxiety | ✅ Only important content |
| **Privacy** | ⚠️ Data uploaded to server | ✅ Local processing/Own API |

### Use Cases

✅ **Good for you if you:**
- Subscribe to many RSS feeds (50+)
- Don't have time to check all content
- Want AI to filter information
- Care about privacy
- Like automation tools

❌ **May not suit you if you:**
- Only subscribe to 1-2 feeds
- Like manually managing every item
- Don't trust AI recommendations
- Don't want browsing data collected

---

## Quick Start

### User Installation (Recommended)

> ⚠️ **Note**: Extension will be available on Chrome Web Store soon

#### Method 1: From Chrome Web Store (Coming Soon)

1. Visit Chrome Web Store
2. Search for "Silent Feed"
3. Click "Add to Chrome"
4. Complete onboarding process

#### Method 2: Developer Mode (Current)

1. **Download Latest Release**
   ```bash
   # Download from GitHub Releases
   wget https://github.com/wxy/SilentFeed/releases/latest/download/silentfeed.zip
   unzip silentfeed.zip
   ```

2. **Load Extension**
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the extracted directory

3. **Start Using**
   - Click extension icon
   - Complete onboarding (optional AI configuration)
   - Browse normally
   - Recommendations start after 100 pages

For detailed instructions, see [User Guide](docs/USER_GUIDE.md)

---

### Developer Installation

#### Requirements

- **Node.js**: ≥ 18.0.0
- **npm**: ≥ 9.0.0
- **Chrome**: ≥ 121

#### Setup

```bash
# 1. Clone repository
git clone https://github.com/wxy/SilentFeed.git
cd SilentFeed

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

#### Load Extension

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `build/chrome-mv3-dev` directory

#### Development Commands

```bash
# Development mode (hot reload)
npm run dev

# Production build
npm run build

# Run tests
npm test

# Test coverage
npm run test:coverage

# Package extension
npm run package

# I18n translation
npm run i18n:translate
```

---

## Usage Guide

### First Use

1. **After installation**, onboarding page opens automatically

2. **Configure AI (Optional)**
   - Supports DeepSeek / OpenAI / Anthropic
   - Can skip, use free rule engine
   - Can configure later in settings

3. **Browse Normally**
   - Extension collects browsing data in background
   - Progress visible in popup

4. **After 100 Pages**
   - AI recommendations start
   - Click extension icon to view

### Core Features

#### View Recommendations

1. Click extension icon
2. View AI-recommended articles
3. Click title to open article
4. Click "Not Interested" to skip

#### Manage RSS Subscriptions

1. Right-click extension icon → "Options"
2. Enter "RSS Settings" tab
3. Add/remove feeds
4. Import OPML files

#### View Interest Profile

1. Open settings page
2. Enter "Profile Settings" tab
3. View topic distribution
4. View keyword cloud

#### Configure AI

1. Open settings page
2. Enter "AI Configuration" tab
3. Select AI engine
4. Input API Key
5. Test connection

For more tutorials, see [User Guide](docs/USER_GUIDE.md)

---

## Architecture

### Tech Stack

- **Framework**: Plasmo 0.90.5 (Chrome Extension MV3)
- **Language**: TypeScript 5.3 (Strict Mode)
- **UI**: React 18 + Tailwind CSS
- **State**: Zustand 5.0
- **Database**: Dexie.js 4.2 (IndexedDB)
- **AI**: OpenAI / Anthropic / DeepSeek / Chrome AI
- **Testing**: Vitest 4.0 + Testing Library
- **I18n**: i18next 25.6

### Project Structure

```
SilentFeed/
├── src/
│   ├── background/        # Service Worker
│   ├── contents/          # Content Scripts
│   ├── components/        # React Components
│   ├── core/             # Core Business Logic
│   │   ├── ai/           # AI Adapters
│   │   ├── profile/      # User Profiling
│   │   ├── recommender/  # Recommendation Engine
│   │   └── rss/          # RSS Management
│   ├── storage/          # Database
│   ├── utils/            # Utilities
│   └── i18n/             # Internationalization
├── public/               # Static Assets
├── docs/                 # Documentation
└── tests/                # Tests
```

For detailed architecture, see [Chinese Documentation](README.zh-CN.md#技术架构)

---

## Testing

### Run Tests

```bash
# Watch mode (for development)
npm test

# Run once (for CI/CD)
npm run test:run

# Generate coverage report
npm run test:coverage

# Visual UI
npm run test:ui
```

### Test Coverage

Current coverage (v0.1.0):

```
Overall Coverage:
- Lines: 74.07%
- Functions: 75.33%
- Branches: 65.82%

Core Modules (>90%):
- ProfileBuilder
- TopicClassifier
- RSSFetcher
- TextAnalyzer
- DwellTimeCalculator
```

See [Testing Documentation](docs/TESTING.md) for details

---

## Contributing

We welcome all forms of contributions!

### How to Contribute

- 🐛 [Report Bugs](https://github.com/wxy/SilentFeed/issues)
- 💡 [Suggest Features](https://github.com/wxy/SilentFeed/issues)
- 📖 Improve documentation
- 🔧 Submit code
- 🌍 Translate to other languages

### Development Workflow

1. **Fork repository**
2. **Create branch**: `git checkout -b feature/your-feature`
3. **Develop feature**: Follow code conventions
4. **Write tests**: Ensure coverage meets requirements
5. **Commit code**: `git commit -m "feat: your feature"`
6. **Push branch**: `git push origin feature/your-feature`
7. **Create PR**: Describe your changes

See [Contributing Guide](CONTRIBUTING.md) for details

---

## License

This project is licensed under the [MIT License](LICENSE).

You can:
- ✅ Commercial use
- ✅ Modify code
- ✅ Distribute code
- ✅ Private use

Provided that:
- 📝 Retain copyright notice
- 📝 Retain license text

---

## Acknowledgments

### Technology Stack

- [Plasmo](https://www.plasmo.com/) - Powerful browser extension framework
- [Dexie.js](https://dexie.org/) - Elegant IndexedDB wrapper
- [React](https://reactjs.org/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Vitest](https://vitest.dev/) - Testing framework

### Community

- All users who provided feedback and testing
- All developers who contributed code
- All friends who starred this project

---

<div align="center">

**Made with ❤️ by Silent Feed Team**

[⭐ Star on GitHub](https://github.com/wxy/SilentFeed) | [🐦 Follow Updates](https://twitter.com/silentfeed)

If you find this project useful, please give us a Star ⭐

</div>
