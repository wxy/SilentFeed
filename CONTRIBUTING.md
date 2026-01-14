# Contributing to Silent Feed

> 📖 **中文贡献指南**: [CONTRIBUTING_ZH.md](CONTRIBUTING_ZH.md)

---

Thank you for your interest in contributing to Silent Feed!

We are committed to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome or Edge browser

### Setup Development Environment

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/SilentFeed.git
cd SilentFeed

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Load extension in Chrome
# - Open chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select build/chrome-mv3-dev directory
```

See [HOW_TO_LOAD_EXTENSION.md](docs/archive/HOW_TO_LOAD_EXTENSION.md) for detailed instructions.

## 🔄 Development Workflow

### Branch Strategy

- `master` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `test/*` - Test improvements
- `docs/*` - Documentation updates
- `chore/*` - Maintenance tasks

### Workflow Steps

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**
   - Write code
   - Add tests
   - Update documentation

3. **Run tests**
   ```bash
   npm test                # Watch mode
   npm run test:run        # Run once
   npm run test:coverage   # Check coverage
   ```

4. **Pre-push checks** (⚠️ **REQUIRED before pushing**)
   ```bash
   npm run pre-push
   ```
   This ensures:
   - All tests pass (currently 2156 tests)
   - Code coverage meets requirements (≥70% lines, ≥70% functions, ≥60% branches)
     - Current status: Statements 69%, Branches 58.21%, Functions 73.53%, Lines 69.11%
   - Production build succeeds
   
   > **Note**: v0.5.1 refactored multiple core modules. Current coverage is 69%, continuously improving.

5. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create Pull Request**
   - Use descriptive title
   - Include detailed description
   - Reference related issues
   - Wait for CI checks to pass

## 📝 Coding Standards

### TypeScript

- **Strict mode** enabled
- All functions must have type annotations
- No `any` types (use `unknown` if necessary)

### React

- Use functional components and hooks
- No class components
- Follow hooks rules

### Naming Conventions

- **Components**: PascalCase (`ProfileBuilder`)
- **Functions/Variables**: camelCase (`getUserProfile`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_VISITS`)
- **Files**: kebab-case (`profile-builder.ts`)

### Comments

- **Public APIs**: JSDoc required
- **Complex logic**: Explain in Chinese comments
- **Avoid obvious comments**: Code should be self-documenting

### Code Example

```typescript
/**
 * 构建用户兴趣画像
 * @param visits - 用户访问记录
 * @returns 兴趣画像对象
 */
export function buildUserProfile(visits: PageVisit[]): UserProfile {
  // 过滤有效访问（停留时间 > 30s）
  const validVisits = visits.filter(v => v.duration > 30000)
  
  // 提取兴趣关键词
  const interests = extractInterests(validVisits)
  
  return {
    interests,
    timestamp: Date.now()
  }
}
```

## 🧪 Testing

### Test Requirements

- **Coverage targets**: ≥70% lines, ≥70% functions, ≥60% branches
- **Current status** (v0.5.1):
  - Test count: 2156 tests, all passing ✅
  - Statement coverage: 69%
  - Branch coverage: 58.21%
  - Function coverage: 73.53%
  - Line coverage: 69.11%
- **New code**: Must include tests
- **Test types**:
  - Pure functions → Unit tests
  - Classes/Modules → Integration tests
  - React components → Component tests

> **v0.5.1 Update**: The project underwent major refactoring (AI Strategy System, content script architecture, storage layer optimization). Coverage decreased from 72.9% to 69%. We're gradually adding tests for new code—contributions welcome!

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest'
import { buildUserProfile } from './profile-builder'

describe('buildUserProfile', () => {
  it('应该过滤停留时间过短的访问', () => {
    const visits = [
      { url: 'https://example.com', duration: 10000 },  // 10s - 无效
      { url: 'https://example.com', duration: 60000 }   // 60s - 有效
    ]
    
    const profile = buildUserProfile(visits)
    
    expect(profile.interests.length).toBeGreaterThan(0)
  })
})
```

See [TESTING.md](docs/TESTING.md) for complete testing guide.

## 📤 Submitting Changes

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `test` - Add/update tests
- `docs` - Documentation
- `style` - Code formatting
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `chore` - Build/tool changes

**Examples**:

```bash
feat: 实现浏览历史收集功能

- 添加 content script 监听页面访问
- 过滤有效页面 (停留时间 > 30s)
- 存储到 IndexedDB

关联 issue: #12
```

### Pull Request Guidelines

1. **Title**: Clear and descriptive
2. **Description**: 
   - What changes were made
   - Why these changes are needed
   - How to test the changes
3. **Screenshots**: Include UI changes screenshots
4. **Tests**: Ensure all tests pass
5. **Documentation**: Update if needed

### PR Review Process

1. **Automated checks**:
   - Tests must pass
   - Coverage requirements met
   - Build successful

2. **Code review**:
   - At least one maintainer approval required
   - Address review comments
   - Update PR if needed

3. **Merge**:
   - Squash and merge to master
   - Delete feature branch

## 📚 Documentation

### When to Update Documentation

- Adding new features
- Changing existing functionality
- Fixing important bugs
- Improving user experience

### Documentation Files

- `README.md` - Project overview (keep it concise)
- `docs/USER_GUIDE.md` - User-facing documentation
- `docs/PRD.md` - Product requirements
- `docs/TDD.md` - Technical design
- `docs/TESTING.md` - Testing guide
- `docs/I18N.md` - Internationalization

### Writing Documentation

- **Clear and concise**: Avoid jargon
- **Examples**: Include code examples
- **Screenshots**: Add visual guides
- **Bilingual**: Chinese and English

## 🌐 Internationalization

All user-facing text must be internationalized:

```typescript
import { useI18n } from "@/i18n/helpers"

function MyComponent() {
  const { _ } = useI18n()
  return <div>{_("popup.welcome")}</div>
}
```

See [I18N.md](docs/I18N.md) for details.

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description**: What happened vs. what you expected
2. **Steps to reproduce**: Detailed steps
3. **Environment**: Browser version, OS, extension version
4. **Screenshots/Logs**: If applicable
5. **Suggested fix**: If you have ideas

## 💡 Feature Requests

We welcome feature requests! Please:

1. **Search existing issues** first
2. **Describe the problem** the feature would solve
3. **Propose a solution** if you have one
4. **Consider alternatives** you've thought about

## 📞 Get Help

- 📖 [User Guide](docs/USER_GUIDE.md)
- 🐛 [Report Issues](https://github.com/wxy/SilentFeed/issues)
- 💬 [Discussions](https://github.com/wxy/SilentFeed/discussions)

## 🎉 Recognition

Contributors will be recognized in:
- README.md
- Release notes
- Special thanks section

Thank you for contributing to Silent Feed! 🙏
