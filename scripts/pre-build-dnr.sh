#!/bin/bash

# 构建前准备：复制 DNR 规则文件到 .plasmo 和 public 目录
# 开发模式：Plasmo dev 从 .plasmo 目录读取生成的临时清单引用的文件
# 生产构建：Plasmo build 从 public 目录打包静态资源

set -euo pipefail

echo "📋 准备 DNR 规则文件..."

# 方案 1：复制到 .plasmo（开发模式使用）
mkdir -p .plasmo
cp dnr-rules.json .plasmo/ 2>/dev/null || true

# 方案 2：复制到 public（生产构建使用）
mkdir -p public
cp dnr-rules.json public/ 2>/dev/null || true

echo "✅ DNR 规则文件已准备到开发和生产目录"
