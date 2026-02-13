# Changelog

## [0.7.4] - 2026-02-13

### Changed

- 移除手绘风格（sketchy）UI 设置功能
- 优化代码结构和内部工具链

### Chore

- 完善 AI 助手技能体系，建立分支隔离的发布流程
- 强化代码质量检查和约束规范

## [0.6.2] - 2026-01-26

### Fixed

- **Reading List Data Consistency (Critical)**
  - Fixed data inconsistency between Chrome Reading List, badge count, and settings stats
  - Unified all data sources to use `getUnreadRecommendations()` query
  - Implemented three-layer sync mechanism (passive listening + active sync + periodic sync)
  - Chrome Reading List API `onEntryUpdated` event proved unreliable, now using proactive sync
  - Filter out articles that failed to add to reading list in reading list mode

- **Internationalization (i18n)**
  - Fixed hardcoded Chinese text in time formatting (`formatTimeUntil`)
  - Fixed hardcoded Chinese text in word count formatting (`formatWordCount`)
  - Fixed hardcoded Chinese text in reading time display
  - All user-facing text now supports multiple languages
  - Updated tests to match new translation keys

### Changed

- **Sync Strategy**
  - Active sync on popup open, settings page load, and badge update
  - Periodic sync reduced to every 5 minutes (from 2 minutes) as fallback
  - Enhanced logging for Chrome Reading List event diagnostics

## [0.6.1] - 2026-01-23

### Added

- **Reading List Short ID Tracking**
  - Implemented short ID tracking mechanism for reading list items
  - Better tracking of recommendation status in reading list mode
  - Enhanced URL normalization and duplicate detection

### Changed

- **Recommendation Funnel Display**
  - Refactored statistics display as three fundamental equations
  - Improved visual representation of article flow
  - Better alignment between funnel and pool statistics

### Fixed

- **Reading List Tracking**
  - Fixed tracking of articles added to Chrome Reading List
  - Improved recommendation ID mapping for reading list entries
  - Enhanced logging for reading list operations

## [0.6.0] - 2026-01-23

### Added

- **AI-Generated Chinese Summaries**
  - Save and prioritize AI-generated Chinese summaries
  - Display AI summaries in reading list mode with 🤖 prefix
  - Better content understanding for Chinese users

- **Full-Text Content Fetching**
  - Enhanced full-text fetching with word count and reading time
  - Display word count (X万字/Xk字) for longer articles
  - Display reading time (X分钟) based on content length

- **Translation Data Persistence**
  - Save translation data to database during AI analysis
  - Fallback translation updates database to ensure frontend access
  - Improved translation language matching logic

### Changed

- **Recommendation Pool Architecture**
  - Simplified pool management with `poolStatus` field
  - Removed separate `recommendations` table
  - Unified article lifecycle management
  - Improved pool capacity control (top 3 in popup, pool capacity in backend)

- **Display Mode Refactoring**
  - Renamed "popup" mode to "recommended" mode internally
  - Separated recommendation pool from display mode
  - Better mode switching experience

- **AI Strategy System**
  - Removed invalid AI strategy parameters
  - Simplified decision system
  - Improved strategy generation reliability

### Fixed

- **Translation Settings Ignored**
  - Fixed feed-level Google Translate disable setting being ignored
  - Respected user's translation preferences for each feed

- **Pool Refill Issues**
  - Fixed recommendation pool refill freezing
  - Fixed badge display not updating after refill
  - Improved refill threshold validation
  - Added instant refill button with proper handler

- **Reading List Mode**
  - Filter out read/dismissed articles in reading list mode
  - Use translated title and URL in reading list entries
  - Better translate URL format handling

- **Test Coverage**
  - Fixed 51 tests broken by database schema changes
  - Fixed 18 transaction tests
  - Adapted tests to new architecture
  - Improved test stability

## [0.5.3] - 2026-01-15

### Fixed

- **Reading List Translation Link Recognition (Bug #1)**
  - Fixed URL normalization to correctly identify translated links
  - Unified handling of Google Translate, translate.goog, and original URLs
  - Improved mode switching to correctly restore recommendations
  
- **Reading List Mode Switching Issues (Bug #2)**
  - Fixed recommendation recovery when switching from reading list back to popup mode
  - Improved duplicate detection using normalized URLs
  - Enhanced error handling in `saveRecommendation()` for edge cases
  
- **Development Environment Configuration**
  - Fixed Vitest task runner Node version mismatch (v20.9.0 → v22.15.1)
  - Added nvm initialization to `~/.zprofile` for consistent shell environments
  - Updated VS Code task configuration to use non-login shell execution

### Changed

- **URL Decision Logic Refactoring**
  - Unified URL decision logic for popup and reading list modes
  - Consolidated translation strategy handling at feed, config, and content levels
  - Improved fallback handling to ensure valid URLs in all error scenarios

## [0.5.1] - 2026-01-14

### Added

- **AI Strategy Decision System (Phase 13)**
  - Intelligent recommendation pool strategy with AI-driven quality control
  - Candidate pool admission threshold integrated into AI strategy decisions
  - Dynamic threshold adjustment based on user profile and content quality
  - Smart quality control for recommendation optimization

- **RSS Feed Visualization Overhaul**
  - Colorful block progress bars replacing mathematical equations
  - Semantic color scheme: Discarded (gray), Unprocessed (light green), Candidate (green), Recommended (dark green), Processed (blue)
  - Visual representation of article flow through the system
  - Restored and optimized recommendation funnel equation display
  - Summary rows with tag-style labels and color blocks

- **Feed-Level Translation Settings**
  - Independent translation control for each RSS feed
  - Merged translation toggle with language label UI
  - Smart language detection and matching logic
  - AI prompt language used as translation target

- **Page Visit Deduplication**
  - 30-minute time window deduplication mechanism
  - Prevents duplicate learning of same page within short timeframe
  - Reduces unnecessary AI API calls

- **Browser Compatibility**
  - Full Chrome and Edge browser support (#89)
  - Unified cross-browser experience

- **OpenSkills Integration**
  - Claude Skills support for development workflow
  - PR Creator Skill with intelligent version management
  - Automated release workflow

### Changed

- **Content Script Architecture Refactor**
  - Unified all content script functionality into SilentFeed.ts
  - Integrated RSS detection, title management, and user tracking
  - Lightweight and modular architecture
  - Reduced memory footprint and improved performance

- **Storage Architecture Optimization**
  - Unified message protocol
  - Optimized storage patterns
  - Simplified configuration system

- **Recommendation Settings UI**
  - Improved layout and visual hierarchy
  - Better organization of settings

- **Brand Identity**
  - Updated brand emoji from 📰 to 🤫

### Fixed

- **Google Translate URL Deduplication** (Critical)
  - Complete fix for translated page RSS feed duplicate subscription issue
  - FeedManager now has full translate.goog URL support
  - Multi-layer defense mechanism for reliable deduplication
  - Enhanced URL normalization logic
  - Detailed investigation: `docs/INVESTIGATION_TRANSLATE_URL_DEDUP.md`

- **Reading List Integration**
  - Fixed translation settings being ignored when saving to reading list
  - Improved recommendation tracking and removal logic
  - Better URL normalization for reading list items

- **RSS Feed Management**
  - Fixed duplicate RSS feed addition bug
  - Fixed favicon display for translated URLs
  - Improved feed discovery on translated pages

- **AI and Recommendation System**
  - Fixed AI analysis language detection failures
  - Fixed incomplete multi-pool architecture migration
  - Fixed remote provider abstract resolver issue
  - Fixed cooling period check position (AI analysis no longer blocked)
  - Fixed recommendationStore result.stats.reason undefined issue
  - Improved error handling in recommendation generation

- **UI and Interactions**
  - Fixed button click event bubbling
  - Fixed LOCAL_STORAGE_KEYS undefined runtime error
  - Fixed icon state display issues
  - Improved progress bar sizing and spacing

- **Testing and Engineering**
  - Adjusted test coverage thresholds to pass CI checks
  - Fixed multiple compilation errors and test failures
  - Removed excessive debug logging

### Technical

- **Test Suite**: 2156 tests passing (127 test files)
- **Coverage**: Statements 68%, Functions 69%, Lines ~70%
- **Commits**: 158 commits since v0.3.6
- **Development Period**: 23 days (2025-12-22 → 2026-01-14)
- **Documentation**: Added comprehensive technical documentation and analysis

### Removed

- Removed TF-IDF redundant logic
- Deprecated `FeedQualityAnalyzer` (unified with AI source analysis)
- Cleaned up excessive logging from debugging sessions

### Documentation

- Added `RELEASE_0.5.1_ANALYSIS.md` - Detailed version change analysis
- Added `INVESTIGATION_TRANSLATE_URL_DEDUP.md` - Google Translate URL issue investigation
- Added `TRANSLATE_URL_DEDUP_FIX_SUMMARY.md` - Complete fix solution summary
- Added `WHY_TRANSLATE_URL_FIX_FAILED.md` - Failure analysis
- Moved 15+ archived documents to `docs/archive/`
- Organized scripts into `scripts/archive/` and `scripts/utils/`

---

## [0.5.0] - 2026-01-11

### Added

- **Reading List Mode (Phase 15)**
  - Integrated summary view for reading list in popup
  - Chrome Reading List mode with dedicated UI
  - Delivery method configuration in recommendation settings
  - Reading list auto-cleanup configuration
  - Mode switching with data isolation handling

- **PR Creator Skill**
  - Intelligent PR creation with version management
  - Automated changelog generation
  - Smart version bump suggestions
  - Template-based PR description generation
  - Automatic version checking mechanism

- **Recommendation Funnel Enhancement**
  - Added `stale` status support for articles
  - Exit statistics tracking and visualization
  - Refactored funnel data collection and display
  - Multi-pool architecture adaptation for funnel and radar charts
  - Visual funnel representation of content flow

- **AI Streaming Output**
  - Streaming output for reasoning mode with progress logging
  - Idle timeout strategy for stream handling
  - Dedicated `screenFeedArticles` method for feed prescreening
  - Improved feed prescreening timeout handling

- **Test Coverage Improvements**
  - pool-strategy-decider comprehensive tests
  - useAIUsageStats hook tests
  - Database initialization boundary tests
  - AI config, RSSValidator, and feed-category tests
  - RecommendationSettings component tests
  - OnboardingStateService tests
  - pool-refill-policy complete test coverage

### Changed

- **Brand Identity Update**
  - Replaced 📰 emoji with 🤫 as brand representative
  - Updated brand presence across UI

- **Recommendation Settings UI**
  - Refactored recommendation settings page flow diagram layout
  - Moved delivery method config from AI engine to recommendation settings
  - Improved visual organization and hierarchy

- **AI Architecture**
  - Removed TF-IDF redundant logic
  - Enhanced internationalization across AI components
  - Added architecture constraint documentation for AI method invocation
  - Improved AI prompt handling

- **Code Quality**
  - Adjusted coverage thresholds to realistic levels
  - Fixed multiple compilation errors
  - Improved test reliability

### Fixed

- **Reading List Integration**
  - Fixed reading list and recommendation system critical issues
  - Removed alert() calls and improved reading list removal logging
  - Added missing parameter to `chrome.readingList.query()`
  - Fixed scheduler method names and popup display quantity limits
  - Fixed mode switching data isolation issues
  - Fixed config redeclaration in `generateRecommendations`

- **Translation and Favicon**
  - Fixed favicon display for translated URLs
  - Better handling of Google Translate URLs

- **Recommendation Generation**
  - Fixed `result.stats.reason` undefined issue in recommendationStore
  - Improved error handling in `generateRecommendations`
  - Fixed cooling period check position (AI analysis no longer blocked)

- **Multi-Pool Architecture**
  - Fixed incomplete multi-pool architecture migration
  - Fixed scheduler interval configuration
  - Fixed abstract provider 'remote' resolution in prescreening service

- **AI Cost Tracking**
  - Fixed AI usage statistics display issues
  - Improved internationalization for AI cost displays

- **Internationalization**
  - Completed i18n for reading list view and settings page
  - Fixed funnel diagram text optimization
  - Comprehensive i18n wrapper improvements

- **Testing**
  - Fixed test cases to adapt to `sf_rec` parameter
  - Removed unrelated learning stage test from AIConfig
  - Fixed AIConfig learning stage display
  - Fixed OnboardingStateService tests with improved coverage
  - CI coverage threshold adjustments

### Technical

- Continuous improvements to AI strategy system
- UI refinements and optimizations
- Enhanced test coverage across core modules
- Improved error handling and logging

---

## [0.4.0] - 2026-01-08

### Added

- **AI Strategy Decision System (Phase 13 Core)**
  - AI-driven recommendation pool strategy with intelligent quality control
  - Candidate pool admission threshold with quality-based filtering
  - Dynamic threshold adjustment based on content quality and user profile
  - Multi-layer recommendation funnel optimization

- **Feed XML Batch Prescreening**
  - Batch analysis of RSS feed articles before full processing
  - 75% reduction in AI API calls through intelligent filtering
  - Configurable prescreening thresholds
  - Early quality assessment at XML parsing stage

- **Cold Start Recommendation Strategy**
  - Smart recommendations during initial learning phase (<100 pages)
  - Visual distinction for cold-start recommendations in UI
  - Progressive quality improvement as profile develops
  - Dedicated cold-start reasoning display

- **Content Quality Assessment Framework**
  - Source-level AI quality analysis service
  - Feed article quality scoring and categorization
  - Content quality evaluation integrated into AI task types
  - Quality-based content filtering pipeline

- **Feed-Level Translation Control**
  - Independent translation settings for each RSS feed
  - Merged translation toggle with language label UI
  - Automatic language detection from RSS feed metadata
  - AI prompt language used as translation target
  - Smart translation decision based on feed settings and language matching

- **Page Visit Deduplication (30-min Window)**
  - Time-window-based deduplication mechanism
  - Prevents duplicate learning of same page within 30 minutes
  - Reduces unnecessary AI API calls
  - Persistent deduplication state tracking

- **OpenSkills Integration**
  - Claude Skills support for enhanced development workflow
  - Skill-based task automation
  - Integration with AI-assisted development tools

- **Icon States Guide**
  - User-friendly interactive guide for extension icon states
  - Visual documentation of all icon states and meanings
  - Replaces developer-focused demo page

### Changed

- **Content Script Architecture Refactor**
  - Unified all content script functionality into `SilentFeed.ts`
  - Integrated RSS detection, title management, and user tracking
  - Lightweight and modular architecture
  - Reduced memory footprint and improved performance
  - Removed redundant content script files

- **Storage Architecture Optimization**
  - Unified message protocol across all components
  - Optimized storage patterns for better performance
  - Simplified configuration system
  - Improved data consistency

- **Feed Source Analysis**
  - Refactored feed analysis as independent AI method
  - Dedicated `sourceAnalysis` AI task type
  - Improved language detection logic with fallback mechanisms
  - Priority given to RSS feed's declared language

- **Recommendation System UI**
  - Added breathing effect during recommendation analysis
  - Learning mask with brightness variation animation
  - Improved visual feedback during AI processing
  - Optimized icon ripple effect for background tasks

- **RSS Discovery UI**
  - Comprehensive Google Translate URL conversion in RSS discovery cards
  - Improved source domain display
  - Better URL normalization for discovery

- **AI Task Management**
  - Consolidated low-frequency AI tasks configuration
  - Simplified user experience for AI task allocation
  - Optimized task routing and distribution

- **Translation Logic**
  - Optimized translation link decision logic in popup
  - Based on feed settings and language matching
  - More intelligent translation recommendations

### Fixed

- **AI Configuration**
  - Fixed AI config check logic, removed non-existent `enabled` field
  - Corrected `getAIConfig` usage across codebase
  - Strategy service now checks AI config before calls
  - Feed prescreening checks AI config early to prevent invalid calls
  - Enhanced error logging for debugging

- **Feed Management**
  - Fixed duplicate RSS feed addition bug
  - Improved feed update frequency recalculation after each fetch
  - Better handling of feed metadata

- **Language Detection**
  - Fixed AI analysis language detection failures
  - Added fallback language detection from text content
  - Fixed feed analysis prompt format for proper language detection
  - Prioritized RSS source file language declarations

- **Translation Issues**
  - Fixed recommendation title translation language mismatch
  - Used AI prompt language as translation target
  - Better translation consistency

- **UI Interactions**
  - Fixed button click event bubbling
  - Fixed auto-trigger of AI analysis when reading
  - Improved error state red mask display and border radius

- **Testing**
  - Fixed chrome.storage.sync mock issues in tests
  - Added storage module test coverage
  - Fixed RSSFetcher test Mock Response issues
  - Fixed onboarding step updates during setup state
  - Comprehensive test cleanup and fixes

- **Code Quality**
  - Fixed type errors throughout codebase
  - Cleaned up excessive debug logging
  - Removed overly detailed statistics logging from RecommendationService
  - Fixed FeedArticle field references in SourceAnalysisService

### Deprecated

- **FeedQualityAnalyzer**: Replaced with unified AI-based source analysis

### Technical

- Dynamic learning threshold unified across system
- Test suite improvements and mock fixes
- Dependencies: Updated baseline-browser-mapping to 2.9.11

---

## [0.3.6] - 2025-12-22

### Added

- **Chrome Reading List Integration**
  - Integrated Chrome Reading List API for "Read Later" functionality
  - One-click save recommendations to Chrome's native reading list

- **Daily Profile Update System**
  - Scheduled daily profile update task for continuous learning
  - Progress display moved to dialog area with visual progress bar
  - Persistent progress counter in `chrome.storage.local`

- **Recommendation Click-Through Tracking**
  - Use Tab ID to track recommendation reads (solves Google Translate URL issues)
  - Immediate removal from list after clicking recommendation item
  - Persisted removal state across sessions

- **Google Translate URL Handling**
  - RSS detector converts Google Translate URLs to original URLs
  - Proper tracking of translated page visits

### Changed

- **Recommendation Quality Control**
  - Raised quality threshold to 0.8 with aggressive quality filtering
  - Optimized profile trigger and pool admission mechanism
  - Improved historical score baseline calculation

- **AI Summary Translation Optimization**
  - Titles translated synchronously during AI analysis (avoids separate translation API calls)
  - Optimized translation interaction logic with expected default behavior

- **User Preferences Storage Migration**
  - Migrated user preference configuration from `local` to `sync` storage for cross-device sync

- **Popup Window Sizing**
  - Improved popup size adjustment mechanism

### Fixed

- **Badge Update Issue**
  - Fixed badge number not updating after clearing recommendations

- **RSS CDATA Parsing**
  - Complete fix for RSS CDATA category parsing issues

- **Content Script Storage Access**
  - Fixed Content Script unable to access storage

- **Recommendation Pipeline Issues**
  - Fixed 3 critical issues in recommendation flow
  - Fixed recommendation tracking and profile learning bugs
  - Fixed model configuration log display in recommendation service

- **Profile Progress Display**
  - Fixed profile update progress bar not showing
  - Fixed profile update progress counter always showing 0

### Technical

- Test suite: 1780+ tests passing (105 test files)
- Coverage: Lines 72.88%, Functions 73.58%, Branches 60.51%
- Cleaned up debug logs accumulated since v0.3.2
- Unified recommendation tracking mechanism with simplified content scripts
- Migrated user preferences from `local` to `sync` storage

## [0.3.5] - 2025-12-13

### Added

- **Multi-Currency AI Cost Architecture**
  - Complete rewrite of cost calculation system to handle different currencies properly
  - Currency-aware cost calculation: OpenAI (USD), DeepSeek (CNY), Ollama (FREE)
  - Separate budget tracking per provider with native currency
  - `CostCalculator` factory pattern for provider-specific calculations
  - `AIUsageTracker.getTotalCostByCurrency()` for currency-grouped statistics
  - Auto-hide zero-value currencies in all cost views
  - CSV export with Currency column
  - New architecture documentation: `docs/AI_COST_ARCHITECTURE.md`

- **Local Ollama Support in Onboarding**
  - Step 2 now includes "Local Ollama" option
  - Auto-detect local AI service availability
  - Auto-save configuration after successful connection test
  - Display model loading status after local test success

- **Preset Strategy Auto-Apply**
  - New `hasAnyAIAvailable()` global detection function
  - New `getRecommendedPreset()` for smart preset recommendation
  - Remote AI (DeepSeek/OpenAI) → Smart Priority preset
  - Local AI (Ollama) → Privacy Priority preset

- **Tips System for Learning Phase**
  - 16 product tips (concepts/privacy/techniques/principles/features)
  - Learning phase prioritizes "how it works" tips
  - Recommendation phase prioritizes "usage tips"
  - Bilingual support (Chinese/English)
  - Unified 💡 emoji for tip cards

- **Learning Phase UX Improvements**
  - Progress display: `X/100 pages` + progress bar
  - Privacy notes emphasizing local data processing
  - 5 randomized encouraging messages (warmer, more humanized)
  - 🌱 icon for "growth" metaphor

- **Empty State Optimizations**
  - "All caught up" shows encouraging messages (e.g., "Congrats, you've escaped the information flood")
  - Aligns with product philosophy: "Making the feed quieter"
  - Positive feedback without pushing for more subscriptions

- **AI Provider Card UI Improvements**
  - Status icons (🟢🔴⚪) moved to left side, next to provider name
  - Type/feature icons (☁️🔬⭐🔵) right-aligned
  - All icons with `cursor-help` for discoverability
  - Vertical centering with `items-center`
  - Buttons fixed to card bottom

- **RSS Example Source Improvements**
  - One-click subscription (no need to click "Add" again)
  - Real feed names (Hacker News, 奇客Solidot) instead of placeholders
  - Duplicate subscription prevention

### Changed

- **Cost Display Simplification**
  - Removed USD/CNY max value hints at chart top
  - Removed 25/50/75% gridlines inside columns
  - Removed input/output breakdown, showing only currency totals
  - Unified currency formatting: `$1.23` (USD) / `¥1.23` (CNY) / `免费` (FREE)

- **Onboarding UI Streamlining**
  - Step 2 simplified to single engine dropdown
  - Hide preset/advanced config when no AI configured, show hint card instead
  - Unified bottom navigation: Skip/Next alongside Previous

- **Progress Display Colors**
  - Generating avatar: Purple (reasoning) / Blue (standard), no longer red
  - Daily usage stats: Dark for reasoning, light for non-reasoning (better contrast)

### Fixed

- **Abstract Provider Parsing**
  - Config using abstract types (`'remote'`, `'local'`) now correctly resolves to concrete providers (`'deepseek'`, `'openai'`, `'ollama'`)
  - Fixed `ProfileSettings.tsx` progress bar timeout calculation
  - Fixed `AIConfigPanel.tsx` activeProvider computation
  - New `resolveProvider()` utility function
  - New `ai-provider-resolver.test.ts` (12 tests)

- **Test Connection Truncation Warning**
  - Increased `maxTokens` from 100 to 200 for test connections
  - Truncation warning only shown when `maxTokens > 200`

- **"In Use" Status Display**
  - Enhanced `AIConfigPanel` logic: only mark as "In Use" when provider is actually configured
  - New `isProviderConfigured()` check function

- **Preset Persistence**
  - Fixed preset selection not being persisted
  - Fixed provider status not syncing

- **Internationalization**
  - Corrected translation errors
  - Fixed i18n key inconsistencies
  - Improved Chinese-English parity

### Technical

- Currency type system: `ProviderCurrency = 'USD' | 'CNY' | 'FREE'`
- `BudgetChecker` refactored to aggregate monthly cost by currency with safe fallback
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
