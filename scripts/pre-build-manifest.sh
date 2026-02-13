#!/bin/bash

# 构建前清单初始化：确保 .plasmo 中的清单文件已生成
# 问题：首次运行 plasmo build 时，.plasmo/chrome-mv3.plasmo.manifest.json 不存在或不完整
#      导致 DNR 文件路径解析失败
# 观察：npm run dev 成功后，npm run build 也成功了
# 解决：通过运行一次 plasmo dev 初始化清单（使用 timeout 快速退出）

set -euo pipefail

if [ ! -f .plasmo/chrome-mv3.plasmo.manifest.json ]; then
  echo "初始化 Plasmo 清单文件... (这可能需要几秒钟)"
  # 首次需要生成清单，运行 dev 但快速超时
  timeout 12 npx plasmo dev 2>&1 | head -20 || true
  sleep 2
fi

# 确保 public 中的 DNR 文件对 plasmo build 可见
# （dev 可能需要 .plasmo 版本，build 需要 public 版本）
mkdir -p public
if [ ! -f public/dnr-rules.json ] && [ -f dnr-rules.json ]; then
  cp dnr-rules.json public/dnr-rules.json 2>/dev/null || true
fi

exit 0
