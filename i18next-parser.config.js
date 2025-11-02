// i18next-parser 配置
// 用于从代码中自动提取翻译 key

module.exports = {
  // 支持的语言
  locales: ["zh-CN", "en"],
  
  // 输出路径
  output: "public/locales/$LOCALE/translation.json",
  
  // 扫描的文件
  input: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}", // 排除测试文件
    "!src/test/**/*" // 排除测试目录
  ],
  
  // 默认命名空间
  defaultNamespace: "translation",
  
  // key 分隔符
  keySeparator: ".",
  
  // 命名空间分隔符
  namespaceSeparator: false,
  
  // 保留已删除的 key（设为 false 会自动清理）
  keepRemoved: false,
  
  // 排序
  sort: true,
  
  // 缩进
  indentation: 2,
  
  // 自定义函数名（我们使用 _ 函数）
  // 注意：i18next-parser 需要显式配置才能识别自定义函数名
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["_", "t"] // 同时支持 _ 和 t
      }
    ],
    tsx: [
      {
        lexer: "JsxLexer",
        functions: ["_", "t"],
        attr: "i18nKey"
      }
    ]
  },
  
  // 默认值
  defaultValue: function(lng, ns, key) {
    // 对于中文，返回空字符串（我们会手动填写）
    // 对于英文，返回空字符串（等待翻译）
    return ""
  },
  
  // 跳过默认值已存在的 key
  skipDefaultValues: false,
  
  // 使用 key 作为默认值（不推荐，我们手动管理）
  useKeysAsDefaultValue: false
}
