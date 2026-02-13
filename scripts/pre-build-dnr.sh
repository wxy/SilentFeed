#!/bin/bash

# 构建前准备：复制 DNR 规则文件到 .plasmo 和 public 目录
# 开发模式：Plasmo dev 从 .plasmo 目录读取生成的临时清单引用的文件
# 生产构建：Plasmo build 从 public 目录打包静态资源

set -euo pipefail

echo "📋 准备 DNR 规则文件..."

# 检查源文件
if [ ! -f dnr-rules.json ]; then
  echo "❌ 错误: dnr-rules.json 文件不存在"
  exit 1
fi

# 复制到 .plasmo（开发模式使用）
mkdir -p .plasmo
cp dnr-rules.json .plasmo/dnr-rules.json
echo "✓ 已复制到 .plasmo/dnr-rules.json"

# 复制到 public（生产构建使用）
mkdir -p public
cp dnr-rules.json public/dnr-rules.json
echo "✓ 已复制到 public/dnr-rules.json"

echo "✅ DNR 规则文件准备完成"
