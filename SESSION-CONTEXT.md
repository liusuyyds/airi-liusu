# 会话上下文 — 2026-05-09

## 变更摘要

### 1. MCP 返回结果去重
- **文件**: `packages/stage-ui/src/tools/mcp.ts`
- **问题**: MCP 同时返回 `content` 和 `structuredContent`，xsAI 的 `wrapToolResult` 将整个对象 JSON.stringify，导致 LLM 上下文中同一内容存了两遍
- **修复**: 返回前根据哪个字段有实质数据来清空另一个，只保留一份内容
- **提交**: `e16222f`

### 2. 级联删除工具消息
- **新增**: `packages/stage-ui/src/utils/delete-message.ts` — `deleteMessageWithToolCascade()` 工具函数
- **修改**: `packages/stage-ui/src/utils/index.ts` — 导出新函数
- **修改**: `packages/stage-layouts/src/components/Layouts/InteractiveArea.vue` — stage-web 桌面端使用新函数
- **修改**: `packages/stage-layouts/src/components/Layouts/MobileInteractiveArea.vue` — 移动端使用新函数
- **修改**: `apps/stage-tamagotchi/src/renderer/stores/chat-sync.ts` — Electron 端 `executeDeleteMessage` 使用新函数
- **问题**: 删除 assistant 消息时，后面的 `role: 'tool'` 消息（MCP 调用结果）没被一起删除，残留上下文
- **修复**: 收集被删消息的 `tool_call.id`，过滤掉所有匹配的 tool 消息
- **提交**: `28e238b`

### 3. 聊天 UI 性能优化（5 项）
| 改动 | 影响 | 文件 |
|------|------|------|
| 移除 `v-auto-animate` | 消除 O(N) FLIP 布局读取 | `packages/stage-ui/src/components/scenarios/chat/components/history.vue` |
| `streamingMessage` 改 `shallowRef` | 消除深度响应式代理 | `packages/stage-ui/src/stores/chat/stream-store.ts` |
| 浅拷贝替代 `structuredClone` | 避免 O(msg_size) 深拷贝 | `packages/stage-ui/src/stores/chat.ts` (`cloneStreamingMessage`) |
| `renderMessages` 只查最后一条 | O(1) 替代 O(N) `.some()` | `history.vue` |
| per-session debounce persist | 每轮约 5 次写入 → 1 次 | `packages/stage-ui/src/stores/chat/session-store.ts` |
- **提交**: `6c2723b`

### 4. 合并上游 (origin/main)
- **上游 13 个新提交**: cloud sync、admin API、server otel、chat sync 等
- **冲突解决**:
  - `chat.ts`: 保留我们的 tool_calls 清理 + 浅拷贝 + MCP 工具结果处理，集成上游 cloud sync push（`isCloudSyncableMessage` + `pushMessageToCloud`）
  - `session-store.ts`: 保留我们的 per-session debounce（`persistTimers` Map + `PERSIST_DEBOUNCE_MS`）+ `flushPersist`，集成上游 cloud sync session 管理（WS client、reconcile、outbox 等）
- **上游新增**: `@proj-airi/server-sdk-shared` 依赖，`pnpm install` 后 typecheck 通过
- **合并提交**: `50565e3`

### 5. 聊天 UI 性能优化（续）— Observer 爆炸
- **文件**:
  - `packages/stage-ui/src/components/scenarios/chat/components/action-menu/index.vue`
  - `packages/stage-ui/src/components/scenarios/chat/composables/use-chat-history-scroll.ts`
- **问题 1**: 每条消息的 `ChatActionMenu` 独立创建 6+ 个 Observer/监听器（2×IntersectionObserver + 1×ResizeObserver + 2×useElementBounding + 1×window resize）。200 条消息 = **1200+ Observer**，scroll/resize 事件导致级联更新，整个窗口卡顿
- **修复 1**: 移除 `useElementScroll` 和 `useElementVisibility`，改用纯 CSS 定位（`top-1/2 -translate-y-1/2`），从每消息 6+ Observer 降到 0
- **问题 2**: `findMessageElementByKey` 使用 `querySelectorAll` 遍历所有消息元素再逐个匹配，O(N)
- **修复 2**: 改用 `querySelector` 直接定位，O(1)
- **备注**: 滚动卡顿仍有残余，主因是 MarkdownRenderer ×200+（每条消息一套 unified + Shiki + DOMPurify），待后续优化

### 6. MCP 工具结果批量追加 — 40 次调用卡顿
- **文件**:
  - `packages/stage-ui/src/stores/chat/session-store.ts`
  - `packages/stage-ui/src/stores/chat.ts`
- **问题**: 4 条消息 + 40 次 MCP 调用时，`appendSessionMessage` 被调用 41 次（1 assistant + 40 tool），每次 `[...existing, new]` 扩展整个数组。`JSON.stringify + sanitizeToolContent` 重复计算 2 遍（persist + hook callback）= 80 次序列化
- **修复**:
  - 新增 `appendSessionMessages(sessionId, messages[])` API，批量追加，单次数组扩展
  - `chat.ts` 中先计算 `sanitizedToolMessages` 一次，然后 `appendSessionMessages(sessionId, [finalAssistant, ...sanitizedToolMessages])`
  - hook callback 复用已计算的 `sanitizedToolMessages`，避免第二次 JSON.stringify + sanitize
- **效果**: 41 次数组扩展 → 1 次；80 次序列化 → 40 次

## Git 状态
```
50565e3 Merge branch 'main' of https://github.com/moeru-ai/airi
6c2723b perf(stage-ui): reduce chat UI lag in long conversations
28e238b fix(stage-ui): cascade-delete tool messages when removing assistant message
e16222f fix(stage-ui): deduplicate MCP tool result content and structuredContent

# 未提交（本次会话）
M packages/stage-ui/src/components/scenarios/chat/components/action-menu/index.vue
M packages/stage-ui/src/components/scenarios/chat/composables/use-chat-history-scroll.ts
M packages/stage-ui/src/stores/chat.ts
M packages/stage-ui/src/stores/chat/session-store.ts
```

## 验证状态
- `pnpm -F @proj-airi/stage-ui typecheck` ✅
- `pnpm -F @proj-airi/stage-tamagotchi typecheck` ✅
- `pnpm -F @proj-airi/stage-layouts typecheck` ✅
- `pnpm -F @proj-airi/stage-web typecheck` ✅
- `pnpm lint` — 无新增错误
- lint hook（nano-staged）已通过

## 待优化（按性价比排序）
1. **MarkdownRenderer 内容缓存** — 已渲染的消息跳过 re-parse，效果明显，改动小
2. **ChatActionMenu 按需挂载** — 不可见消息不渲染 menu DOM（减小 DOM 树体积）
3. **虚拟滚动** — 只渲染视口附近的 ~20 条消息，终极方案，但改动最大

## 待观察
- `v-auto-animate` 移除后新消息没有入场动画，如需要可后续加轻量 CSS transition 替代
- 400 Model does not exist 错误是 SiliconFlow API 模型名配置问题，非代码 bug
- MCP 持久化记忆（Nocturne Memory 服务端）不在 AIRI 范围内，清空对话不会清理外部 MCP 服务端的数据
- ChatActionMenu 定位从精确计算改为 CSS center，超长消息的按钮位置可能需要微调
