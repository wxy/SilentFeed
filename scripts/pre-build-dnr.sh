#!/bin/bash

# 构建前准备：复制 DNR 规则文件到 .plasmo 目录
# Plasmo 会从 .plasmo 目录读取并打包文件

set -euo pipefail

echo "📋 准备 DNR 规则文件..."

# 确保 .plasmo 目录存在
mkdir -p .plasmo

# 复制 DNR 规则文件
cp dnr-rules.json .plasmo/

echo "✅ DNR 规则文件已准备"
