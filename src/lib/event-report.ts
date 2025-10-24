/**
 * 事件上报工具函数
 * 用于向 toolsetlink API 上报应用事件
 */

import CryptoJS from 'crypto-js'
import { arch, platform } from '@tauri-apps/plugin-os'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

// 配置常量
const API_CONFIG = {
  baseURL: 'https://api.upgrade.toolsetlink.com',
  accessKey: 'wHi8Tkuc5i6v1UCAuVk48A',
  secretKey: 'eg4upYo7ruJgaDVOtlHJGj4lyzG4Oh9IpLGwOc6Oehw',
  appKey: 'tyEi-iLVFxnRhGc9c_xApw',
}

// 事件类型枚举
export enum EventType {
  APP_START = 'app_start',
  APP_UPGRADE_DOWNLOAD = 'app_upgrade_download',
  APP_UPGRADE_UPGRADE = 'app_upgrade_upgrade',
}

// 事件数据接口
export interface AppStartEventData {
  launchTime: string // RFC3339格式
  versionCode: number
  devModelKey?: string
  devKey?: string
  target?: string
  arch?: string
}

export interface AppUpgradeDownloadEventData {
  downloadVersionCode: number
  code: number // 0: 成功, 1: 失败
  versionCode: number
  devModelKey?: string
  devKey?: string
  target?: string
  arch?: string
}

export interface AppUpgradeUpgradeEventData {
  upgradeVersionCode: number
  code: number // 0: 成功, 1: 失败
  versionCode: number
  devModelKey?: string
  devKey?: string
  target?: string
  arch?: string
}

export type EventData = AppStartEventData | AppUpgradeDownloadEventData | AppUpgradeUpgradeEventData

// 请求体接口
interface ReportRequestBody {
  eventType: EventType
  appKey: string
  timestamp: string
  eventData: EventData
}

/**
 * 生成 RFC3339 格式的时间戳
 * 使用 UTC 时间，避免时区问题
 */
function generateRFC3339Timestamp(): string {
  const now = new Date()
  return now.toISOString()
}

/**
 * 生成随机 Nonce（至少16位）
 */
function generateNonce(): string {
  return Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

/**
 * 生成请求签名
 * 签名规则：MD5(body=${body}&nonce=${nonce}&secretKey=${secretKey}&timestamp=${timestamp}&url=${url})
 */
function generateSignature(
  body: string,
  nonce: string,
  timestamp: string,
  url: string,
  secretKey: string
): string {
  const signStr = `body=${body}&nonce=${nonce}&secretKey=${secretKey}&timestamp=${timestamp}&url=${url}`
  return CryptoJS.MD5(signStr).toString()
}

/**
 * 获取当前应用版本号
 * 从 tauri.conf.json 的 version 字段读取，例如 "0.22.2" -> 22
 */
async function getVersionCode(): Promise<number> {
  try {
    // 从环境变量或默认值获取版本号
    // 在构建时，可以通过环境变量注入版本号
    const version = '0.22.2' // 与 tauri.conf.json 保持一致
    const versionParts = version.split('.')
    // 使用中间的版本号作为 versionCode
    return parseInt(versionParts[1] || '1', 10)
  } catch (error) {
    console.error('Failed to get version code:', error)
    return 1
  }
}

/**
 * 获取设备信息
 */
async function getDeviceInfo() {
  try {
    const targetPlatform = await platform()
    const archInfo = await arch()
    
    return {
      target: targetPlatform,
      arch: archInfo,
    }
  } catch (error) {
    console.error('Failed to get device info:', error)
    return {
      target: undefined,
      arch: undefined,
    }
  }
}

/**
 * 上报事件
 */
export async function reportEvent(
  eventType: EventType,
  eventData: EventData
): Promise<boolean> {
  try {
    const timestamp = generateRFC3339Timestamp()
    const nonce = generateNonce()
    const url = '/v1/app/report'
    
    const requestBody: ReportRequestBody = {
      eventType,
      appKey: API_CONFIG.appKey,
      timestamp,
      eventData,
    }
    
    const bodyString = JSON.stringify(requestBody)
    const signature = generateSignature(
      bodyString,
      nonce,
      timestamp,
      url,
      API_CONFIG.secretKey
    )
    
    const response = await tauriFetch(`${API_CONFIG.baseURL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-AccessKey': API_CONFIG.accessKey,
        'X-Signature': signature,
      },
      body: bodyString,
    })
    
    const result = await response.json()

    if (response.ok && result.code === 0) {
      console.log('Event reported successfully:', eventType)
      return true
    } else {
      console.error('Failed to report event:', result)
      return false
    }
  } catch (error) {
    console.error('Error reporting event:', error)
    return false
  }
}

/**
 * 上报应用启动事件
 */
export async function reportAppStart(): Promise<boolean> {
  try {
    const versionCode = await getVersionCode()
    const deviceInfo = await getDeviceInfo()
    const launchTime = generateRFC3339Timestamp()
    
    const eventData: AppStartEventData = {
      launchTime,
      versionCode,
      target: deviceInfo.target,
      arch: deviceInfo.arch,
    }
    
    return await reportEvent(EventType.APP_START, eventData)
  } catch (error) {
    console.error('Failed to report app start:', error)
    return false
  }
}

/**
 * 上报应用升级下载事件
 */
export async function reportAppUpgradeDownload(
  downloadVersionCode: number,
  code: number
): Promise<boolean> {
  try {
    const versionCode = await getVersionCode()
    const deviceInfo = await getDeviceInfo()
    
    const eventData: AppUpgradeDownloadEventData = {
      downloadVersionCode,
      code,
      versionCode,
      target: deviceInfo.target,
      arch: deviceInfo.arch,
    }
    
    return await reportEvent(EventType.APP_UPGRADE_DOWNLOAD, eventData)
  } catch (error) {
    console.error('Failed to report app upgrade download:', error)
    return false
  }
}

/**
 * 上报应用升级事件
 */
export async function reportAppUpgradeUpgrade(
  upgradeVersionCode: number,
  code: number
): Promise<boolean> {
  try {
    const versionCode = await getVersionCode()
    const deviceInfo = await getDeviceInfo()
    
    const eventData: AppUpgradeUpgradeEventData = {
      upgradeVersionCode,
      code,
      versionCode,
      target: deviceInfo.target,
      arch: deviceInfo.arch,
    }
    
    return await reportEvent(EventType.APP_UPGRADE_UPGRADE, eventData)
  } catch (error) {
    console.error('Failed to report app upgrade:', error)
    return false
  }
}
