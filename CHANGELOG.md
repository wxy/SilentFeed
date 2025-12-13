# Changelog

## [0.3.5] - 2025-12-13

### Added

- **Multi-Currency AI Cost Architecture** ([#81](https://github.com/wxy/SilentFeed/pull/81))
  - Currency-aware cost calculation for each provider (USD, CNY, FREE)
  - Separate budget tracking and statistics per currency
  - Auto-hide zero-value currencies in all cost views
  - CSV export with Currency column
  - Unified `formatCurrency()` utility function
  - 100% test coverage with all pre-push checks passing

- **Enhanced Onboarding Experience**
  - Local Ollama support in AI configuration step (Step 2)
  - Auto-detect local AI service availability
  - Preset strategy auto-apply after successful connection test
  - Tips cards in learning phase (consistent with recommendation empty state)
  - One-click RSS feed subscription from example sources
  - Real feed names (Hacker News, 奇客Solidot) instead of placeholders

- **AI Provider Card UI Improvements**
  - Status icons (🟢🔴⚪) moved to left side, next to provider name
  - Type and feature icons (☁️🔬⭐🔵) right-aligned
  - All icons with help cursor (cursor-help) for discoverability
  - Vertical centering with `items-center`
  - Buttons fixed to card bottom

### Changed

- **Cost Display Optimization**
  - Removed top hints and column gridlines from cost charts
  - Simplified to show total cost per currency (removed input/output breakdown)
  - Multi-currency stacked display with improved tooltip formatting

- **Learning Phase UX**
  - Warmer, more humanized empty state messages
  - Unified emoji (💡) for tip cards
  - Better progress indication

### Fixed

- **AI Configuration & Testing**
  - Fixed DeepSeek/OpenAI token truncation warnings (maxTokens: 100→200)
  - Suppress truncation warning during test connections only
  - Fixed "在用" (In Use) status showing incorrectly for unconfigured providers
  - Fixed abstract provider parsing issues

- **Internationalization**
  - Corrected translation errors
  - Fixed i18n key inconsistencies
  - Improved Chinese-English parity

### Technical

- Currency type system: `ProviderCurrency = 'USD' | 'CNY' | 'FREE'`
- Provider-specific cost calculators with currency awareness
- Budget checker validates per currency (no mixing)
- UI components: AIProviderCard, AIUsageBarChart, BudgetOverview, CollectionStats
- Test suite: 1691 tests passing (102 test files)
- Coverage: Lines 71.94%, Functions 74.7%, Branches 60.39%

## [0.3.2] - 2025-12-07

### Added

- **AI Usage Visual Analytics** ([#66](https://github.com/wxy/SilentFeed/pull/66))
  - Professional tri-chart dashboard: Token Usage, API Calls, and Cost tracking
  - Daily/monthly view modes with automatic time-based aggregation
  - Reasoning vs Non-Reasoning mode comparison (for models like DeepSeek R1)
  - Interactive tooltips with detailed breakdown
  - Horizontal scrolling for extended time periods
  - Smart viewport scaling based on data density

- **Enhanced Internationalization**
  - Bilingual technical terms: "词元（Token）" format for clarity
  - Full date format localization (Chinese: 2024年12月07日, English: 2024-12-07)
  - Complete translation coverage for AI usage statistics UI
  - Zero hardcoded strings in user-facing components

### Changed

- **UI/UX Improvements**
  - Default UI style changed from Sketchy to Standard (prevents initial flash)
  - Users who prefer Sketchy style can still set it manually
  - Smoother page load experience without style flickering

### Fixed

- **Ollama Integration**
  - Resolved DNR (Declarative Net Request) configuration issues
  - Static DNR rules now properly bundled via Plasmo's `.plasmo` directory
  - CORS headers correctly removed for `localhost:11434` and `127.0.0.1:11434`
  - Build process no longer breaks Chrome hot reload functionality

- **Page Tracking Accuracy**
  - Fixed Chrome internal page tracking (`chrome://`, `chrome-extension://`)
  - Prevented duplicate page learning from reload events
  - Warmup page filtering now correctly excludes browser UI pages
  - Profile rebuild no longer triggered by navigation to settings

- **AI Usage Statistics**
  - Daily stats aggregation now correctly groups by date
  - Cost calculation precision improved to 4 decimal places
  - Empty state handling for new users without AI usage data
  - Fixed chart width overflow with proper horizontal scrolling

### Performance

- **Profile Generation Optimization**
  - Debounced profile rebuilds: batch dismissals within 5 seconds
  - Reduces redundant AI calls by up to 80%
  - Lower API costs for users who rapidly dismiss recommendations

### Development

- **Test Suite Stability**
  - All 1492 tests passing (93 test files)
  - Updated UI style test expectations to match new defaults
  - Improved mock coverage for AI usage tracking components

### Technical Details

- DNR rules: 2 static rules for Ollama CORS bypass
- Chart viewport: Dynamic scaling from 7 to 30+ days
- Date formatting: i18n-powered with template interpolation
- Build pipeline: `pre-build-dnr.sh` → `plasmo build` → `copy-locales.sh`

## [0.3.1] - 2025-12-06

### Changed
- AI capability detection for Ollama now relies on API capability checks instead of name heuristics.
- Reasoning capability icons added to the model list and Ollama provider card; cooldown set to 10 minutes.
- RSS detector updated to ignore `translate.goog` proxied URLs.
- Spider chart path reimplemented using cubic Bézier for a smooth closed curve.

### Fixed
- Stabilized test suite and resolved TypeScript errors across providers, hooks, and services:
  - `UserProfile` test constructions now include required fields (`totalPages`, `lastUpdated`, `version`).
  - Dexie `transaction` mocks return objects with `timeout` to satisfy `PromiseExtended` typing.
  - `recommendation-config` tests migrated to the new `AIConfig.providers` schema; added `local` and `engineAssignment`.
  - `OllamaProvider` safely accesses optional `finish_reason` in OpenAI-compatible responses.
  - Hook `useAIProviderStatus` adjusted to provider `testConnection()` signature.
- Addressed regressions around "未配置本地 AI" by hardening local provider initialization.

### Coverage
- Function coverage ≥ 70%; overall line coverage ~73% (V8).

### Notes
- This release focuses on robustness, type consistency, and UX polish without changing core behavior.

## [0.3.0] - 2024-12-05
> Not the first public release. See historical entries below.

# Changelog

All notable changes to Silent Feed will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2024-12-05

### Added

- **Feed Spider Chart Visualization** ([#59](https://github.com/wxy/SilentFeed/pull/59))
  - Spider chart with each RSS feed as an axis, displaying 4 data layers per feed
  - Data layers: Total Articles, Recommended, Read, Disliked (color-coded and semi-transparent)
  - Logarithmic normalization to prevent large values from obscuring small ones
  - Symmetric layout algorithm for optimal visual distribution
  - Worst performer markers: highlights feeds with lowest recommendation counts
  - Full internationalization support (English & Chinese)

- **Recommendation System Performance Optimization**
  - Debounce mechanism for profile rebuilds: batch process dismissals within 5 seconds
  - Reduces AI API calls by 80% when rapidly marking articles as "not interested"
  - Expanded recommendation pool from 1x to 2x window size for better diversity
  - Improved recommendation quality with larger candidate pool

### Changed

- **UI Improvements**
  - Right-aligned numeric values in system data cards for better readability
  - Consistent alignment for statistics (page count, storage, AI usage, etc.)
  - Enhanced visual hierarchy in settings page

### Fixed

- **Translation Logic**
  - Fixed language detection for recommendation translations
  - Now correctly uses user's i18n language setting instead of browser language
  - Prevents unnecessary translation when source equals target language

### Performance

- **API Cost Reduction**: 80% fewer profile rebuild API calls during rapid dismissals
- **Recommendation Diversity**: 2x larger pool maintains quality while offering more variety

## [0.2.0] - 2024-12-01

### Added

- **AI Engine Assignment System** ([Phase 8](docs/archive/phases/PHASE_8_FINAL_SUMMARY.md))
  - Assign different AI engines for different task types (page analysis, feed analysis, profile generation)
  - 3 preset plans: Intelligence First ($0.15/month), Balanced ($0.54/month), Privacy First (free)
  - Advanced customization: configure each task independently
  - Cost optimization: reduce monthly AI cost by up to 95%
  - Smart task routing with automatic fallback strategy

- **AI Usage Tracking & Statistics** ([#48](https://github.com/wxy/SilentFeed/pull/48))
  - Track API calls, tokens, and estimated costs for each AI provider
  - Display usage statistics in settings panel
  - Daily/monthly breakdowns
  - Budget alerts (planned)

- **Auto-Save AI Configuration** ([#50](https://github.com/wxy/SilentFeed/pull/50))
  - AI engine assignments now save automatically when changed
  - No need to manually click save button
  - Improved user experience with instant feedback
  - Debounced saves to prevent excessive writes

- **Full Ollama Support** ([#43](https://github.com/wxy/SilentFeed/pull/43))
  - Fixed CORS 403 errors using declarativeNetRequest API
  - Automatically removes Origin/Referer headers for local AI requests
  - Works out-of-the-box without server configuration
  - Supports both legacy (`/api/generate`) and OpenAI-compatible (`/api/chat`) modes
  - Added [Ollama Setup Guide](docs/OLLAMA_SETUP_GUIDE.md)

- **Skip AI Configuration in Onboarding** ([#43](https://github.com/wxy/SilentFeed/pull/43))
  - New users can skip AI configuration and explore basic features first
  - Reduces onboarding friction

### Changed

- **AI Configuration Data Structure Refactor** (Phase 9.2, [#51](https://github.com/wxy/SilentFeed/pull/51))
  - Each provider now has independent configuration: `{ apiKey, model, enableReasoning }`
  - Prevents configuration conflicts when using multiple AI providers
  - Automatic migration from old structure with backward compatibility
  - Updated components: `AIConfigPanel`, `useAIProviderStatus`, `AICapabilityManager`
  - Impact: 11 files, +999/-134 lines

- **Database Module Refactoring** ([#42](https://github.com/wxy/SilentFeed/pull/42))
  - Split 1800+ lines `db.ts` into 12 modular files
  - Organized under `src/storage/db/` directory
  - Improved maintainability and testability
  - Split tests by module for easier debugging

- **AI Provider Architecture Unification** (commit 62b5786)
  - Created `BaseAIService` base class to centralize prompt template management
  - Providers now only need to implement `callChatAPI()` and `calculateCost()`
  - **Prompt Template Optimization**:
    - `interests` field no longer adds "I'm interested in..." prefix
    - `avoidTopics` automatically extracted from rejection records
    - Supports both full generation and incremental updates
  - **Architecture Benefits**: Easier to add new AI providers, lower maintenance cost

- **AI First User Profile Optimization** (commit a398fad)
  - Simplified `ProfileSettings` component from **928 lines to 350 lines** (62% reduction)
  - **Removed keyword-based visualizations**:
    - Topic distribution chart
    - Keyword cloud
    - Interest evolution timeline
  - **Kept AI-powered core features**:
    - AI interest summary
    - Preference features
    - Avoid topics
  - Design philosophy: Emphasize AI capabilities, reduce reliance on keyword algorithms

- **System Data Restructuring** (commit 3544f2d)
  - **Added Features**:
    - RSS article total count
    - Recommendation funnel visualization (RSS → Analysis → Recommendation → Read/Rejected)
    - Conversion rate statistics (analysis rate, recommendation rate, reading rate)
  - **Removed Features**:
    - AI analysis percentage statistics
    - Text analysis statistics (keyword extraction, language distribution)
  - **New Database Methods**:
    - `getRSSArticleCount()`: Get total RSS article count
    - `getRecommendationFunnel()`: Get recommendation funnel data
  - Internationalization: Added 11 new translation keys

- **RSS Feeds UI Optimization** (commit e386883)
  - Feed statistics blocks with visual refinements (1px border, gradient progress bar)
  - Time progress bar visualization (circle markers, dynamic length)
  - Recommendation funnel visual improvements (extension icon, emoji markers)
  - Layout optimization (right-aligned, tooltip interaction)

- **Configuration Management Optimization** (commit 8c8cf18)
  - Merged `AnalysisSettings` into `AIConfig` page for unified AI configuration entry point

- **Internationalization Improvements** ([#45](https://github.com/wxy/SilentFeed/pull/45), [#47](https://github.com/wxy/SilentFeed/pull/47), [#49](https://github.com/wxy/SilentFeed/pull/49))
  - Unified date/time formatting using `date-fns`
  - Fixed hardcoded error messages in AI provider status checks
  - Added missing translations for:
    - AI preset plans
    - RSS feed statistics
    - System data funnel
    - Ollama-related prompts
  - Consistent terminology for AI reasoning and task names

- **UI/UX Optimizations**
  - RSS feed statistics block with fixed duplicate counting logic ([#46](https://github.com/wxy/SilentFeed/pull/46))
  - Unified reasoning symbols in AI configuration interface
  - Consistent task naming across UI
  - Improved sketchy style layout and typography

### Fixed

- **Recommendation Click Reliability** ([#44](https://github.com/wxy/SilentFeed/pull/44))
  - Fixed issue where clicking recommendations sometimes didn't work
  - Improved event handling and state management
  - Optimized AI initialization to prevent duplicates

- **RSS Source Validation**
  - 404 errors now silently skipped instead of showing error notifications
  - Less intrusive user experience when discovering feeds

- **Recommendation Generation**
  - No longer throws errors when RSS data is unavailable
  - Shows friendly empty state with guidance instead
  - Users can choose to manually generate or continue browsing

- **Recommendation Sorting After Dismissal**
  - Fixed issue where new recommendations were not sorted by score
  - Added sorting logic to `dismissSelected()` and `markAsRead()`

- **User Profile Behaviors Data Loss**
  - Fixed behaviors data being lost when rebuilding profile
  - Now preserves existing behaviors and only updates other fields

- **Extension Icon State Recovery**
  - Fixed icon not reverting to learning progress after animations
  - `stopAnimation()` now correctly resets state to 'static'

- **Multiple Ollama Issues**
  - Fixed DNR configuration not being applied in dev mode
  - Removed unnecessary cross-mode fallback retries
  - Cleaned up excessive debug logs (curl commands, detection logs)

- **AI Configuration Overlay Positioning** ([#43](https://github.com/wxy/SilentFeed/pull/43))
  - Fixed incorrect AI settings overlay position
  - Adjusted CSS positioning logic

- **Internationalization Test Failures** ([#45](https://github.com/wxy/SilentFeed/pull/45))
  - Fixed translation key path mismatches
  - Updated all translation keys to follow naming conventions

- **AI Configuration Multi-Provider Bug** ([#51](https://github.com/wxy/SilentFeed/pull/51))
  - Fixed issue where configuring multiple AI providers would overwrite shared config fields
  - DeepSeek detection now works correctly after configuring OpenAI
  - Root cause: global `model` and `enableReasoning` fields were being overwritten

### Technical

- **Test Coverage**: 1401 tests passing (up from 1308), 71% code coverage
- **Code Quality**: 
  - Removed unnecessary debug logs
  - Improved error handling and user feedback
  - Better separation of concerns in AI configuration
- **Documentation**:
  - Archived 18 development phase documents to `docs/archive/`
  - Created comprehensive [CHANGELOG.md](CHANGELOG.md)
  - Added [RELEASE_0.2.0_CHANGES.md](docs/RELEASE_0.2.0_CHANGES.md) with detailed change tracking
  - Updated [USER_GUIDE.md](docs/USER_GUIDE.md) and [USER_GUIDE_ZH.md](docs/USER_GUIDE_ZH.md)
  - Updated [README.md](README.md) with new features
- **CI/CD**:
  - Added pre-push check script
  - Three-stage verification: tests + coverage + build

### Performance

- **Database Optimization**:
  - Modular loading reduces initialization overhead
  - Split tests improve test suite performance

- **AI Request Optimization**:
  - Eliminated unnecessary cross-mode retries in Ollama
  - Debounced configuration saves

### Migration Notes

**From v0.1.0 to v0.2.0**:

1. **AI Configuration**:
   - Old configurations will be automatically migrated to new structure
   - No manual action required
   - Both old and new structures are maintained for backward compatibility

2. **Database**:
   - No schema changes
   - Existing data remains compatible

3. **Ollama Users**:
   - DNR rules are automatically configured
   - No need to modify Ollama CORS settings
   - Restart browser after update for DNR rules to take effect

---

## [0.1.1] - 2024-12-01

**Note**: This version was skipped in favor of 0.2.0 due to significant feature additions.

### Fixed

- **AI Configuration Multi-Provider Bug** ([#18](docs/bugs))
  - Fixed issue where configuring multiple AI providers would overwrite shared config fields
  - Root cause: `model` and `enableReasoning` were stored globally, causing later configs to override earlier ones
  - Impact: DeepSeek detection failed after configuring OpenAI due to wrong model being used

### Changed

- **AI Configuration Data Structure Refactor** (Phase 9.2)
  - Each provider now has independent configuration: `{ apiKey, model, enableReasoning }`
  - Maintained backward compatibility with automatic migration from old structure
  - Updated all components to use new data structure:
    - `src/storage/ai-config.ts`: Migration logic and dual-write strategy
    - `src/components/AIConfigPanel.tsx`: Read/write from provider-specific config
    - `src/hooks/useAIProviderStatus.ts`: Provider-specific detection
    - `src/core/ai/AICapabilityManager.ts`: Initialize from new structure

### Technical

- **Test Coverage**: 1401 tests passing, 70.83% code coverage
- **Documentation**:
  - Created `docs/archive/fixes/BUG_FIX_AI_CONFIG_SAVE.md` - Phase 9.2 refactor documentation
  - Updated `docs/archive/fixes/BUG_FIX_ONBOARDING_AND_UI.md` - Bug fix records
- **Code Changes**: 11 files modified, +999/-134 lines

---

## [0.1.0] - 2024-11-28

### Added

- 🎉 **First Public Release**
- **AI-Powered Recommendations** - Personalized RSS content based on browsing behavior
- **Auto RSS Discovery** - Automatically finds RSS feeds from visited websites
- **Smart Engine Assignment** - Optimize costs by assigning different AI engines for different tasks
- **Local AI Support** - Full Ollama integration for privacy-focused users
- **Remote AI Support** - OpenAI, Anthropic, DeepSeek API integration
- **Interest Profile** - Visual representation of user interests
- **Privacy First** - All data stays local, user controls API keys
- **Bilingual Support** - Full English & Chinese localization
- **Clean UI** - Minimal design for distraction-free reading

### Technical

- **Framework**: Plasmo (Chrome Extension MV3)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 + Tailwind CSS 3.x
- **State Management**: Zustand
- **Storage**: Dexie.js (IndexedDB)
- **Testing**: Vitest + Testing Library (74%+ coverage)
- **Architecture**: Modular design with clear separation of concerns

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
- **Technical**: Internal technical changes

[0.2.0]: https://github.com/wxy/SilentFeed/releases/tag/v0.2.0
[0.1.0]: https://github.com/wxy/SilentFeed/releases/tag/v0.1.0
