import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { Store } from '@tauri-apps/plugin-store'
import MD5 from 'crypto-js/md5.js'

import type { AiConfig, ModelConfig, ModelType } from '@/app/core/setting/config'

const UPGRADE_LINK_CONFIGURATION_KEY = 'Wg_BZFH1WUdx7atKagepXg'
const UPGRADE_LINK_ACCESS_KEY = 'wHi8Tkuc5i6v1UCAuVk48A'
const UPGRADE_LINK_SECRET_KEY = 'eg4upYo7ruJgaDVOtlHJGj4lyzG4Oh9IpLGwOc6Oehw'
const UPGRADE_LINK_UPGRADE_URL = 'https://api.upgrade.toolsetlink.com/v1/configuration/upgrade'
const UPGRADE_LINK_UPGRADE_URI = '/v1/configuration/upgrade'
const INITIAL_NOTEGEN_DEFAULT_MODELS_VERSION_CODE = 1

export const NOTEGEN_DEFAULT_MODELS_CACHE_KEY = 'noteGenDefaultModelsCache'

interface NoteGenDefaultModelsCache {
  versionCode?: number
  versionName?: string
  fetchedAt: string
  content: {
    models: unknown[]
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isModelType(value: unknown): value is ModelType {
  return (
    value === 'chat' ||
    value === 'image' ||
    value === 'video' ||
    value === 'tts' ||
    value === 'stt' ||
    value === 'embedding' ||
    value === 'rerank'
  )
}

function parseContentPayload(payload: unknown) {
  if (!payload) {
    return null
  }

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  if (typeof payload === 'object') {
    return payload
  }

  return null
}

function buildUpgradeLinkSignature({
  body,
  nonce,
  secretKey,
  timestamp,
  uri,
}: {
  body?: string
  nonce: string
  secretKey: string
  timestamp: string
  uri: string
}) {
  const source = body
    ? `body=${body}&nonce=${nonce}&secretKey=${secretKey}&timestamp=${timestamp}&url=${uri}`
    : `nonce=${nonce}&secretKey=${secretKey}&timestamp=${timestamp}&url=${uri}`

  return MD5(source).toString()
}

function buildSignedHeaders(body: string) {
  const timestamp = new Date().toISOString()
  const nonce = crypto.randomUUID()
  const signature = buildUpgradeLinkSignature({
    body,
    nonce,
    secretKey: UPGRADE_LINK_SECRET_KEY,
    timestamp,
    uri: UPGRADE_LINK_UPGRADE_URI,
  })

  return {
    'Content-Type': 'application/json',
    'X-AccessKey': UPGRADE_LINK_ACCESS_KEY,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
  }
}

function normalizeModelItem(item: Record<string, unknown>): ModelConfig | null {
  if (!isNonEmptyString(item.id) || !isNonEmptyString(item.model)) {
    return null
  }

  const modelType = isModelType(item.modelType) ? item.modelType : 'chat'

  return {
    id: item.id.trim(),
    model: item.model.trim(),
    modelType,
    temperature: typeof item.temperature === 'number' ? item.temperature : undefined,
    topP: typeof item.topP === 'number' ? item.topP : undefined,
    voice: isNonEmptyString(item.voice) ? item.voice.trim() : undefined,
    enableStream: typeof item.enableStream === 'boolean' ? item.enableStream : undefined,
  }
}

function normalizeNoteGenDefaultModelsPayload(payload: unknown): ModelConfig[] {
  const parsedPayload = parseContentPayload(payload)
  const payloadObject = parsedPayload && typeof parsedPayload === 'object'
    ? parsedPayload as Record<string, unknown>
    : {}

  if (Array.isArray(payloadObject.models)) {
    return payloadObject.models
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeModelItem)
      .filter((item): item is ModelConfig => !!item)
  }

  const defaultModels = payloadObject.defaultModels
  if (defaultModels && typeof defaultModels === 'object' && !Array.isArray(defaultModels)) {
    return Object.entries(defaultModels as Record<string, unknown>)
      .filter(([, model]) => isNonEmptyString(model))
      .map(([id, model]) => ({
        id,
        model: String(model).trim(),
        modelType: 'chat' as const,
      }))
  }

  return []
}

function mergeNoteGenDefaultModels(config: AiConfig, remoteModels: ModelConfig[]): AiConfig {
  if (!config.models?.length || remoteModels.length === 0) {
    return config
  }

  const remoteModelById = new Map(remoteModels.map((model) => [model.id, model]))

  return {
    ...config,
    models: config.models.map((model) => {
      const remoteModel = remoteModelById.get(model.id)
      if (!remoteModel) {
        return model
      }

      return {
        ...model,
        ...remoteModel,
      }
    }),
  }
}

async function fetchRemoteNoteGenDefaultModels(versionCode?: number | null): Promise<NoteGenDefaultModelsCache | null> {
  const body = JSON.stringify({
    configurationKey: UPGRADE_LINK_CONFIGURATION_KEY,
    versionCode: versionCode || INITIAL_NOTEGEN_DEFAULT_MODELS_VERSION_CODE,
    appointVersionCode: 0,
  })

  const response = await httpFetch(UPGRADE_LINK_UPGRADE_URL, {
    method: 'POST',
    headers: buildSignedHeaders(body),
    body,
  })

  if (!response.ok) {
    throw new Error(`NoteGen default models request failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json() as {
    data?: {
      versionCode?: number
      versionName?: string
      content?: unknown
    }
  }

  const models = normalizeNoteGenDefaultModelsPayload(result?.data?.content)
  if (models.length === 0) {
    return null
  }

  return {
    versionCode: result?.data?.versionCode,
    versionName: result?.data?.versionName,
    fetchedAt: new Date().toISOString(),
    content: {
      models,
    },
  }
}

export async function loadNoteGenDefaultConfig(builtinConfig: AiConfig): Promise<AiConfig> {
  const store = await Store.load('store.json')
  const cached = await store.get<NoteGenDefaultModelsCache>(NOTEGEN_DEFAULT_MODELS_CACHE_KEY)

  try {
    const latest = await fetchRemoteNoteGenDefaultModels(cached?.versionCode)
    if (latest) {
      await store.set(NOTEGEN_DEFAULT_MODELS_CACHE_KEY, latest)
      return mergeNoteGenDefaultModels(builtinConfig, normalizeNoteGenDefaultModelsPayload(latest.content))
    }
  } catch (error) {
    console.error('[notegen-default-models] failed to fetch remote models', error)
  }

  if (cached?.content?.models?.length) {
    return mergeNoteGenDefaultModels(builtinConfig, normalizeNoteGenDefaultModelsPayload(cached.content))
  }

  return builtinConfig
}

export function applyNoteGenDefaultConfig(aiModelList: AiConfig[], noteGenConfig: AiConfig): AiConfig[] {
  const hasNoteGenConfig = aiModelList.some((config) => config.key === noteGenConfig.key)

  if (!hasNoteGenConfig) {
    return [...aiModelList, noteGenConfig]
  }

  return aiModelList.map((config) => {
    if (config.key !== noteGenConfig.key) {
      return config
    }

    return {
      ...config,
      ...noteGenConfig,
      models: noteGenConfig.models,
    }
  })
}
