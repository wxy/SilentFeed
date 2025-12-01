# Ollama CORS 配置修复指南

## 问题描述

Chrome 扩展访问本地 Ollama 时返回 403 错误，原因是 Ollama 默认拒绝 `chrome-extension://` 来源的请求。

## 验证问题

```bash
# 正常请求（成功）
curl http://localhost:11434/api/tags

# 模拟扩展请求（403 错误）
curl -H "Origin: chrome-extension://test" http://localhost:11434/api/tags
```

## 解决方案：配置 OLLAMA_ORIGINS

### macOS（推荐使用 launchd）

1. 创建 Ollama 配置文件：

```bash
# 创建配置目录
mkdir -p ~/Library/LaunchAgents

# 创建 plist 文件
cat > ~/Library/LaunchAgents/com.ollama.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/Ollama.app/Contents/Resources/ollama</string>
        <string>serve</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_ORIGINS</key>
        <string>chrome-extension://*</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ollama.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ollama.error.log</string>
</dict>
</plist>
EOF
```

2. 停止当前的 Ollama 进程：

```bash
# 找到并杀死 Ollama 进程
pkill -f "ollama serve"
```

3. 加载新配置并启动：

```bash
# 加载配置
launchctl load ~/Library/LaunchAgents/com.ollama.server.plist

# 验证启动
launchctl list | grep ollama
```

4. 验证修复：

```bash
# 应该返回 200
curl -i -H "Origin: chrome-extension://test" http://localhost:11434/api/tags
```

### 临时方案（仅本次会话有效）

```bash
# 停止 Ollama
pkill -f "ollama serve"

# 设置环境变量并启动
export OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

### Linux (systemd)

```bash
# 编辑服务配置
sudo systemctl edit ollama

# 添加以下内容：
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://*"

# 重启服务
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Windows

1. 以管理员身份打开 PowerShell
2. 设置系统环境变量：

```powershell
[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://*', 'Machine')
```

3. 重启 Ollama 服务

## 验证配置

配置完成后，使用以下命令验证：

```bash
# 应该返回 200 OK
curl -i -H "Origin: chrome-extension://test" http://localhost:11434/api/tags

# 应该看到 Access-Control-Allow-Origin 头
curl -v -H "Origin: chrome-extension://test" http://localhost:11434/api/tags 2>&1 | grep -i access-control
```

## 安全说明

- `chrome-extension://*` 允许所有 Chrome 扩展访问
- 如果需要更严格的控制，可以指定具体的扩展 ID：
  ```
  OLLAMA_ORIGINS=chrome-extension://your-extension-id
  ```
- 也可以同时允许多个来源（用逗号分隔）：
  ```
  OLLAMA_ORIGINS=chrome-extension://*,http://localhost:3000
  ```

## 参考资料

- [Ollama FAQ - CORS Configuration](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server)
- [Ollama Environment Variables](https://github.com/ollama/ollama/blob/main/docs/faq.md#environment-variables)
