/**
 * 冷启动推荐模块
 * 
 * 解决用户画像不完善时的推荐问题：
 * - 利用已订阅源的主题分布进行跨源聚类
 * - 基于订阅源质量和主题热度进行推荐
 */

export { TopicClusterAnalyzer, type ClusterResult, type TopicCluster } from './topic-cluster'
export { ColdStartScorer, type ColdStartScore, type ColdStartConfig } from './cold-start-scorer'
export { 
  shouldUseColdStartStrategy, 
  getDynamicThreshold,
  type ColdStartDecision,
  type ThresholdConfig
} from './threshold-calculator'
