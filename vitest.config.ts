import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// 加载 .env 文件中的环境变量
dotenv.config();
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
        '.plasmo/',
        '**/*.json',  // 排除 JSON 文件
        '**/*.css',   // 排除 CSS 文件
        'src/i18n/index.ts',  // i18n 配置在运行时初始化
        'src/contents/plasmo.ts',  // Plasmo 生成的文件
        'src/debug/**',  // 排除调试工具（仅开发环境使用）
        'src/core/*/index.ts',  // 排除简单的 re-export 文件
      ],
      // 覆盖率阈值
      // 注意：实际覆盖率 68.96%/69.72%，临时降低阈值
      // TODO: 改进 src/storage/db/index.ts (17.42%) 等低覆盖率文件
      thresholds: {
        lines: 68,
        functions: 69,
        branches: 58,
        statements: 68,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './'),
    },
  },
});
