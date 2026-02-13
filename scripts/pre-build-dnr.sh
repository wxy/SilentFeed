#!/bin/bash

# 构建前准备：复制 DNR 规则文件到 Plasmo 能找到的位置
# 注意：Plasmo build 和 dev 对文件路径的解析方式不同
# 解决方案：确保文件在 public 目录中（Plasmo 的静态资源目录）

set -euo pipefail

echo "📋 准备 DNR 规则文件..."

# 检查源文件
if [ ! -f dnr-rules.json ]; then
  echo "❌ 错误: dnr-rules.json 文件不存在"
  exit 1
fi

# 方案：复制到 public 目录（Plasmo 构建时的静态资源目录）
mkdir -p public
cp dnr-rules.json public/dnr-rules.json

# 强制刷新文件系统缓存
sync 2>/dev/null || true

# 验证文件确实存在
if [ ! -f public/dnr-rules.json ]; then
  echo "❌ 错误: 无法复制 DNR 规则文件到 public 目录"
  exit 1
fi

echo "✅ DNR 规则文件已准备: public/dnr-rules.json"
