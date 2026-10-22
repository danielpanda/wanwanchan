import assert from 'node:assert/strict'
import { request } from 'node:http'
import { test } from 'node:test'
import { parseAgentStatus, startAiServer } from './ai-server.ts'

test('parseAgentStatus validates allowed statuses', () => {
  assert.equal(parseAgentStatus('thinking'), 'thinking')
  assert.equal(parseAgentStatus('done'), 'done')
  assert.equal(parseAgentStatus('idle'), 'idle')
  assert.equal(parseAgentStatus('approval'), 'approval')
  assert.equal(parseAgentStatus('error'), 'error')
  assert.equal(parseAgentStatus('PermissionRequest'), 'approval')
  assert.equal(parseAgentStatus('UserPromptSubmit'), 'thinking')
  assert.equal(parseAgentStatus('StopFailure'), 'error')
  assert.equal(parseAgentStatus('invalid'), 'idle')
  assert.equal(parseAgentStatus(null), 'idle')
})

test('startAiServer handles GET and POST requests', async () => {
  const mockWin = {
    isDestroyed: () => false,
    webContents: {
      send: (_channel: string, _data: unknown) => {},
    },
  } as unknown as import('electron').BrowserWindow

  const testPort = 13721
  const serverInst = startAiServer(testPort, () => mockWin)

  try {
    // Test GET /agent/status
    const getRes = await new Promise<{ ok: boolean; currentStatus: string }>((resolve, reject) => {
      request(`http://127.0.0.1:${testPort}/agent/status`, (res) => {
        let data = ''
        res.on('data', (c) => {
          data += c
        })
        res.on('end', () => resolve(JSON.parse(data)))
      })
        .on('error', reject)
        .end()
    })
    assert.equal(getRes.ok, true)
    assert.equal(getRes.currentStatus, 'idle')

    // Test POST /agent/status with thinking
    const postRes = await new Promise<{ ok: boolean; payload: { status: string } }>((resolve, reject) => {
      const req = request(
        `http://127.0.0.1:${testPort}/agent/status`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let data = ''
          res.on('data', (c) => {
            data += c
          })
          res.on('end', () => resolve(JSON.parse(data)))
        },
      )
      req.on('error', reject)
      req.write(JSON.stringify({ status: 'thinking', agent: 'claude-code' }))
      req.end()
    })
    assert.equal(postRes.ok, true)
    assert.equal(postRes.payload.status, 'thinking')
    assert.equal(serverInst.getState().currentStatus, 'thinking')

    // Test POST /agent/status with approval
    const postApprovalRes = await new Promise<{ ok: boolean; payload: { status: string; message: string } }>((resolve, reject) => {
      const req = request(
        `http://127.0.0.1:${testPort}/agent/status`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let data = ''
          res.on('data', (c) => {
            data += c
          })
          res.on('end', () => resolve(JSON.parse(data)))
        },
      )
      req.on('error', reject)
      req.write(JSON.stringify({ hook_event_name: 'PermissionRequest' }))
      req.end()
    })
    assert.equal(postApprovalRes.ok, true)
    assert.equal(postApprovalRes.payload.status, 'approval')
    assert.equal(serverInst.getState().currentStatus, 'approval')
  } finally {
    serverInst.stop()
  }
})
