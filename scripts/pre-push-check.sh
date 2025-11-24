#!/bin/bash
# Pre-push 检查脚本
# 在推送代码前执行测试和覆盖率检查

set -e  # 遇到错误立即退出

echo "🔍 开始 Pre-push 检查..."
echo ""

# 1. 运行测试并检查覆盖率（test:coverage 已包含测试运行）
echo "📊 运行测试并检查覆盖率..."
npm run test:coverage
echo "✅ 测试通过，覆盖率达标"
echo ""

# 3. 运行构建
echo "🏗️  运行生产构建..."
npm run build
echo "✅ 构建成功"
echo ""

echo "🎉 Pre-push 检查全部通过！"
echo "可以安全推送代码了。"
