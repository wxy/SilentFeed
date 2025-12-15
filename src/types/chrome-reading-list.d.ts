/**
 * Chrome Reading List API 类型声明
 * Reading List API 从 Chrome 89 开始可用
 * @see https://developer.chrome.com/docs/extensions/reference/api/readingList
 */

declare namespace chrome.readingList {
  /**
   * 阅读列表条目
   */
  interface ReadingListEntry {
    /** 文章标题 */
    title: string
    /** 文章 URL */
    url: string
    /** 是否已读 */
    hasBeenRead: boolean
    /** 创建时间 (ms 时间戳) */
    creationTime: number
    /** 最后更新时间 (ms 时间戳) */
    lastUpdateTime: number
  }

  /**
   * 添加条目参数
   */
  interface AddEntryOptions {
    /** 文章标题 */
    title: string
    /** 文章 URL */
    url: string
    /** 是否已读 (可选，默认 false) */
    hasBeenRead?: boolean
  }

  /**
   * 查询过滤器
   */
  interface QueryInfo {
    /** 按标题筛选 (可选) */
    title?: string
    /** 按 URL 筛选 (可选) */
    url?: string
    /** 按已读状态筛选 (可选) */
    hasBeenRead?: boolean
  }

  /**
   * 更新条目参数
   */
  interface UpdateEntryOptions {
    /** 要更新的条目 URL */
    url: string
    /** 新标题 (可选) */
    title?: string
    /** 新已读状态 (可选) */
    hasBeenRead?: boolean
  }

  /**
   * 添加条目到阅读列表
   */
  function addEntry(entry: AddEntryOptions): Promise<void>

  /**
   * 查询阅读列表条目
   */
  function query(info: QueryInfo): Promise<ReadingListEntry[]>

  /**
   * 移除阅读列表条目
   */
  function removeEntry(info: { url: string }): Promise<void>

  /**
   * 更新阅读列表条目
   */
  function updateEntry(options: UpdateEntryOptions): Promise<void>

  /**
   * 条目添加事件
   */
  interface EntryAddedEvent extends chrome.events.Event<(entry: ReadingListEntry) => void> {}

  /**
   * 条目更新事件
   */
  interface EntryUpdatedEvent extends chrome.events.Event<(entry: ReadingListEntry) => void> {}

  /**
   * 条目移除事件
   */
  interface EntryRemovedEvent extends chrome.events.Event<(entry: ReadingListEntry) => void> {}

  /**
   * 条目添加事件监听器
   */
  const onEntryAdded: EntryAddedEvent

  /**
   * 条目更新事件监听器
   */
  const onEntryUpdated: EntryUpdatedEvent

  /**
   * 条目移除事件监听器
   */
  const onEntryRemoved: EntryRemovedEvent
}
