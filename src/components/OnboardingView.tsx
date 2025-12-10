/**
 * Onboarding 引导界面
 * 
 * 首次使用引导流程：
 * Step 1: 欢迎页 - 介绍产品价值
 * Step 2: 配置 AI - 设置 AI Provider 和 API Key
 * Step 3: 添加 RSS - 手动添加或导入 OPML
 * Step 4: 完成引导 - 进入学习阶段
 */

import { useState, useEffect, useRef } from "react"
import { useI18n } from "@/i18n/helpers"
import {
  getOnboardingState,
  updateOnboardingStep,
  completeOnboarding,
  skipOnboarding,
  type OnboardingStatus
} from "@/storage/onboarding-state"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  type AIProviderType,
  AVAILABLE_MODELS,
  getProviderFromModel
} from "@/storage/ai-config"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { OPMLImporter } from "@/core/rss/OPMLImporter"

interface OnboardingViewProps {
  onComplete: () => void  // 完成引导后的回调
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { _ } = useI18n()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Step 2: AI 配置状态
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionTested, setConnectionTested] = useState(false)
  
  // Step 3: RSS 添加状态
  const [rssUrl, setRssUrl] = useState("")
  const [addedFeeds, setAddedFeeds] = useState<string[]>([])
  const [isAddingFeed, setIsAddingFeed] = useState(false)

  // 获取当前 Provider
  const currentProvider = model ? getProviderFromModel(model) : null

  // 初始化：加载保存的状态
  useEffect(() => {
    const loadState = async () => {
      try {
        const status = await getOnboardingState()
        if (status.currentStep) {
          setCurrentStep(status.currentStep)
        }
        
        // 如果已经配置了 AI，跳到第 3 步
        const aiConfig = await getAIConfig()
        const hasAIProvider = Object.values(aiConfig.providers).some(
          p => p && p.apiKey && p.model
        )
        if (hasAIProvider) {
          setConnectionTested(true)
          if (status.currentStep && status.currentStep < 3) {
            setCurrentStep(3)
            await updateOnboardingStep(3)
          }
        }
      } catch (error) {
        console.error('Failed to load onboarding state:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadState()
  }, [])

  // 导航到下一步
  const nextStep = async () => {
    setError(null)
    setSuccess(null)
    
    // Step 2 AI 配置：如果已测试通过，保存配置；否则允许跳过
    if (currentStep === 2 && connectionTested && model && apiKey) {
      try {
        const provider = getProviderFromModel(model) as AIProviderType
        await saveAIConfig({
          provider,
          apiKey,
          model,
          endpoint: "",
          temperature: 0.7,
          maxTokens: 4096,
          timeout: 30000
        })
      } catch (error) {
        console.error("Failed to save AI config:", error)
      }
    }
    
    const newStep = currentStep + 1
    setCurrentStep(newStep)
    await updateOnboardingStep(newStep)
  }

  // 导航到上一步
  const prevStep = async () => {
    setError(null)
    setSuccess(null)
    
    const newStep = currentStep - 1
    setCurrentStep(newStep)
    await updateOnboardingStep(newStep)
  }

  // 加载中状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">{_("common.loading")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[400px] bg-gradient-to-br from-violet-100 via-sky-100 to-indigo-100 dark:from-slate-900 dark:via-indigo-950 dark:to-violet-950 flex flex-col relative overflow-hidden">
      {/* 装饰性光晕 */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-white/20 dark:from-white/5 dark:via-transparent dark:to-white/10 pointer-events-none" />
      
      {/* 进度条 */}
      <div className="px-4 pt-3 pb-2 relative z-10">
        <ProgressBar currentStep={currentStep} totalSteps={4} />
      </div>
      
      {/* 内容区 */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-4 mt-2 flex-1 shadow-lg border-t border-white/50 dark:border-white/10 relative z-10">
          {/* 渲染当前步骤 */}
          {currentStep === 1 && <WelcomeStep />}
          
          {currentStep === 2 && (
            <AIConfigStep
              model={model}
              setModel={setModel}
              apiKey={apiKey}
              setApiKey={setApiKey}
              currentProvider={currentProvider}
              isTestingConnection={isTestingConnection}
              setIsTestingConnection={setIsTestingConnection}
              connectionTested={connectionTested}
              setConnectionTested={setConnectionTested}
              error={error}
              setError={setError}
              success={success}
              setSuccess={setSuccess}
            />
          )}
          
          {currentStep === 3 && (
            <RSSSetupStep
              rssUrl={rssUrl}
              setRssUrl={setRssUrl}
              addedFeeds={addedFeeds}
              setAddedFeeds={setAddedFeeds}
              isAddingFeed={isAddingFeed}
              setIsAddingFeed={setIsAddingFeed}
              error={error}
              setError={setError}
              success={success}
              setSuccess={setSuccess}
            />
          )}
          
          {currentStep === 4 && (
            <CompletionStep onComplete={onComplete} />
          )}
          
          {/* 错误/成功消息 */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
            </div>
          )}
          
          {/* 导航按钮 */}
          <div className="flex justify-between mt-6">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {_("onboarding.buttons.back")}
            </button>
            
            <button
              onClick={nextStep}
              disabled={currentStep === 4}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {currentStep === 3 ? _("onboarding.buttons.finish") : _("onboarding.buttons.next")}
            </button>
          </div>
      </div>
    </div>
  )
}

// === 子组件 ===

/**
 * 进度条组件
 */
function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const { _ } = useI18n()
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{_("onboarding.progress.step", { current: currentStep, total: totalSteps })}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2.5 bg-gray-200/80 dark:bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500 transition-all duration-500 shadow-lg"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Step 1: 欢迎页
 */
function WelcomeStep() {
  const { _ } = useI18n()
  const iconUrl = "assets/icons/128/base-static.png"

  return (
    <div className="text-center space-y-5">
      {/* Logo/图标 */}
      <div className="flex justify-center">
        <img 
          src={iconUrl}
          alt="Silent Feed" 
          className="w-20 h-20 shadow-xl"
          style={{ borderRadius: '1.3rem' }}
        />
      </div>
      
      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        {_("onboarding.welcome.title")}
      </h1>
      
      {/* 副标题 */}
      <p className="text-xl text-gray-600 dark:text-gray-400">
        {_("onboarding.welcome.subtitle")}
      </p>
      
      {/* 功能介绍 */}
      <div className="space-y-3 text-left max-w-md mx-auto mt-6">
        <FeatureItem
          icon="👨‍💼"
          title={_("onboarding.welcome.features.professional.title")}
          description={_("onboarding.welcome.features.professional.description")}
        />
        <FeatureItem
          icon="🎯"
          title={_("onboarding.welcome.features.intelligent.title")}
          description={_("onboarding.welcome.features.intelligent.description")}
        />
        <FeatureItem
          icon="🔒"
          title={_("onboarding.welcome.features.privacy.title")}
          description={_("onboarding.welcome.features.privacy.description")}
        />
      </div>
      
      {/* 说明 */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-8">
        {_("onboarding.welcome.note")}
      </p>
    </div>
  )
}

/**
 * 功能介绍项
 */
function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <span className="text-xl">{icon}</span>
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </div>
  )
}

/**
 * Step 2: AI 配置
 */
interface AIConfigStepProps {
  model: string
  setModel: (model: string) => void
  apiKey: string
  setApiKey: (key: string) => void
  currentProvider: AIProviderType | null
  isTestingConnection: boolean
  setIsTestingConnection: (testing: boolean) => void
  connectionTested: boolean
  setConnectionTested: (tested: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  success: string | null
  setSuccess: (success: string | null) => void
}

function AIConfigStep({
  model,
  setModel,
  apiKey,
  setApiKey,
  currentProvider,
  isTestingConnection,
  setIsTestingConnection,
  connectionTested,
  setConnectionTested,
  error,
  setError,
  success,
  setSuccess
}: AIConfigStepProps) {
  const { _ } = useI18n()

  /**
   * 清理 API Key 中的非 ASCII 字符
   * 
   * 问题：用户可能复制了包含不可见 Unicode 字符的 API Key
   * 解决：移除所有非 ASCII 可打印字符
   */
  const sanitizeApiKey = (key: string): string => {
    // 只保留 ASCII 可打印字符 (0x20-0x7E)
    return key.replace(/[^\x20-\x7E]/g, '').trim()
  }

  // 测试连接
  const handleTestConnection = async () => {
    if (!model) {
      setError(_("onboarding.errors.selectModel"))
      return
    }
    if (!currentProvider) {
      setError(_("onboarding.errors.invalidModel"))
      return
    }
    if (!apiKey) {
      setError(_("onboarding.errors.enterApiKey"))
      return
    }

    // 清理 API Key
    const cleanApiKey = sanitizeApiKey(apiKey)

    setIsTestingConnection(true)
    setError(null)
    setSuccess(null)

    try {
      // 1. 验证格式
      const isValid = validateApiKey(currentProvider, cleanApiKey)
      if (!isValid) {
        setError(_("onboarding.errors.invalidApiKeyFormat"))
        setIsTestingConnection(false)
        return
      }

      // 2. 获取当前配置（保留其他设置）
      const currentConfig = await getAIConfig()

      // 3. 使用新的 providers 结构保存配置
      await saveAIConfig({
        ...currentConfig,
        providers: {
          ...currentConfig.providers,
          [currentProvider]: {
            apiKey: cleanApiKey,
            model: model,
            enableReasoning: false
          }
        },
        // 设为首选 Provider
        preferredRemoteProvider: currentProvider as "deepseek" | "openai"
      })

      // 4. 直接创建 Provider 实例测试（避免依赖 aiManager 初始化）
      let provider: { testConnection: (enableReasoning: boolean) => Promise<{ success: boolean; message?: string; latency?: number }> }
      
      if (currentProvider === 'deepseek') {
        const { DeepSeekProvider } = await import('@/core/ai/providers/DeepSeekProvider')
        provider = new DeepSeekProvider({ 
          apiKey: cleanApiKey,
          model: model
        })
      } else if (currentProvider === 'openai') {
        const { OpenAIProvider } = await import('@/core/ai/providers/OpenAIProvider')
        provider = new OpenAIProvider({ 
          apiKey: cleanApiKey,
          model: model
        })
      } else {
        throw new Error(_("onboarding.errors.unsupportedProvider", { provider: currentProvider }))
      }
      
      const result = await provider.testConnection(false)

      if (result.success) {
        setSuccess(_("onboarding.success.connectionTested"))
        setConnectionTested(true)
      } else {
        setError(_("onboarding.errors.connectionFailed", { message: result.message }))
      }
    } catch (err) {
      setError(_("onboarding.errors.testFailed", { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setIsTestingConnection(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {_("onboarding.aiConfig.title")}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {_("onboarding.aiConfig.description")}
        </p>
      </div>

      {/* 模型选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {_("onboarding.aiConfig.labels.model")}
        </label>
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value)
            setConnectionTested(false)
            setError(null)
            setSuccess(null)
          }}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{_("onboarding.aiConfig.placeholders.selectModel")}</option>
          {Object.entries(AVAILABLE_MODELS).map(([provider, models]) => (
            <optgroup key={provider} label={provider.toUpperCase()}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {_(`options.aiConfig.models.${m.id}.name`)} - {_(`options.aiConfig.models.${m.id}.description`)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* API Key */}
      {model && currentProvider && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {_("onboarding.aiConfig.labels.apiKey")} ({currentProvider.toUpperCase()})
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setConnectionTested(false)
              setError(null)
              setSuccess(null)
            }}
            placeholder={_("onboarding.aiConfig.placeholders.enterApiKey")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          
          {/* 帮助链接 */}
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {_("onboarding.aiConfig.help.getApiKey")}{" "}
            <a
              href={currentProvider === "deepseek" ? "https://platform.deepseek.com" : "https://platform.openai.com/api-keys"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {currentProvider === "deepseek" ? "DeepSeek Platform" : "OpenAI Platform"}
            </a>
          </p>
        </div>
      )}

      {/* 测试按钮 */}
      {model && apiKey && (
        <button
          onClick={handleTestConnection}
          disabled={isTestingConnection || connectionTested}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTestingConnection
            ? _("onboarding.aiConfig.buttons.testing")
            : connectionTested
            ? _("onboarding.aiConfig.buttons.tested")
            : _("onboarding.aiConfig.buttons.test")}
        </button>
      )}

      {/* 跳过说明 */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 {_("onboarding.aiConfig.skipHint")}
        </p>
      </div>
    </div>
  )
}

/**
 * Step 3: 添加 RSS 源
 */
interface RSSSetupStepProps {
  rssUrl: string
  setRssUrl: (url: string) => void
  addedFeeds: string[]
  setAddedFeeds: (feeds: string[]) => void
  isAddingFeed: boolean
  setIsAddingFeed: (adding: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  success: string | null
  setSuccess: (success: string | null) => void
}

function RSSSetupStep({
  rssUrl,
  setRssUrl,
  addedFeeds,
  setAddedFeeds,
  isAddingFeed,
  setIsAddingFeed,
  error,
  setError,
  success,
  setSuccess
}: RSSSetupStepProps) {
  const { _ } = useI18n()
  const feedManager = new FeedManager()
  const opmlImporter = new OPMLImporter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 添加 RSS 源
  const handleAddFeed = async () => {
    if (!rssUrl.trim()) {
      setError(_("onboarding.errors.enterRssUrl"))
      return
    }

    setIsAddingFeed(true)
    setError(null)
    setSuccess(null)

    try {
      // 添加候选源
      const id = await feedManager.addCandidate({
        url: rssUrl.trim(),
        title: "Manual Feed",  // 会在验证时更新
        discoveredFrom: 'manual',
        discoveredAt: Date.now()
      })
      
      // 订阅源
      await feedManager.subscribe(id, 'manual')
      
      setAddedFeeds([...addedFeeds, rssUrl.trim()])
      // 不显示成功消息，已添加列表已经提供了视觉反馈
      setRssUrl("")
    } catch (err) {
      setError(_("onboarding.errors.addFeedFailed", { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setIsAddingFeed(false)
    }
  }

  // 导入 OPML
  const handleImportOPML = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(null)

    try {
      const feeds = await OPMLImporter.fromFile(file)
      
      // 批量添加源并订阅
      for (const feed of feeds) {
        const id = await feedManager.addCandidate({
          url: feed.xmlUrl,
          title: feed.title,
          discoveredFrom: 'imported',
          discoveredAt: Date.now()
        })
        // 自动订阅导入的源
        await feedManager.subscribe(id, 'imported')
      }
      
      setSuccess(_("onboarding.success.opmlImported", { count: feeds.length }))
      
      // 更新已添加列表
      setAddedFeeds([...addedFeeds, ...feeds.map((f: any) => f.xmlUrl)])
    } catch (err) {
      setError(_("onboarding.errors.opmlImportFailed", { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {_("onboarding.rssSetup.title")}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {_("onboarding.rssSetup.description")}
        </p>
      </div>

      {/* 手动添加 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {_("onboarding.rssSetup.labels.feedUrl")}
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={rssUrl}
            onChange={(e) => setRssUrl(e.target.value)}
            placeholder={_("onboarding.rssSetup.placeholders.enterUrl")}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
          />
          <button
            onClick={handleAddFeed}
            disabled={isAddingFeed || !rssUrl.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAddingFeed ? _("onboarding.rssSetup.buttons.adding") : _("onboarding.rssSetup.buttons.add")}
          </button>
        </div>
      </div>

      {/* OPML 导入 */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {_("onboarding.rssSetup.labels.importOpml")}
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
          onChange={handleImportOPML}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {_("onboarding.rssSetup.buttons.selectFile")}
        </button>
      </div>

      {/* 示例源 */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          {_("onboarding.rssSetup.exampleFeeds.title")}
        </p>
        <div className="space-y-1.5">
          <ExampleFeed
            name={_("onboarding.rssSetup.exampleFeeds.solidot")}
            url="https://www.solidot.org/index.rss"
            onAdd={(url) => {
              setRssUrl(url)
            }}
          />
          <ExampleFeed
            name={_("onboarding.rssSetup.exampleFeeds.hackernews")}
            url="https://news.ycombinator.com/rss"
            onAdd={(url) => {
              setRssUrl(url)
            }}
          />
        </div>
      </div>

      {/* 已添加列表 - 简化显示 */}
      {addedFeeds.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            ✓ {_("onboarding.rssSetup.addedFeeds", { count: addedFeeds.length })}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 示例 RSS 源
 */
function ExampleFeed({ name, url, onAdd }: { name: string; url: string; onAdd: (url: string) => void }) {
  const { _ } = useI18n()
  
  return (
    <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
      <span className="text-xs text-gray-700 dark:text-gray-300">{name}</span>
      <button
        onClick={() => onAdd(url)}
        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
      >
        {_("onboarding.rssSetup.buttons.addThis")}
      </button>
    </div>
  )
}

/**
 * Step 4: 完成引导
 */
function CompletionStep({ onComplete }: { onComplete: () => void }) {
  const { _ } = useI18n()
  const [isCompleting, setIsCompleting] = useState(false)

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      await completeOnboarding()
      
      // 通知 background 进入 learning 状态
      chrome.runtime.sendMessage({
        type: "ONBOARDING_STATE_CHANGED",
        state: "learning"
      })
      
      onComplete()
    } catch (error) {
      console.error("Failed to complete onboarding:", error)
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div className="text-center space-y-5">
      {/* 成功图标 */}
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <span className="text-4xl">✅</span>
        </div>
      </div>

      {/* 标题 */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        {_("onboarding.completion.title")}
      </h2>

      {/* 说明 */}
      <div className="space-y-3 text-gray-600 dark:text-gray-400">
        <p>{_("onboarding.completion.description")}</p>
        <p className="text-sm">{_("onboarding.completion.learningPhase")}</p>
      </div>

      {/* 完成按钮 */}
      <button
        onClick={handleComplete}
        disabled={isCompleting}
        className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isCompleting ? _("onboarding.completion.buttons.completing") : _("onboarding.completion.buttons.start")}
      </button>
    </div>
  )
}
