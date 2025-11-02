# 测试快速参考

## 常用命令

```bash
npm test                 # 监听模式 (开发时)
npm run test:run         # 运行一次
npm run test:coverage    # 生成覆盖率报告
npm run test:ui          # 可视化界面
```

## 测试结构模板

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('功能名称', () => {
  beforeEach(() => {
    // 每个测试前的准备工作
  });

  it('应该做某事', () => {
    // Arrange - 准备数据
    const input = 'test';
    
    // Act - 执行操作
    const result = myFunction(input);
    
    // Assert - 验证结果
    expect(result).toBe('expected');
  });
});
```

## 常用断言

```typescript
// 相等性
expect(value).toBe(42);              // 严格相等 ===
expect(value).toEqual({ a: 1 });     // 深度相等
expect(value).not.toBe(null);        // 否定

// 真假值
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();

// 数字
expect(num).toBeGreaterThan(10);
expect(num).toBeLessThan(100);
expect(num).toBeCloseTo(0.3, 2);

// 字符串
expect(str).toContain('substring');
expect(str).toMatch(/pattern/);

// 数组/对象
expect(arr).toHaveLength(3);
expect(arr).toContain('item');
expect(obj).toHaveProperty('key');

// 函数
expect(fn).toThrow();
expect(fn).toThrow('Error message');

// DOM
expect(element).toBeInTheDocument();
expect(element).toHaveTextContent('text');
```

## Mock 使用

```typescript
import { vi } from 'vitest';

// 创建 mock 函数
const mockFn = vi.fn();
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue({ data: 'test' });

// 验证调用
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg');
expect(mockFn).toHaveBeenCalledTimes(2);

// Mock 模块方法
const spy = vi.spyOn(object, 'method')
  .mockImplementation(() => 'mocked');
spy.mockRestore();
```

## React 组件测试

```typescript
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('测试组件', async () => {
  const user = userEvent.setup();
  const { getByText, getByRole } = render(<MyComponent />);
  
  // 查找元素
  const button = getByText('Click me');
  const input = getByRole('textbox');
  
  // 用户交互
  await user.click(button);
  await user.type(input, 'Hello');
  
  // 断言
  expect(getByText('Result')).toBeInTheDocument();
});
```

## 异步测试

```typescript
it('测试异步操作', async () => {
  const result = await asyncFunction();
  expect(result).toBe('success');
});

// 使用 waitFor
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(getByText('Loaded')).toBeInTheDocument();
});
```

## 定时器 Mock

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

## 调试技巧

```typescript
// 只运行这个测试
it.only('调试这个测试', () => { ... });

// 跳过测试
it.skip('暂时跳过', () => { ... });

// 打印 DOM 结构
const { debug } = render(<Component />);
debug();

// 查看组件状态
console.log(component.state);
```

## 测试覆盖率目标

- **行覆盖率**: ≥ 70%
- **函数覆盖率**: ≥ 70%
- **分支覆盖率**: ≥ 60%

## 测试类型速查

| 测试类型 | 测试对象 | 文件位置 |
|---------|---------|---------|
| 单元测试 | 纯函数、工具类 | `utils/*.test.ts` |
| 集成测试 | 类、模块协作 | `core/**/*.test.ts` |
| 组件测试 | React 组件 | `components/**/*.test.tsx` |
| Mock 测试 | API、外部依赖 | 任何需要 mock 的地方 |

## 提交前检查清单

- [ ] `npm test` 全部通过
- [ ] `npm run test:coverage` 覆盖率达标
- [ ] 新功能已编写测试
- [ ] 测试描述清晰易懂
- [ ] 无 `it.only` 或 `it.skip`

详见完整文档: [docs/TESTING.md](./TESTING.md)
