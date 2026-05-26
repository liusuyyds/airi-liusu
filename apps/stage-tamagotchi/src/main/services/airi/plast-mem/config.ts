import type {
  ElectronPlastMemApplyConfigPayload,
  ElectronPlastMemConfig,
} from '../../../../shared/eventa'

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { env } from 'node:process'

import { boolean, number, object, optional, string } from 'valibot'

import {
  defaultElectronPlastMemConfig,
} from '../../../../shared/eventa'
import { createConfig } from '../../../libs/electron/persistence'

const plastMemConfigSchema = object({
  autoStart: boolean(),
  baseUrl: string(),
  category: string(),
  conversationId: string(),
  databaseUrl: string(),
  enabled: boolean(),
  enableChatIngest: optional(boolean()),
  enableChatRetrieve: optional(boolean()),
  enableContextPreRetrieve: optional(boolean()),
  enableRecentMemory: optional(boolean()),
  episodicLimit: number(),
  maxContextCharacters: number(),
  openaiApiKey: string(),
  openaiBaseUrl: string(),
  openaiChatApiKey: optional(string()),
  openaiChatBaseUrl: optional(string()),
  openaiChatMaxTokens: number(),
  openaiChatModel: string(),
  openaiEmbeddingApiKey: optional(string()),
  openaiEmbeddingBaseUrl: optional(string()),
  openaiEmbeddingModel: string(),
  openaiRequestTimeoutSeconds: number(),
  reviewWindowHours: number(),
  requestTimeoutMsec: number(),
  semanticLimit: number(),
  workspaceKey: string(),
})

const plastMemConfigStore = createConfig('plast-mem', 'options.json', plastMemConfigSchema, {
  autoHeal: true,
  default: defaultElectronPlastMemConfig,
})

let configSetupDone = false
let userConfigAvailable = false

function asString(value: unknown, fallback: string) {
  if (typeof value !== 'string')
    return fallback

  return value.trim()
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asPositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback

  const integer = Math.trunc(value)
  return integer > 0 ? integer : fallback
}

function normalizeConfig(
  payload: ElectronPlastMemApplyConfigPayload | ElectronPlastMemConfig,
  fallback: ElectronPlastMemConfig,
): ElectronPlastMemConfig {
  return {
    autoStart: asBoolean(payload.autoStart, fallback.autoStart),
    baseUrl: asString(payload.baseUrl, fallback.baseUrl),
    category: asString(payload.category, fallback.category),
    conversationId: asString(payload.conversationId, fallback.conversationId),
    databaseUrl: asString(payload.databaseUrl, fallback.databaseUrl),
    enabled: asBoolean(payload.enabled, fallback.enabled),
    enableChatIngest: asBoolean(payload.enableChatIngest, fallback.enableChatIngest),
    enableChatRetrieve: asBoolean(payload.enableChatRetrieve, fallback.enableChatRetrieve),
    enableContextPreRetrieve: asBoolean(payload.enableContextPreRetrieve, fallback.enableContextPreRetrieve),
    enableRecentMemory: asBoolean(payload.enableRecentMemory, fallback.enableRecentMemory),
    episodicLimit: asPositiveInteger(payload.episodicLimit, fallback.episodicLimit),
    maxContextCharacters: asPositiveInteger(payload.maxContextCharacters, fallback.maxContextCharacters),
    openaiApiKey: asString(payload.openaiApiKey, fallback.openaiApiKey),
    openaiBaseUrl: asString(payload.openaiBaseUrl, fallback.openaiBaseUrl),
    openaiChatApiKey: asString(payload.openaiChatApiKey, fallback.openaiChatApiKey),
    openaiChatBaseUrl: asString(payload.openaiChatBaseUrl, fallback.openaiChatBaseUrl),
    openaiChatMaxTokens: asPositiveInteger(payload.openaiChatMaxTokens, fallback.openaiChatMaxTokens),
    openaiChatModel: asString(payload.openaiChatModel, fallback.openaiChatModel),
    openaiEmbeddingApiKey: asString(payload.openaiEmbeddingApiKey, fallback.openaiEmbeddingApiKey),
    openaiEmbeddingBaseUrl: asString(payload.openaiEmbeddingBaseUrl, fallback.openaiEmbeddingBaseUrl),
    openaiEmbeddingModel: asString(payload.openaiEmbeddingModel, fallback.openaiEmbeddingModel),
    openaiRequestTimeoutSeconds: asPositiveInteger(payload.openaiRequestTimeoutSeconds, fallback.openaiRequestTimeoutSeconds),
    reviewWindowHours: asPositiveInteger(payload.reviewWindowHours, fallback.reviewWindowHours),
    requestTimeoutMsec: asPositiveInteger(payload.requestTimeoutMsec, fallback.requestTimeoutMsec),
    semanticLimit: asPositiveInteger(payload.semanticLimit, fallback.semanticLimit),
    workspaceKey: asString(payload.workspaceKey, fallback.workspaceKey),
  }
}

function localDevConfigSnapshotPath() {
  const repoRoot = env.AIRI_REPO_ROOT?.trim()
  if (!repoRoot)
    return undefined

  return resolve(repoRoot, '.cache', 'plast-mem-ui-config.json')
}

async function writeLocalDevConfigSnapshot(config: ElectronPlastMemConfig) {
  const path = localDevConfigSnapshotPath()
  if (!path)
    return

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({
    config,
    updatedAt: Date.now(),
    version: 1,
  }, null, 2)}\n`, 'utf-8')
}

export function setupPlastMemConfig() {
  if (configSetupDone)
    return

  try {
    const diagnostics = plastMemConfigStore.setup()
    userConfigAvailable = diagnostics.status !== 'missing'
  }
  catch (error) {
    console.warn('[plast-mem] Failed to load UI config; using environment fallback', error)
    userConfigAvailable = false
  }
  configSetupDone = true
}

export function hasUserPlastMemConfig() {
  setupPlastMemConfig()
  return userConfigAvailable
}

export function getPlastMemConfig() {
  setupPlastMemConfig()
  return normalizeConfig(plastMemConfigStore.get() ?? defaultElectronPlastMemConfig, defaultElectronPlastMemConfig)
}

export async function applyPlastMemConfig(payload: ElectronPlastMemApplyConfigPayload) {
  setupPlastMemConfig()
  const next = normalizeConfig(payload, getPlastMemConfig())
  plastMemConfigStore.update(next)
  userConfigAvailable = true
  await writeLocalDevConfigSnapshot(next)
  return next
}
