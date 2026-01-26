# Silent Feed v0.5.3 Release Notes

**Release Date**: 2026-01-15  
**Version**: 0.5.3 (Patch Release)  
**Base**: v0.5.1 + Bugfixes

## Overview

v0.5.3 is a patch release focusing on **reading list functionality stability** and **development environment improvements**. This release contains critical bug fixes for the reading list feature and resolves persistent test infrastructure issues.

## Key Changes

### 🐛 Bug Fixes

#### 1. Reading List Translation Link Recognition (Bug #1) ✅
- **Problem**: Articles saved to Chrome reading list with Google Translate links couldn't be properly identified during mode switching
- **Root Cause**: Inconsistent URL normalization between different link formats
- **Solution**:
  - Implemented `normalizeUrlForTracking()` to handle all URL variants
  - Unified database key using normalized URL for deduplication
  - Fixed mode-switch data recovery logic

**Files Changed**:
- `src/core/reading-list/reading-list-manager.ts` (URL normalization & decision logic)
- `src/core/reading-list/reading-list-mode-switch.test.ts` (comprehensive test coverage)

#### 2. Reading List Mode Switching (Bug #2) ✅
- **Problem A**: Switching from reading list mode back to popup mode didn't restore recommendations
- **Problem B**: URL normalization failures in duplicate detection
- **Solution**:
  - Enhanced `decideRecommendationUrl()` with fallback handling
  - Improved `saveRecommendation()` error handling for duplicate entries
  - Unified `feedArticles` state updates (poolStatus/poolExitedAt/poolExitReason)

**Files Changed**:
- `src/core/reading-list/reading-list-manager.ts` (error handling & state management)
- `src/core/recommender/RecommendationService.ts` (URL normalization in dedup logic)

#### 3. Development Environment: Vitest Task Runner Fix ✅
- **Problem**: VS Code task runner failed with `ERR_REQUIRE_ESM` when executing tests
  ```
  Error [ERR_REQUIRE_ESM]: require() of ES Module not supported
  ```
- **Root Cause**: 
  - VS Code tasks use login shell (`zsh -l`) which loads `~/.zprofile`
  - nvm was only configured in `~/.zshrc`
  - Login shell used system Node v20.9.0 instead of nvm's v22.15.1
  - Vitest encountered CJS/ESM compatibility issue with vite

- **Solution**:
  - Added nvm initialization to `~/.zprofile`
  - Updated `.vscode/tasks.json` to use non-login shell execution
  - Removed duplicate task definitions

**Files Changed**:
- `.vscode/tasks.json` (shell configuration)
- `~/.zprofile` (nvm setup)

### 🔧 Code Refactoring

#### Unified URL Decision Logic
- **Before**: Separate URL handling in popup and reading list modes
- **After**: Single `decideRecommendationUrl()` method used by both
- **Benefits**:
  - Reduced code duplication
  - Consistent translation strategy
  - Improved maintainability

**Implementation**:
```typescript
// Unified decision logic
const { url, title } = await ReadingListManager.decideRecommendationUrl(
  recommendation,
  autoTranslateEnabled,
  interfaceLanguage,
  feedUseGoogleTranslate,
  appendTrackingId
)
```

## Testing & Verification

### Test Results
- ✅ **All tests passing**: 128 test files, 2165 tests + 10 skipped
- ✅ **New test coverage**: Reading list mode switch scenarios
- ✅ **Integration verified**: URL normalization across all modes
- ⏱️ **Performance**: ~24 seconds for full test suite

### Key Test Scenarios
1. **URL Normalization**
   - Google Translate URL handling
   - translate.goog URL conversion
   - UTM parameter removal
   - sf_rec parameter handling

2. **Mode Switching**
   - Reading list → Popup mode recovery
   - URL matching across different formats
   - Recommendation state restoration

3. **Error Handling**
   - Duplicate entry handling
   - Database state consistency
   - Fallback URL/title selection

## Technical Details

### URL Normalization Strategy
```
Input Formats:
  - https://translate.google.com/translate?u=https://example.com/article&...
  - https://example-com.translate.goog/article?_x_tr_sl=en&...
  - https://example.com/article?sf_rec=rec-123&utm_source=...

Normalized Output:
  - https://example.com/article
```

### Shell Configuration
Zsh load order:
```
Login Shell:       /etc/zprofile → ~/.zprofile → ~/.zshrc
Interactive Shell: ~/.zshrc
```

The fix ensures nvm is available in both shell types by adding initialization to `~/.zprofile`.

## Compatibility

- **Chrome**: 89+ ✅
- **Edge**: 89+ ✅
- **Firefox**: Not supported (API not available)
- **Node**: v22.15.1+ (required for development)

## Breaking Changes

None. This is a purely backward-compatible patch release.

## Migration Guide

No migration needed. Simply update to v0.5.3 and existing reading list entries will work with improved reliability.

## Known Issues

None at this time.

## Credits

- **Bug Investigation & Fix**: Reading list URL normalization and shell configuration debugging
- **Test Coverage**: Comprehensive mode-switch scenarios and edge case handling
- **Documentation**: Release notes and technical analysis

## Next Steps

- Monitor reading list feature stability in production
- Consider v0.6.0 for major feature additions (AI integration improvements, UI enhancements)
- Evaluate feedback on translation handling strategy

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for detailed commit history and changes.
