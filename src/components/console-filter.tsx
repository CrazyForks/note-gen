'use client'

import { useEffect } from 'react'

function shouldFilterConsoleMessage(args: unknown[]) {
  const message = args.map((arg) => String(arg)).join(' ')

  if (message.includes('flushSync')) {
    return true
  }

  return (
    message.includes("[TAURI] Couldn't find callback id") &&
    message.includes('app is reloaded while Rust is running an asynchronous operation')
  )
}

export function ConsoleFilter() {
  useEffect(() => {
    const originalError = console.error
    const originalWarn = console.warn

    console.error = (...args: unknown[]) => {
      if (shouldFilterConsoleMessage(args)) {
        return
      }
      originalError.apply(console, args)
    }

    console.warn = (...args: unknown[]) => {
      if (shouldFilterConsoleMessage(args)) {
        return
      }
      originalWarn.apply(console, args)
    }

    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  return null
}
