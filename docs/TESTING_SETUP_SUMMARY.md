# 测试体系建立完成总结

## ✅ 已完成的工作

### 1. 测试框架安装

- ✅ **Vitest 4.0.6**: 快速、现代的测试运行器
- ✅ **Testing Library**: React 组件测试工具
  - `@testing-library/react`
  - `@testing-library/dom`
  - `@testing-library/user-event`
  - `@testing-library/jest-dom`
- ✅ **fake-indexeddb**: IndexedDB mock,用于测试 Dexie.js
- ✅ **@vitest/coverage-v8**: 代码覆盖率工具
- ✅ **@vitest/ui**: 可视化测试界面

### 2. 配置文件创建

#### vitest.config.ts
- ✅ 配置 jsdom 环境用于 DOM 测试
- ✅ 设置覆盖率阈值 (70%/70%/60%)
- ✅ 配置路径别名 (@/ 和 ~/)
- ✅ 排除不需要覆盖率统计的文件

#### src/test/setup.ts
- ✅ 自动清理 React 组件
- ✅ Mock Chrome API (runtime, storage, tabs)
- ✅ Mock IndexedDB (通过 fake-indexeddb)
- ✅ 导入 jest-dom 断言扩展

### 3. 测试示例文件

#### src/test/example.test.tsx
包含 4 种测试类型的完整示例：
- ✅ **单元测试**: 纯函数测试 (`calculateReadingTime`)
- ✅ **集成测试**: 类协作测试 (`ProfileBuilder`)
- ✅ **Mock 测试**: 异步操作和 API 测试 (`RSSService`)
- ✅ **组件测试**: React 组件交互测试 (`Counter`)

**测试结果**: ✅ 11/11 通过

### 4. 文档创建

- ✅ **docs/TESTING.md** (400+ 行)
  - 测试类型详解
  - Mock 使用指南
  - 最佳实践
  - 常见问题解答
  - 调试技巧

- ✅ **docs/TESTING_QUICK_REFERENCE.md**
  - 常用命令速查
  - 断言语法参考
  - Mock 模板
  - 提交前检查清单

### 5. package.json 脚本

```json
{
  "test": "vitest",                    // 监听模式
  "test:ui": "vitest --ui",            // 可视化界面
  "test:run": "vitest run",            // 运行一次
  "test:coverage": "vitest run --coverage"  // 覆盖率报告
}
```

### 6. GitHub Actions CI

- ✅ **.github/workflows/test.yml**
  - 自动运行测试
  - 生成覆盖率报告
  - 上传到 Codecov (可选)

### 7. Copilot Instructions 更新

- ✅ 添加"测试要求"章节
- ✅ 明确覆盖率目标
- ✅ 测试工作流说明
- ✅ 测试类型指导

## 📊 当前测试状态

```
✓ src/test/example.test.tsx (11 tests) 142ms
  ✓ Utils - calculateReadingTime (3)
  ✓ ProfileBuilder - 集成测试 (3)
  ✓ RSSService - Mock 测试 (2)
  ✓ Counter 组件测试 (3)

Test Files  1 passed (1)
     Tests  11 passed (11)
  Duration  620ms
```

## 🎯 测试覆盖率配置

| 指标 | 阈值 | 说明 |
|------|------|------|
| 行覆盖率 | ≥ 70% | 代码行被执行的比例 |
| 函数覆盖率 | ≥ 70% | 函数被调用的比例 |
| 分支覆盖率 | ≥ 60% | 条件分支被测试的比例 |
| 语句覆盖率 | ≥ 70% | 语句被执行的比例 |

## 🚀 如何使用测试

### 开发时

```bash
# 启动监听模式，代码变化时自动重新运行
npm test
```

### 提交前

```bash
# 运行所有测试
npm run test:run

# 检查覆盖率
npm run test:coverage
```

### 调试时

```bash
# 使用可视化界面
npm run test:ui
```

在浏览器中打开 http://localhost:51204/__vitest__/

## 📝 编写测试的工作流

### 1. 创建测试文件

```bash
# 在相同目录下创建 .test.ts(x) 文件
src/core/profile/ProfileBuilder.ts
src/core/profile/ProfileBuilder.test.ts  # 测试文件
```

### 2. 编写测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileBuilder } from './ProfileBuilder';

describe('ProfileBuilder', () => {
  let builder: ProfileBuilder;

  beforeEach(() => {
    builder = new ProfileBuilder();
  });

  it('应该能构建用户画像', () => {
    // Arrange
    const visits = [...];
    
    // Act
    const profile = builder.buildProfile(visits);
    
    // Assert
    expect(profile.interests).toContain('AI');
  });
});
```

### 3. 运行测试

```bash
npm test
```

### 4. 查看覆盖率

```bash
npm run test:coverage
open coverage/index.html  # macOS
```

## 🎓 测试最佳实践

### ✅ 推荐做法

1. **描述性的测试名称**
   ```typescript
   ✅ it('应该在用户输入无效URL时显示错误消息', ...)
   ❌ it('测试1', ...)
   ```

2. **AAA 模式** (Arrange-Act-Assert)
   ```typescript
   it('测试', () => {
     // Arrange - 准备
     const input = 'test';
     
     // Act - 执行
     const result = fn(input);
     
     // Assert - 验证
     expect(result).toBe('expected');
   });
   ```

3. **每个测试只测一件事**
   ```typescript
   ✅ it('应该添加兴趣', ...)
   ✅ it('应该删除兴趣', ...)
   ❌ it('应该添加、删除、更新兴趣', ...)
   ```

4. **测试边界情况**
   ```typescript
   it('应该处理正常输入', ...)
   it('应该处理空字符串', ...)
   it('应该处理超长输入', ...)
   it('应该处理特殊字符', ...)
   ```

### ❌ 避免的做法

1. 测试实现细节而非行为
2. 测试依赖特定顺序
3. 共享测试状态导致副作用
4. 过度 mock 导致测试无意义
5. 忽略边界情况和错误处理

## 🔧 常见问题

### Q: 如何 mock Chrome API?

A: Chrome API 已在 `src/test/setup.ts` 中全局 mock，可直接使用。如需自定义：

```typescript
import { vi } from 'vitest';

const spy = vi.spyOn(chrome.storage.local, 'get')
  .mockResolvedValue({ key: 'value' });

// ... 测试代码 ...

spy.mockRestore();
```

### Q: 如何测试 IndexedDB (Dexie)?

A: Dexie 已通过 `fake-indexeddb` mock，可正常使用：

```typescript
import { db } from '@/storage/db';

it('测试数据库', async () => {
  await db.pageVisits.add({ url: '...' });
  const visits = await db.pageVisits.toArray();
  expect(visits).toHaveLength(1);
});
```

### Q: 如何测试异步代码?

A: 使用 `async/await`:

```typescript
it('测试异步', async () => {
  const result = await asyncFunction();
  expect(result).toBe('success');
});
```

### Q: 如何调试失败的测试?

A: 使用以下方法：

1. `it.only()` 只运行特定测试
2. `npm run test:ui` 使用可视化界面
3. `debug()` 打印 DOM 结构
4. `console.log()` 输出中间状态

## 📚 参考资源

- [完整测试指南](./TESTING.md)
- [快速参考](./TESTING_QUICK_REFERENCE.md)
- [Vitest 官方文档](https://vitest.dev/)
- [Testing Library 文档](https://testing-library.com/)
- [测试示例代码](../src/test/example.test.tsx)

## 🎉 下一步

现在你可以：

1. ✅ 开始编写功能代码
2. ✅ 为每个功能编写测试
3. ✅ 运行测试确保通过
4. ✅ 检查覆盖率报告
5. ✅ 提交代码前确保测试通过

**记住**: 测试不是负担，而是保证代码质量和避免回归的保险。养成 TDD (测试驱动开发) 的习惯会让开发更高效！
