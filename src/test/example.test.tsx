import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 单元测试示例
 * 用于测试纯函数和工具类
 */

// 示例：测试一个简单的工具函数
function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return wordCount === 0 ? 0 : Math.ceil(wordCount / wordsPerMinute);
}

describe('Utils - calculateReadingTime', () => {
  it('应该正确计算短文本的阅读时间', () => {
    const text = '这是一段测试文本';
    const time = calculateReadingTime(text);
    expect(time).toBe(1); // 少于200字，返回1分钟
  });

  it('应该正确计算长文本的阅读时间', () => {
    const text = '测试 '.repeat(300); // 300个词
    const time = calculateReadingTime(text);
    expect(time).toBe(2); // 300/200 = 1.5, 向上取整为2
  });

  it('应该处理空字符串', () => {
    expect(calculateReadingTime('')).toBe(0);
  });
});

/**
 * 集成测试示例
 * 用于测试多个模块协作
 */

// 模拟的 ProfileBuilder 类
class ProfileBuilder {
  private interests: string[] = [];

  addInterest(interest: string): void {
    if (!this.interests.includes(interest)) {
      this.interests.push(interest);
    }
  }

  getInterests(): string[] {
    return [...this.interests];
  }

  getScore(topic: string): number {
    return this.interests.includes(topic) ? 1 : 0;
  }
}

describe('ProfileBuilder - 集成测试', () => {
  let profile: ProfileBuilder;

  beforeEach(() => {
    profile = new ProfileBuilder();
  });

  it('应该能添加和获取兴趣', () => {
    profile.addInterest('技术');
    profile.addInterest('AI');

    expect(profile.getInterests()).toEqual(['技术', 'AI']);
  });

  it('不应该添加重复的兴趣', () => {
    profile.addInterest('技术');
    profile.addInterest('技术');

    expect(profile.getInterests()).toHaveLength(1);
  });

  it('应该正确计算话题得分', () => {
    profile.addInterest('技术');

    expect(profile.getScore('技术')).toBe(1);
    expect(profile.getScore('娱乐')).toBe(0);
  });
});

/**
 * Mock 使用示例
 * 用于测试异步操作和外部依赖
 */

// 模拟的 API 服务
interface RSSItem {
  title: string;
  link: string;
}

class RSSService {
  async fetchFeed(url: string): Promise<RSSItem[]> {
    // 实际实现会调用网络请求
    throw new Error('Not implemented');
  }
}

describe('RSSService - Mock 测试', () => {
  it('应该能获取 RSS 内容', async () => {
    const service = new RSSService();

    // Mock fetchFeed 方法
    const mockFetch = vi.spyOn(service, 'fetchFeed').mockResolvedValue([
      { title: '测试文章', link: 'https://example.com/1' },
    ]);

    const items = await service.fetchFeed('https://example.com/feed');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/feed');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('测试文章');

    // 清理 mock
    mockFetch.mockRestore();
  });

  it('应该处理网络错误', async () => {
    const service = new RSSService();

    const mockFetch = vi
      .spyOn(service, 'fetchFeed')
      .mockRejectedValue(new Error('Network error'));

    await expect(service.fetchFeed('invalid-url')).rejects.toThrow(
      'Network error'
    );

    mockFetch.mockRestore();
  });
});

/**
 * React 组件测试示例
 */
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 简单的计数器组件
function Counter() {
  const [count, setCount] = React.useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}

describe('Counter 组件测试', () => {
  it('应该渲染初始计数', () => {
    const { getByText } = render(<Counter />);
    expect(getByText('Count: 0')).toBeInTheDocument();
  });

  it('应该能增加计数', async () => {
    const user = userEvent.setup();
    const { getByText } = render(<Counter />);

    const button = getByText('Increment');
    await user.click(button);

    expect(getByText('Count: 1')).toBeInTheDocument();
  });

  it('应该能重置计数', async () => {
    const user = userEvent.setup();
    const { getByText } = render(<Counter />);

    await user.click(getByText('Increment'));
    await user.click(getByText('Increment'));
    expect(getByText('Count: 2')).toBeInTheDocument();

    await user.click(getByText('Reset'));
    expect(getByText('Count: 0')).toBeInTheDocument();
  });
});

// React import (需要放在文件顶部,这里为了示例清晰放在使用前)
import React from 'react';
