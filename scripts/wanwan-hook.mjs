#!/usr/bin/env node
/**
 * wanwan-hook.mjs
 * Claude Code Hook relay for WanWan-chan desktop companion.
 * Listens to Claude Code lifecycle events from stdin and sends JSON to WanWan-chan (port 3721).
 *
 * Designed to be strictly non-blocking: exits 0 immediately on any timeout or network error.
 */

import http from 'node:http'

const eventArg = process.argv[2]
const WANWAN_PORT = parseInt(process.env.WANWAN_PORT || '3721', 10)

// Fast fail-safe: Claude Code must never wait more than 300ms for a hook
const failSafeTimer = setTimeout(() => {
  process.exit(0)
}, 300)

let input = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})

process.stdin.on('error', () => {
  clearTimeout(failSafeTimer)
  process.exit(0)
})

process.stdin.on('end', () => {
  let parsed = {}
  try {
    if (input.trim()) {
      parsed = JSON.parse(input)
    }
  } catch {
    // Malformed input or empty stdin, proceed with eventArg
  }

  const event = parsed.hook_event_name || eventArg || 'unknown'

  let status = 'thinking'
  let message = undefined
  let tool = undefined

  switch (event) {
    case 'UserPromptSubmit': {
      status = 'thinking'
      const prompt = parsed.prompt || parsed.user_prompt
      if (typeof prompt === 'string' && prompt.trim()) {
        const clean = prompt.replace(/\s+/g, ' ').trim()
        message = `Thinking: ${clean.slice(0, 32)}${clean.length > 32 ? '...' : ''}`
      } else {
        message = 'Thinking...'
      }
      break
    }

    case 'PreToolUse': {
      status = 'thinking'
      tool = parsed.tool_name || parsed.tool
      if (typeof tool === 'string') {
        const toolInput = parsed.tool_input || parsed.input || {}
        if (tool === 'Bash' && toolInput.command) {
          const cmd = String(toolInput.command).replace(/\s+/g, ' ').trim()
          message = `Bash: ${cmd.slice(0, 24)}${cmd.length > 24 ? '...' : ''}`
        } else if ((tool === 'FileEdit' || tool === 'Edit' || tool === 'Write') && toolInput.file_path) {
          const filename = String(toolInput.file_path).split('/').pop() || 'file'
          message = `Edit: ${filename}`
        } else if (tool === 'Glob' || tool === 'Grep') {
          message = `Searching: ${tool}`
        } else {
          message = `Using: ${tool}`
        }
      }
      break
    }

    case 'PermissionRequest': {
      status = 'approval'
      const reqTool = parsed.tool_name || parsed.tool
      message = reqTool ? `Approval: ${reqTool} ⚠️` : 'Approval required in terminal! ⚠️'
      break
    }

    case 'Stop': {
      status = 'done'
      message = 'Task completed! 🎉'
      break
    }

    case 'StopFailure':
    case 'PostToolUseFailure': {
      status = 'error'
      message = 'Agent error encountered! ❌'
      break
    }

    case 'SessionEnd': {
      status = 'idle'
      message = undefined
      break
    }

    default: {
      status = 'thinking'
      break
    }
  }

  const payload = JSON.stringify({
    status,
    agent: 'claude-code',
    tool,
    message,
    event,
  })

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: WANWAN_PORT,
      path: '/agent/status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 250,
    },
    (res) => {
      res.resume()
      clearTimeout(failSafeTimer)
      process.exit(0)
    },
  )

  req.on('timeout', () => {
    req.destroy()
    clearTimeout(failSafeTimer)
    process.exit(0)
  })

  req.on('error', () => {
    clearTimeout(failSafeTimer)
    process.exit(0)
  })

  req.write(payload)
  req.end()
})
