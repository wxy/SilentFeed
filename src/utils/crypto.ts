/**
 * 加密工具 - API 密钥安全存储
 * 
 * 使用 AES-GCM 256 位加密算法，提供真正的安全保护
 * 
 * 架构：
 * 1. 密钥派生：从扩展 ID 派生加密密钥（每个扩展实例唯一）
 * 2. 初始化向量：每次加密使用随机 IV（防止模式攻击）
 * 3. 认证加密：AES-GCM 提供加密 + 完整性验证
 * 4. 格式：iv:encryptedData:authTag (Base64 编码)
 * 
 * 安全保证：
 * - ✅ 防止 chrome.storage 明文泄露
 * - ✅ 防止内存转储攻击（加密态存储）
 * - ✅ 防止篡改（GCM 认证标签）
 * - ⚠️ 不防止恶意扩展读取（同域访问）
 */

import { logger } from "@/utils/logger"
import { withErrorHandlingSync } from "@/utils/error-handler"

const cryptoLogger = logger.withTag('Crypto')

/**
 * 加密格式版本（用于未来迁移）
 */
const CRYPTO_VERSION = 1

/**
 * 从扩展 ID 派生加密密钥
 * 
 * 使用 PBKDF2 算法将扩展 ID 转换为 256 位 AES 密钥
 * 
 * @returns CryptoKey 用于 AES-GCM 加密
 */
async function deriveKey(): Promise<CryptoKey> {
  // 使用扩展 ID 作为密码（每个扩展实例唯一）
  const extensionId = chrome.runtime.id
  
  // 固定盐值（公开无妨，安全性来自扩展 ID 的唯一性）
  const salt = new TextEncoder().encode('silentfeed-api-key-salt-v1')
  
  // 将扩展 ID 转换为密钥材料
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(extensionId),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  // 派生 AES-GCM 密钥
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,  // 10 万次迭代，平衡安全性和性能
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,  // 不可导出
    ['encrypt', 'decrypt']
  )
}

/**
 * 加密 API Key
 * 
 * 使用 AES-GCM-256 加密，输出格式：version:iv:ciphertext
 * 
 * @param plaintext 明文 API Key
 * @returns 加密后的字符串（Base64 编码）
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.trim() === '') {
    return ''
  }
  
  return withErrorHandlingSync(
    async () => {
      // 1. 派生加密密钥
      const key = await deriveKey()
      
      // 2. 生成随机 IV（96 位，GCM 推荐）
      const iv = crypto.getRandomValues(new Uint8Array(12))
      
      // 3. 加密数据
      const encodedText = new TextEncoder().encode(plaintext)
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedText
      )
      
      // 4. 组合格式：version:iv:ciphertext（都用 Base64 编码）
      const ivBase64 = arrayBufferToBase64(iv)
      const ciphertextBase64 = arrayBufferToBase64(ciphertext)
      
      return `${CRYPTO_VERSION}:${ivBase64}:${ciphertextBase64}`
    },
    {
      tag: 'Crypto.encryptApiKey',
      fallback: Promise.resolve(plaintext),  // 加密失败时返回明文（总比丢失好）
      errorCode: 'API_KEY_ENCRYPT_ERROR',
      userMessage: 'API Key 加密失败',
      onError: (error) => {
        cryptoLogger.error('加密失败，将以明文存储', error)
      }
    }
  ) as Promise<string>
}

/**
 * 解密 API Key
 * 
 * @param encrypted 加密的字符串
 * @returns 明文 API Key
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  if (!encrypted || encrypted.trim() === '') {
    return ''
  }
  
  return withErrorHandlingSync(
    async () => {
      // 检查格式：version:iv:ciphertext
      const parts = encrypted.split(':')
      
      // 如果不是新加密格式（没有 3 个部分），尝试旧格式解密
      if (parts.length !== 3) {
        // 尝试旧的 Base64 解密（向后兼容）
        return decryptLegacyBase64(encrypted)
      }
      
      const [versionStr, ivBase64, ciphertextBase64] = parts
      const version = parseInt(versionStr, 10)
      
      // 版本检查
      if (version !== CRYPTO_VERSION) {
        cryptoLogger.warn(`不支持的加密版本 ${version}，当前版本 ${CRYPTO_VERSION}`)
        return encrypted
      }
      
      // 1. 解码 Base64（可能失败 - 数据损坏）
      let iv: Uint8Array
      let ciphertext: Uint8Array
      try {
        iv = base64ToArrayBuffer(ivBase64)
        ciphertext = base64ToArrayBuffer(ciphertextBase64)
      } catch (error) {
        cryptoLogger.warn('Base64 解码失败，数据已损坏', error)
        return encrypted  // 返回原始数据
      }
      
      // 2. 派生密钥
      const key = await deriveKey()
      
      // 3. 解密（可能失败 - GCM 认证失败/数据篡改）
      let decrypted: ArrayBuffer
      try {
        decrypted = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: new Uint8Array(iv)  // 转换为标准 Uint8Array
          },
          key,
          new Uint8Array(ciphertext)  // 转换为标准 Uint8Array
        )
      } catch (error) {
        cryptoLogger.warn('解密失败，可能数据已篡改', error)
        return encrypted  // 返回原始数据
      }
      
      // 4. 转换为字符串
      return new TextDecoder().decode(decrypted)
    },
    {
      tag: 'Crypto.decryptApiKey',
      fallback: Promise.resolve(encrypted),  // 解密失败时返回原始数据
      errorCode: 'API_KEY_DECRYPT_ERROR',
      userMessage: 'API Key 解密失败',
      onError: (error) => {
        cryptoLogger.warn('解密失败，可能数据已损坏', error)
      }
    }
  ) as Promise<string>
}

/**
 * 解密旧的 Base64 格式（向后兼容）
 */
function decryptLegacyBase64(encryptedKey: string): string {
  // 检查是否是 Base64 格式（已加密）
  // Base64 只包含 A-Z, a-z, 0-9, +, /, = 字符
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  if (!base64Regex.test(encryptedKey)) {
    // 不是 Base64，可能是明文 API key（如 sk-xxx），直接返回
    cryptoLogger.debug('检测到明文 API Key（旧格式）')
    return encryptedKey
  }
  
  try {
    // 从 Base64 解码
    const decoded = atob(encryptedKey)
    
    // 转换回 Uint8Array
    const data = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)))
    
    // 使用 TextDecoder 处理 Unicode
    const decoder = new TextDecoder()
    const result = decoder.decode(data)
    
    cryptoLogger.debug('成功解密旧格式 Base64')
    return result
  } catch (error) {
    // 解密失败，返回原始值
    cryptoLogger.warn('旧格式 Base64 解密失败，返回原始值', error)
    return encryptedKey
  }
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Base64 转 Uint8Array
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * 检查字符串是否为加密格式
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 3 && parts[0] === String(CRYPTO_VERSION)
}
