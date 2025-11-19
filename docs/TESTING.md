# Silent Feed 测试指南

## 快速开始

### 运行测试

```bash
# 监听模式（开发时使用）
npm test

# 运行所有测试一次
npm run test:run

# 生成覆盖率报告
npm run test:coverage

# 使用可视化 UI
npm run test:ui
```

## 测试类型

### 1. 单元测试 (Unit Tests)

**用途**: 测试独立的函数、类或模块

**示例**:
```typescript
// src/utils/textAnalyzer.test.ts
import { describe, it, expect } from 'vitest';
import { extractKeywords } from './textAnalyzer';

describe('extractKeywords', () => {
  it('应该提取文本中的关键词', () => {
    const text = 'AI 和机器学习正在改变世界';
    const keywords = extractKeywords(text);
    
    expect(keywords).toContain('AI');
    expect(keywords).toContain('机器学习');
  });
});
```

### 2. 集成测试 (Integration Tests)

**用途**: 测试多个模块的协作

**示例**:
```typescript
// src/core/profile/ProfileBuilder.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileBuilder } from './ProfileBuilder';
import { PageVisit } from '@/storage/types';

describe('ProfileBuilder 集成测试', () => {
  let builder: ProfileBuilder;

  beforeEach(() => {
    builder = new ProfileBuilder();
  });

  it('应该从页面访问中构建用户画像', () => {
    const visits: PageVisit[] = [
      {
        url: 'https://example.com/ai',
        title: 'AI 技术介绍',
        content: 'AI 和机器学习...',
        duration: 120,
        timestamp: Date.now(),
      },
    ];

    const profile = builder.buildProfile(visits);
    
    expect(profile.interests).toContain('AI');
    expect(profile.interests).toContain('机器学习');
  });
});
```

### 3. React 组件测试

**用途**: 测试 UI 组件的渲染和交互

**示例**:
```typescript
// src/components/ProgressBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar 组件', () => {
  it('应该显示正确的进度', () => {
    const { getByText } = render(
      <ProgressBar current={500} total={1000} />
    );
    
    expect(getByText('50%')).toBeInTheDocument();
  });

  it('点击后应该触发回调', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    
    const { getByRole } = render(
      <ProgressBar current={500} total={1000} onClick={onClick} />
    );
    
    await user.click(getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

### 4. 异步测试

**用途**: 测试 Promise、setTimeout 等异步操作

**示例**:
```typescript
// src/core/rss/RSSManager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RSSManager } from './RSSManager';

describe('RSSManager', () => {
  it('应该能获取 RSS feed', async () => {
    const manager = new RSSManager();
    
    // Mock 网络请求
    global.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('<rss>...</rss>'),
    } as Response);

    const items = await manager.fetchFeed('https://example.com/feed');
    
    expect(items.length).toBeGreaterThan(0);
  });
});
```

## Mock 使用指南

### Mock 函数

```typescript
import { vi } from 'vitest';

// 创建 mock 函数
const mockFn = vi.fn();

// 设置返回值
mockFn.mockReturnValue(42);

// 设置异步返回值
mockFn.mockResolvedValue({ data: 'test' });

// 验证调用
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenCalledTimes(2);
```

### Mock Chrome API

Chrome API 已在 `src/test/setup.ts` 中全局 mock,可直接使用:

```typescript
describe('使用 Chrome API', () => {
  it('应该能存储数据', async () => {
    await chrome.storage.local.set({ key: 'value' });
    
    const result = await chrome.storage.local.get('key');
    expect(result.key).toBe('value');
  });
});
```

如需自定义行为:

```typescript
import { vi } from 'vitest';

it('自定义 Chrome API 行为', async () => {
  const mockGet = vi.spyOn(chrome.storage.local, 'get')
    .mockResolvedValue({ key: 'custom-value' });

  const result = await chrome.storage.local.get('key');
  expect(result.key).toBe('custom-value');

  mockGet.mockRestore();
});
```

### Mock IndexedDB (Dexie)

IndexedDB 已通过 `fake-indexeddb` mock,可正常使用 Dexie:

```typescript
import { db } from '@/storage/db';

describe('数据库操作', () => {
  it('应该能保存和读取数据', async () => {
    await db.pageVisits.add({
      url: 'https://example.com',
      title: 'Test',
      timestamp: Date.now(),
    });

    const visits = await db.pageVisits.toArray();
    expect(visits).toHaveLength(1);
  });
});
```

## 测试覆盖率要求

当前项目要求:
- **行覆盖率**: ≥ 70%
- **函数覆盖率**: ≥ 70%
- **分支覆盖率**: ≥ 60%
- **语句覆盖率**: ≥ 70%

查看覆盖率:
```bash
npm run test:coverage
```

覆盖率报告会生成在 `coverage/` 目录,可在浏览器中打开 `coverage/index.html` 查看详细报告。

## 测试文件组织

```
src/
├── core/
│   ├── profile/
│   │   ├── ProfileBuilder.ts
│   │   └── ProfileBuilder.test.ts       # 单元测试
│   └── rss/
│       ├── RSSManager.ts
│       └── RSSManager.test.ts
├── components/
│   ├── ProgressBar.tsx
│   └── ProgressBar.test.tsx             # 组件测试
└── test/
    ├── setup.ts                          # 测试配置
    ├── example.test.tsx                  # 测试示例
    └── helpers/                          # 测试辅助函数
```

## 测试最佳实践

### 1. 使用描述性的测试名称

❌ 不好:
```typescript
it('测试1', () => { ... });
```

✅ 好:
```typescript
it('应该在用户输入无效URL时显示错误消息', () => { ... });
```

### 2. 遵循 AAA 模式

```typescript
it('应该正确计算得分', () => {
  // Arrange - 准备测试数据
  const profile = new ProfileBuilder();
  profile.addInterest('AI');

  // Act - 执行操作
  const score = profile.getScore('AI');

  // Assert - 验证结果
  expect(score).toBe(1);
});
```

### 3. 每个测试只测试一件事

❌ 不好:
```typescript
it('应该添加兴趣、删除兴趣、计算得分', () => {
  // 测试了太多东西
});
```

✅ 好:
```typescript
it('应该能添加兴趣', () => { ... });
it('应该能删除兴趣', () => { ... });
it('应该正确计算得分', () => { ... });
```

### 4. 使用 beforeEach 清理状态

```typescript
describe('ProfileBuilder', () => {
  let builder: ProfileBuilder;

  beforeEach(() => {
    builder = new ProfileBuilder(); // 每个测试都有全新的实例
  });

  it('测试1', () => { ... });
  it('测试2', () => { ... });
});
```

### 5. 测试边界情况

```typescript
describe('calculateReadingTime', () => {
  it('应该处理正常文本', () => { ... });
  it('应该处理空字符串', () => { ... });
  it('应该处理超长文本', () => { ... });
  it('应该处理只有空格的字符串', () => { ... });
});
```

## 常用断言

```typescript
// 基本断言
expect(value).toBe(42);                    // 严格相等 (===)
expect(value).toEqual({ a: 1 });           // 深度相等
expect(value).toBeTruthy();                // 真值
expect(value).toBeFalsy();                 // 假值
expect(value).toBeNull();                  // null
expect(value).toBeUndefined();             // undefined

// 数字
expect(value).toBeGreaterThan(10);
expect(value).toBeLessThan(100);
expect(value).toBeCloseTo(0.3, 2);         // 浮点数比较

// 字符串
expect(str).toContain('test');
expect(str).toMatch(/pattern/);

// 数组
expect(arr).toHaveLength(3);
expect(arr).toContain('item');

// 对象
expect(obj).toHaveProperty('key');
expect(obj).toMatchObject({ a: 1 });

// 函数
expect(fn).toThrow();
expect(fn).toThrow('Error message');

// DOM (需要 @testing-library/jest-dom)
expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toHaveTextContent('text');
```

## 调试测试

### 1. 使用 `it.only` 单独运行测试

```typescript
it.only('只运行这个测试', () => {
  // ...
});
```

### 2. 跳过测试

```typescript
it.skip('暂时跳过这个测试', () => {
  // ...
});
```

### 3. 查看渲染结果

```typescript
import { render } from '@testing-library/react';

it('调试组件', () => {
  const { debug } = render(<MyComponent />);
  debug(); // 打印 DOM 结构
});
```

### 4. 使用 Vitest UI

```bash
npm run test:ui
```

在浏览器中可视化查看测试结果,支持交互式调试。

## 持续集成 (CI)

在 GitHub Actions 中运行测试:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:run
      - run: npm run test:coverage
```

## 常见问题

### Q: 测试中如何处理时间相关的代码?

使用 `vi.useFakeTimers()`:

```typescript
import { vi } from 'vitest';

it('测试定时器', () => {
  vi.useFakeTimers();
  
  const callback = vi.fn();
  setTimeout(callback, 1000);
  
  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
  
  vi.useRealTimers();
});
```

### Q: 如何测试需要登录的功能?

在测试中 mock 认证状态:

```typescript
beforeEach(() => {
  // Mock 已登录状态
  vi.spyOn(chrome.storage.local, 'get')
    .mockResolvedValue({ isLoggedIn: true });
});
```

### Q: 测试运行很慢怎么办?

1. 使用 `it.concurrent` 并行运行独立测试
2. 减少不必要的渲染
3. 使用 `beforeEach` 而不是在每个测试中重复设置

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [Testing Library 文档](https://testing-library.com/)
- [测试示例](./src/test/example.test.tsx)
