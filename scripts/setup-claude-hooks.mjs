#!/usr/bin/env node
/**
 * setup-claude-hooks.mjs
 * Automatically configures ~/.claude/settings.json to integrate Claude Code with WanWan-chan.
 *
 * Usage:
 *   node scripts/setup-claude-hooks.mjs            # Install hooks
 *   node scripts/setup-claude-hooks.mjs --uninstall# Remove WanWan-chan hooks
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const isUninstall = process.argv.includes('--uninstall')
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const hookScriptPath = path.resolve(currentDir, 'wanwan-hook.mjs')

const homeDir = os.homedir()
const claudeDir = path.join(homeDir, '.claude')
const settingsPath = path.join(claudeDir, 'settings.json')

const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Stop',
  'SessionEnd',
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadSettings() {
  if (!fs.existsSync(settingsPath)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch (err) {
    console.error(`Failed to parse ${settingsPath}:`, err.message)
    process.exit(1)
  }
}

function backupSettings() {
  if (fs.existsSync(settingsPath)) {
    const backupPath = `${settingsPath}.backup.${Date.now()}`
    fs.copyFileSync(settingsPath, backupPath)
    console.log(`Backed up existing settings to: ${backupPath}`)
  }
}

function saveSettings(settings) {
  ensureDir(claudeDir)
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
}

function isWanwanHook(commandStr) {
  if (typeof commandStr !== 'string') return false
  return commandStr.includes('wanwan-hook')
}

function uninstall() {
  const settings = loadSettings()
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    console.log('No Claude Code hooks found to uninstall.')
    return
  }

  backupSettings()
  let removedCount = 0

  for (const event of HOOK_EVENTS) {
    if (Array.isArray(settings.hooks[event])) {
      const initialLength = settings.hooks[event].length
      settings.hooks[event] = settings.hooks[event].filter((group) => {
        if (Array.isArray(group.hooks)) {
          return !group.hooks.some((h) => isWanwanHook(h?.command))
        }
        return !isWanwanHook(group?.command)
      })
      removedCount += initialLength - settings.hooks[event].length
      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event]
      }
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks
  }

  saveSettings(settings)
  console.log(`Uninstalled ${removedCount} WanWan-chan hook entries from ${settingsPath}.`)
}

function install() {
  const settings = loadSettings()
  backupSettings()

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {}
  }

  let addedCount = 0

  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = []
    }

    const command = `node "${hookScriptPath}" ${event}`

    // Check if already present
    const alreadyExists = settings.hooks[event].some((group) => {
      if (Array.isArray(group.hooks)) {
        return group.hooks.some((h) => isWanwanHook(h?.command))
      }
      return isWanwanHook(group?.command)
    })

    if (!alreadyExists) {
      settings.hooks[event].push({
        hooks: [
          {
            type: 'command',
            command,
          },
        ],
      })
      addedCount++
    }
  }

  saveSettings(settings)
  console.log(`\nWanWan-chan Claude Code Hooks installed successfully!`)
  console.log(`- Config file: ${settingsPath}`)
  console.log(`- Relay script: ${hookScriptPath}`)
  console.log(`- Hook events registered: ${HOOK_EVENTS.join(', ')} (${addedCount} new)`)
  console.log(`\nNow whenever you run Claude Code in your terminal, Agumon will react in real time!`)
}

if (isUninstall) {
  uninstall()
} else {
  install()
}
