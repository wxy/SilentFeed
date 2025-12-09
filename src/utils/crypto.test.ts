/**
 * 加密工具测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptApiKey, decryptApiKey, isEncrypted } from './crypto'

// Mock chrome.runtime.id
beforeEach(() => {
  global.chrome = {
    runtime: {
      id: 'test-extension-id-12345'
    }
  } as any
})

describe('crypto', () => {
  describe('encryptApiKey', () => {
    it('应该加密非空字符串', async () => {
      const plaintext = 'sk-test-api-key-123456'
      const encrypted = await encryptApiKey(plaintext)
      
      // 验证格式：version:iv:ciphertext
      expect(encrypted).toMatch(/^1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
      
      // 验证不等于明文
      expect(encrypted).not.toBe(plaintext)
      
      // 验证长度合理（Base64 会增加约 33%）
      expect(encrypted.length).toBeGreaterThan(plaintext.length)
    })
    
    it('应该为空字符串返回空', async () => {
      expect(await encryptApiKey('')).toBe('')
      expect(await encryptApiKey('   ')).toBe('')
    })
    
    it('应该处理 Unicode 字符', async () => {
      const plaintext = '测试密钥-🔐-key'
      const encrypted = await encryptApiKey(plaintext)
      
      expect(encrypted).toMatch(/^1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
      expect(encrypted).not.toBe(plaintext)
    })
    
    it('每次加密应该产生不同的密文（随机 IV）', async () => {
      const plaintext = 'sk-test-key'
      const encrypted1 = await encryptApiKey(plaintext)
      const encrypted2 = await encryptApiKey(plaintext)
      
      // 两次加密结果不同（IV 不同）
      expect(encrypted1).not.toBe(encrypted2)
      
      // 但都能正确解密
      expect(await decryptApiKey(encrypted1)).toBe(plaintext)
      expect(await decryptApiKey(encrypted2)).toBe(plaintext)
    })
    
    it('应该处理很长的 API Key', async () => {
      const longKey = 'sk-' + 'a'.repeat(500)
      const encrypted = await encryptApiKey(longKey)
      
      expect(encrypted).toMatch(/^1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
      expect(await decryptApiKey(encrypted)).toBe(longKey)
    })
  })
  
  describe('decryptApiKey', () => {
    it('应该正确解密加密的字符串', async () => {
      const plaintext = 'sk-test-api-key-123456'
      const encrypted = await encryptApiKey(plaintext)
      const decrypted = await decryptApiKey(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })
    
    it('应该为空字符串返回空', async () => {
      expect(await decryptApiKey('')).toBe('')
      expect(await decryptApiKey('   ')).toBe('')
    })
    
    it('应该向后兼容明文 API Key', async () => {
      // 旧版本可能存储的是明文
      const plaintextKey = 'sk-old-plaintext-key'
      const decrypted = await decryptApiKey(plaintextKey)
      
      // 应该直接返回明文
      expect(decrypted).toBe(plaintextKey)
    })
    
    it('应该向后兼容旧的 Base64 编码', async () => {
      // 旧版本使用的简单 Base64 编码（没有冒号分隔）
      const oldEncoded = 'c2stb2xkLWJhc2U2NC1rZXk='  // 'sk-old-base64-key' 的 Base64
      const decrypted = await decryptApiKey(oldEncoded)
      
      // 应该正确解密旧格式
      expect(decrypted).toBe('sk-old-base64-key')
    })
    
    it('应该处理损坏的加密数据', async () => {
      const corrupted = '1:invalid-iv:invalid-ciphertext'
      const result = await decryptApiKey(corrupted)
      
      // 解密失败时应该返回原始字符串
      expect(result).toBe(corrupted)
    })
    
    it('应该处理不支持的版本', async () => {
      const futureVersion = '99:dGVzdA==:dGVzdA=='
      const result = await decryptApiKey(futureVersion)
      
      // 不支持的版本应该返回原始字符串
      expect(result).toBe(futureVersion)
    })
    
    it('应该处理 Unicode 字符', async () => {
      const plaintext = '测试密钥-🔐-key'
      const encrypted = await encryptApiKey(plaintext)
      const decrypted = await decryptApiKey(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })
  })
  
  describe('isEncrypted', () => {
    it('应该识别加密的字符串', async () => {
      const plaintext = 'sk-test-key'
      const encrypted = await encryptApiKey(plaintext)
      
      expect(isEncrypted(encrypted)).toBe(true)
    })
    
    it('应该识别明文字符串', () => {
      expect(isEncrypted('sk-plaintext-key')).toBe(false)
      expect(isEncrypted('random-string')).toBe(false)
      expect(isEncrypted('')).toBe(false)
    })
    
    it('应该识别旧版 Base64 编码', () => {
      const oldEncoded = 'c2stb2xkLWJhc2U2NC1rZXk='
      expect(isEncrypted(oldEncoded)).toBe(false)
    })
    
    it('应该识别损坏的格式', () => {
      expect(isEncrypted('1:only-two-parts')).toBe(false)
      expect(isEncrypted('not:enough:parts:here')).toBe(false)
      expect(isEncrypted('99:iv:ciphertext')).toBe(false)  // 错误版本
    })
  })
  
  describe('端到端测试', () => {
    it('应该完整加密解密流程', async () => {
      const testCases = [
        'sk-test-key-1',
        'sk-another-key-with-longer-text-12345',
        '测试中文密钥',
        'key-with-emoji-🔐-test',
        '',  // 空字符串
      ]
      
      for (const plaintext of testCases) {
        const encrypted = await encryptApiKey(plaintext)
        const decrypted = await decryptApiKey(encrypted)
        expect(decrypted).toBe(plaintext)
      }
    })
    
    it('不同扩展 ID 应该产生不同的密文', async () => {
      const plaintext = 'sk-test-key'
      
      // 第一个扩展
      global.chrome.runtime.id = 'extension-1'
      const encrypted1 = await encryptApiKey(plaintext)
      
      // 第二个扩展
      global.chrome.runtime.id = 'extension-2'
      const encrypted2 = await encryptApiKey(plaintext)
      
      // 密文应该不同（密钥派生不同）
      expect(encrypted1).not.toBe(encrypted2)
      
      // 但各自能解密成功
      global.chrome.runtime.id = 'extension-1'
      expect(await decryptApiKey(encrypted1)).toBe(plaintext)
      
      global.chrome.runtime.id = 'extension-2'
      expect(await decryptApiKey(encrypted2)).toBe(plaintext)
    })
    
    it('应该防止篡改（GCM 认证）', async () => {
      const plaintext = 'sk-test-key'
      const encrypted = await encryptApiKey(plaintext)
      
      // 篡改密文（修改最后几个字符）
      const parts = encrypted.split(':')
      const tamperedCiphertext = parts[2].slice(0, -4) + 'XXXX'
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`
      
      // 解密应该失败，返回原始字符串
      const result = await decryptApiKey(tampered)
      expect(result).toBe(tampered)
      expect(result).not.toBe(plaintext)
    })
  })
})
