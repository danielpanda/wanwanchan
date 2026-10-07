// Local HTTP webhook server for AI Agent integration (Claude Code, Antigravity, Aider, etc.)
// Listens on 127.0.0.1:3721 (configurable) for POST /agent/status
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { BrowserWindow } from 'electron'
import { AI_STATUS_CHANNEL } from './companion-channels.ts'

export type AgentStatus = 'idle' | 'thinking' | 'done'

export interface AgentPayload {
  status: AgentStatus
  agent?: string
  message?: string
}

export interface AiServerState {
  currentStatus: AgentStatus
  currentAgent: string
  lastUpdated: number
}

export function parseAgentStatus(raw: unknown): AgentStatus {
  if (raw === 'thinking' || raw === 'done' || raw === 'idle') return raw
  return 'idle'
}

export function startAiServer(
  port: number,
  getWin: () => BrowserWindow | null,
): { server: Server; getState: () => AiServerState; stop: () => void } {
  const state: AiServerState = {
    currentStatus: 'idle',
    currentAgent: 'unknown',
    lastUpdated: Date.now(),
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for local tools
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = req.url || '/'
    const isStatusEndpoint = url === '/agent/status' || url === '/status' || url === '/api/status'

    if (req.method === 'GET' && isStatusEndpoint) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ...state }))
      return
    }

    if (req.method === 'POST' && isStatusEndpoint) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 1e5) {
          req.destroy() // Drop floods
        }
      })

      req.on('end', () => {
        try {
          const parsed = (body ? JSON.parse(body) : {}) as Record<string, unknown>
          const nextStatus = parseAgentStatus(parsed.status)
          const agent = typeof parsed.agent === 'string' ? parsed.agent.trim() : state.currentAgent
          const message = typeof parsed.message === 'string' ? parsed.message.trim() : undefined

          state.currentStatus = nextStatus
          state.currentAgent = agent
          state.lastUpdated = Date.now()

          const payload: AgentPayload = { status: nextStatus, agent, message }
          const win = getWin()
          if (win && !win.isDestroyed()) {
            win.webContents.send(AI_STATUS_CHANNEL, payload)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, payload }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }))
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }))
  })

  server.on('error', (err) => {
    console.error(`[wanwan] AI Server error on port ${port}:`, err.message)
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`[wanwan] AI Agent webhook listening on http://127.0.0.1:${port}/agent/status`)
  })

  return {
    server,
    getState: () => ({ ...state }),
    stop: () => {
      server.close()
    },
  }
}
