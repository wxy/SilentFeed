# v0.3.2 Release Notes

## 🎯 Highlights

### 📊 AI Usage Visual Analytics
Professional tri-chart dashboard with Token Usage, API Calls, and Cost tracking. Support for daily/monthly views, reasoning vs non-reasoning mode comparison, and interactive tooltips.

### 🌐 Enhanced Internationalization
- Bilingual technical terms: "词元（Token）" format
- Full date format localization (Chinese: 2024年12月07日, English: 2024-12-07)
- 100% translation coverage for all user-facing text

### 🎨 UI/UX Improvements
- Default style changed to Standard (prevents initial flash)
- Smoother page load without style flickering

## 🐛 Bug Fixes

### Ollama Integration
- ✅ Fixed DNR configuration using Plasmo's `.plasmo` directory
- ✅ Static rules for `localhost:11434` and `127.0.0.1:11434`
- ✅ CORS headers correctly removed

### Page Tracking
- ❌ Chrome internal pages (`chrome://`) no longer tracked
- ❌ Settings page doesn't trigger profile rebuild
- ❌ Duplicate page learning prevented

### AI Usage Statistics
- ✅ Daily aggregation fixed
- ✅ Cost precision improved to 4 decimal places
- ✅ Chart overflow handled with horizontal scrolling

## 📈 Performance

**Profile Generation Optimization**
- Debounced rebuilds: batch dismissals within 5 seconds
- 80% reduction in redundant AI calls
- Lower costs for rapid article filtering

## 🧪 Quality

- ✅ 93/93 test files passing
- ✅ 1492/1492 test cases passing
- ✅ ~73% code coverage

## 📦 Installation

### Chrome Web Store
Auto-update within hours

### Manual Install
1. Download `silentfeed-0.3.2.zip`
2. Unzip to local directory
3. Chrome Extensions → Developer Mode → Load Unpacked

## 🔗 Links

- **Full Release Notes**: [docs/RELEASE_0.3.2.md](docs/RELEASE_0.3.2.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Pull Request**: #66

---

**Silent Feed v0.3.2** - 20 commits, 3 major features, 10+ bug fixes
