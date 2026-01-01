import { useState, useCallback, useRef } from 'react'
import { fetchCompletion } from '@/lib/ai/completion'

interface UseAiCompletionOptions {
  onAccept?: (completion: string) => void
  onCancel?: () => void
}

export function useAiCompletion(options: UseAiCompletionOptions = {}) {
  const [completion, setCompletion] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const completionRef = useRef<string>('') // 用 ref 存储最新的 completion 值

  // 生成补全内容
  const generateCompletion = useCallback(async (fullContent: string, cursorPosition: number) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 提取光标附近的上下文（前 300 字符）
    const contextStart = Math.max(0, cursorPosition - 300)
    const context = fullContent.substring(contextStart, cursorPosition)
    
    // 如果上下文太短，不生成补全
    if (context.trim().length < 10) {
      console.log('[useAiCompletion] Context too short, skipping')
      return
    }

    console.log('[useAiCompletion] Generating completion with context length:', context.length)
    setIsLoading(true)
    abortControllerRef.current = new AbortController()

    try {
      const result = await fetchCompletion(context, abortControllerRef.current.signal)
      
      if (result) {
        console.log('[useAiCompletion] Generated completion:', result.substring(0, 100))
        completionRef.current = result
        setCompletion(result)
      } else {
        console.log('[useAiCompletion] No completion generated')
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useAiCompletion] Error:', error)
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  // 接受补全
  const acceptCompletion = useCallback(() => {
    const currentCompletion = completionRef.current
    console.log('[useAiCompletion] acceptCompletion called, completion:', currentCompletion)
    if (currentCompletion) {
      console.log('[useAiCompletion] Calling onAccept with:', currentCompletion.substring(0, 50))
      
      // 先清除预览元素
      const previews = document.querySelectorAll('.ai-completion-preview')
      previews.forEach(preview => preview.remove())
      
      options.onAccept?.(currentCompletion)
      completionRef.current = ''
      setCompletion('')
    } else {
      console.log('[useAiCompletion] No completion to accept')
    }
  }, [options])

  // 取消补全
  const cancelCompletion = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // 清除预览元素
    const previews = document.querySelectorAll('.ai-completion-preview')
    previews.forEach(preview => preview.remove())
    
    completionRef.current = ''
    setCompletion('')
    setIsLoading(false)
    options.onCancel?.()
  }, [options])

  return {
    completion,
    isLoading,
    generateCompletion,
    acceptCompletion,
    cancelCompletion,
  }
}
