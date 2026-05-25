import type { ChatSyncWindowRole } from './chat-sync-lifecycle'

import { usePlastMemChatMemoryStore } from './plast-mem-chat-memory'

/**
 * Owns Plast Mem chat-memory hooks for the renderer that executes chat turns.
 *
 * Use when:
 * - The Electron renderer root wires chat-sync and Plast Mem together
 * - Only the chat-sync authority window should register recall and ingest hooks
 *
 * Expects:
 * - `chatSyncRole` comes from the initial chat-sync window lifecycle
 *
 * Returns:
 * - A lifecycle handle that initializes/disposes hooks only for authority windows
 */
export function createPlastMemChatMemoryWindowLifecycle(chatSyncRole: ChatSyncWindowRole | null) {
  const plastMemChatMemoryStore = usePlastMemChatMemoryStore()
  const ownsBridge = chatSyncRole === 'authority'

  return {
    ownsBridge,
    async initialize() {
      if (ownsBridge)
        await plastMemChatMemoryStore.initialize()
    },
    dispose() {
      if (ownsBridge)
        plastMemChatMemoryStore.dispose()
    },
  }
}
