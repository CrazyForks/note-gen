import { Tool, ToolResult } from '../types'
import { readTextFile, writeTextFile, remove, rename, copyFile } from '@tauri-apps/plugin-fs'
import { getAllMarkdownFiles, MarkdownFile } from '@/lib/files'
import { getFilePathOptions } from '@/lib/workspace'
import useArticleStore from '@/stores/article'
import useChatStore from '@/stores/chat'
import { isLinkedFolder } from '@/lib/files'

export const listMarkdownFilesTool: Tool = {
  name: 'list_markdown_files',
  description: '列出所有 Markdown 笔记文件',
  category: 'note',
  requiresConfirmation: false,
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const files = await getAllMarkdownFiles()

      return {
        success: true,
        data: files,
        message: `找到 ${files.length} 个 Markdown 文件`,
      }
    } catch (error) {
      console.error('[list_markdown_files] 获取文件列表失败', {
        error: String(error),
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `获取 Markdown 文件列表失败: ${error}`,
      }
    }
  },
}

export const readMarkdownFileTool: Tool = {
  name: 'read_markdown_file',
  description: '读取指定 Markdown 笔记文件的内容。注意：如果当前已关联了某篇笔记到对话中，该文件的内容已在上下文中，无需再次读取。',
  category: 'note',
  requiresConfirmation: false,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'Markdown 文件的路径（相对路径或绝对路径）',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      // 检查是否已关联该文件到对话中（避免重复读取）
      const chatStore = useChatStore.getState()
      const { linkedResource } = chatStore

      // 如果有关联的文件（非文件夹），且路径匹配，则提示内容已在上下文中
      if (linkedResource && !isLinkedFolder(linkedResource)) {
        // 提取文件名进行比较，支持相对路径和绝对路径的匹配
        const requestedFileName = params.filePath.split('/').pop() || params.filePath
        const linkedFileName = linkedResource.relativePath.split('/').pop() || linkedResource.relativePath

        if (requestedFileName === linkedFileName) {
          return {
            success: true,
            data: {
              filePath: params.filePath,
              content: `[该文件内容已在对话上下文中] 文件 "${linkedResource.name}" (${linkedResource.relativePath}) 已关联到当前对话，其完整内容已在上下文中，无需再次读取。请直接使用上下文中已有的文件内容。`,
              alreadyInContext: true,
            },
            message: `文件 "${linkedResource.name}" 已在对话上下文中，无需再次读取`,
          }
        }
      }

      let content = ''

      // 统一使用 getFilePathOptions 来处理路径，无论是自定义工作区还是默认工作区
      const { path, baseDir } = await getFilePathOptions(params.filePath)

      if (baseDir) {
        content = await readTextFile(path, { baseDir })
      } else {
        content = await readTextFile(path)
      }

      return {
        success: true,
        data: { filePath: params.filePath, content },
        message: `成功读取文件: ${params.filePath}`,
      }
    } catch (error) {
      console.error('[read_markdown_file] 读取失败', {
        filePath: params.filePath,
        error: String(error),
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `读取文件失败: ${error}`,
      }
    }
  },
}

export const createMarkdownFileTool: Tool = {
  name: 'create_markdown_file',
  description: '创建一个新的 Markdown 笔记文件',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'fileName',
      type: 'string',
      description: '文件名（包含 .md 扩展名）',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: '笔记的内容（Markdown 格式）',
      required: true,
    },
    {
      name: 'folderPath',
      type: 'string',
      description: '可选：子文件夹路径，默认为根目录',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      // 验证内容参数
      if (!params.content || typeof params.content !== 'string') {
        return {
          success: false,
          error: '缺少必需参数 content 或参数类型错误',
        }
      }
      
      // 如果没有提供 fileName，生成默认文件名
      let fileName = params.fileName
      if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        fileName = `note-${timestamp}.md`
      }

      let filePath = fileName

      // 如果指定了文件夹路径，拼接路径
      if (params.folderPath) {
        filePath = `${params.folderPath}/${fileName}`
      }

      // 确保文件名以 .md 结尾
      if (!filePath.endsWith('.md')) {
        filePath += '.md'
      }

      // 统一使用 getFilePathOptions 来处理路径
      const { path, baseDir } = await getFilePathOptions(filePath)

      // 在创建文件前，确保父目录存在
      const parentFolderPath = filePath.substring(0, filePath.lastIndexOf('/'))
      const needsParentFolder = parentFolderPath && parentFolderPath !== filePath

      if (needsParentFolder) {
        const { path: parentPath, baseDir: parentBaseDir } = await getFilePathOptions(parentFolderPath)
        const { mkdir } = await import('@tauri-apps/plugin-fs')
        if (parentBaseDir) {
          await mkdir(parentPath, { baseDir: parentBaseDir, recursive: true })
        } else {
          await mkdir(parentPath, { recursive: true })
        }
      }

      if (baseDir) {
        await writeTextFile(path, params.content, { baseDir })
      } else {
        await writeTextFile(path, params.content)
      }
      
      // 刷新文件列表
      const articleStore = useArticleStore.getState()
      await articleStore.loadFileTree()
      
      // 选中新创建的文件
      await articleStore.setActiveFilePath(filePath)
      
      // 读取文件内容到编辑器
      await articleStore.readArticle(filePath)
      
      return {
        success: true,
        data: { filePath },
        message: `成功创建文件: ${filePath}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `创建文件失败: ${error}`,
      }
    }
  },
}

export const updateMarkdownFileTool: Tool = {
  name: 'update_markdown_file',
  description: '更新 Markdown 笔记文件的内容',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: 'Markdown 文件的路径',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: '新的内容（Markdown 格式）',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      // 统一使用 getFilePathOptions 来处理路径
      const { path, baseDir } = await getFilePathOptions(params.filePath)

      if (baseDir) {
        await writeTextFile(path, params.content, { baseDir })
      } else {
        await writeTextFile(path, params.content)
      }

      // 如果更新的是当前打开的文件，通过 saveCurrentArticle 刷新编辑器内容
      // 注意：不要使用 setCurrentArticle，因为它会触发 clearStack 清空撤销历史
      const articleStore = useArticleStore.getState()
      if (articleStore.activeFilePath === params.filePath) {
        // 使用 emitter 通知编辑器内容已从外部更新
        const emitter = (await import('@/lib/emitter')).default
        emitter.emit('external-content-update', params.content)
      }

      return {
        success: true,
        message: `成功更新文件: ${params.filePath}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `更新文件失败: ${error}`,
      }
    }
  },
}

export const deleteMarkdownFileTool: Tool = {
  name: 'delete_markdown_file',
  description: '删除指定的 Markdown 笔记文件',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: '要删除的 Markdown 文件路径',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const articleStore = useArticleStore.getState()

      // 检查是否是当前打开的文件
      const isCurrentFile = articleStore.activeFilePath === params.filePath

      // 统一使用 getFilePathOptions 来处理路径
      const { path, baseDir } = await getFilePathOptions(params.filePath)

      if (baseDir) {
        await remove(path, { baseDir })
      } else {
        await remove(path)
      }

      // 刷新文件列表
      await articleStore.loadFileTree()

      // 删除向量数据库中的记录
      const filename = params.filePath.split('/').pop() || params.filePath
      try {
        const { deleteVectorDocumentsByFilename } = await import('@/db/vector')
        await deleteVectorDocumentsByFilename(filename)
      } catch (error) {
        console.error(`删除文件 ${filename} 的向量数据失败:`, error)
      }

      // 如果删除的是当前打开的文件，取消选择并清空内容
      if (isCurrentFile) {
        await articleStore.setActiveFilePath('')
        articleStore.setCurrentArticle('')
      }

      return {
        success: true,
        message: `成功删除文件: ${params.filePath}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `删除文件失败: ${error}`,
      }
    }
  },
}

export const searchMarkdownFilesTool: Tool = {
  name: 'search_markdown_files',
  description: `在 Markdown 笔记中搜索内容。支持两种模式：

1. **关键词搜索（默认）**：快速精确匹配，适合查找特定术语、函数名、代码片段
   - 示例：搜索 "useState"、"React"、"API"

2. **语义搜索（mode=rag）**：智能理解含义，适合探索性查询
   - 示例：搜索 "如何优化 React 性能"、"笔记同步问题解决方法"

选择建议：
- 查找精确词汇 → 使用默认模式
- 探索性问题 → 使用 mode=rag
- 需要限定范围 → 添加 folderPath 参数`,
  category: 'search',
  requiresConfirmation: false,
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: '搜索关键词或自然语言查询',
      required: true,
    },
    {
      name: 'mode',
      type: 'string',
      description: '搜索模式：keyword（默认，关键词匹配）或 rag（语义搜索）',
      required: false,
    },
    {
      name: 'folderPath',
      type: 'string',
      description: '可选：限定在指定文件夹内搜索（相对路径）',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      // RAG 模式：调用 RAG 搜索
      if (params.mode === 'rag') {
        const { getContextForQuery, getContextForQueryInFolder } = await import('@/lib/rag')

        // 将查询转换为关键词格式
        const keywords = [{ text: params.query, weight: 1 }]

        // 根据是否指定文件夹选择不同的 RAG 方法
        const ragResult = params.folderPath
          ? await getContextForQueryInFolder(keywords, params.folderPath)
          : await getContextForQuery(keywords)

        // 获取所有文件列表，用于补全路径（向量数据库只存文件名，需要补全相对路径）
        const allFiles = await getAllMarkdownFiles()
        // 创建文件名到相对路径的映射（处理同名文件）
        const fileNameToPath = new Map<string, string[]>()
        for (const file of allFiles) {
          const name = file.name
          if (!fileNameToPath.has(name)) {
            fileNameToPath.set(name, [])
          }
          fileNameToPath.get(name)!.push(file.relativePath)
        }

        // 格式化返回结果，补全路径
        const formattedResults = ragResult.sourceDetails.map(source => {
          // 向量搜索返回的 filepath 可能只是文件名，需要补全路径
          let filePath = source.filepath
          if (!filePath.includes('/')) {
            // filepath 只是文件名，从映射中获取完整路径
            const paths = fileNameToPath.get(source.filename)
            if (paths && paths.length > 0) {
              // 如果有多个同名文件，使用第一个
              filePath = paths[0]
            }
          }
          return {
            filePath,
            fileName: source.filename,
            matchedContent: source.content,
          }
        })

        return {
          success: true,
          data: formattedResults,
          message: `RAG 搜索找到 ${ragResult.sources.length} 个相关笔记${params.folderPath ? `（文件夹：${params.folderPath}）` : ''}`,
        }
      }

      // 关键词模式：原有的精确匹配搜索
      // 如果指定了文件夹路径，先过滤文件列表
      let allFiles = await getAllMarkdownFiles()
      if (params.folderPath) {
        allFiles = allFiles.filter(file => file.relativePath.startsWith(params.folderPath))
      }

      const results: Array<{ filePath: string; fileName: string; matchedContent: string }> = []

      for (const file of allFiles) {
        try {
          let content = ''

          // 统一使用 getFilePathOptions 来处理路径
          const { path, baseDir } = await getFilePathOptions(file.relativePath)

          if (baseDir) {
            content = await readTextFile(path, { baseDir })
          } else {
            content = await readTextFile(path)
          }

          if (content.toLowerCase().includes(params.query.toLowerCase())) {
            // 提取匹配的上下文（前后各50个字符）
            const index = content.toLowerCase().indexOf(params.query.toLowerCase())
            const start = Math.max(0, index - 50)
            const end = Math.min(content.length, index + params.query.length + 50)
            const matchedContent = content.substring(start, end)

            results.push({
              filePath: file.relativePath,
              fileName: file.name,
              matchedContent: `...${matchedContent}...`,
            })
          }
        } catch (error) {
          console.error(`读取文件 ${file.path} 失败:`, error)
        }
      }

      return {
        success: true,
        data: results,
        message: `找到 ${results.length} 个匹配的文件${params.folderPath ? `（文件夹：${params.folderPath}）` : ''}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `搜索文件失败: ${error}`,
      }
    }
  },
}

/**
 * 替换文本中的指定行范围
 * @param content 原始内容
 * @param startLine 起始行号（从 1 开始）
 * @param endLine 结束行号（从 1 开始，包含该行）
 * @param newLines 新的行内容数组
 * @returns 修改后的内容
 */
function replaceLinesInRange(
  content: string,
  startLine: number,
  endLine: number,
  newLines: string[]
): string {
  const lines = content.split('\n')

  // 容错处理：如果 startLine > endLine，自动交换
  // 这种情况可能发生在 AI 生成错误时（如删除单行时参数顺序错误）
  let actualStartLine = startLine
  let actualEndLine = endLine
  if (startLine > endLine) {
    actualStartLine = endLine
    actualEndLine = startLine
  }

  // 将行号转换为数组索引（从 0 开始）
  const startIndex = actualStartLine - 1
  const endIndex = actualEndLine - 1

  // 验证行号范围
  if (startIndex < 0 || endIndex >= lines.length) {
    throw new Error(`无效的行号范围: ${startLine}-${endLine}，文件共 ${lines.length} 行`)
  }

  // 替换指定行
  const before = lines.slice(0, startIndex)
  const after = lines.slice(endIndex + 1)
  return [...before, ...newLines, ...after].join('\n')
}

export const modifyCurrentNoteTool: Tool = {
  name: 'modify_current_note',
  description: '修改当前打开的笔记内容。使用前提：必须先用 read_markdown_file 读取当前笔记的内容，了解现有内容后再调用此工具进行修改。此工具会自动获取当前打开的笔记路径，无需指定文件名。推荐使用按行修改模式（lineEdits），速度更快且更精确。',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'lineEdits',
      type: 'array',
      description: '按行修改的编辑操作数组。每个编辑操作包含：startLine（起始行号，从1开始）、endLine（结束行号，包含该行）、newLines（新的行内容数组）。这种方式比输出完整内容更快更精确。示例：[{ "startLine": 5, "endLine": 5, "newLines": ["新的第5行内容"] }]',
      required: false,
    },
    {
      name: 'content',
      type: 'string',
      description: '修改后的完整笔记内容（Markdown 格式）。仅在不使用 lineEdits 时使用。必须基于已读取的原内容进行修改，不能凭空生成。',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const articleStore = useArticleStore.getState()
      const currentFilePath = articleStore.activeFilePath

      if (!currentFilePath) {
        return {
          success: false,
          error: '当前没有打开任何笔记，请先打开一个笔记文件',
        }
      }

      // 优先使用 lineEdits（按行修改）
      if (params.lineEdits && Array.isArray(params.lineEdits) && params.lineEdits.length > 0) {
        // 读取当前文件内容
        const { path, baseDir } = await getFilePathOptions(currentFilePath)
        let currentContent = ''
        if (baseDir) {
          currentContent = await readTextFile(path, { baseDir })
        } else {
          currentContent = await readTextFile(path)
        }

        let modifiedContent = currentContent

        // 应用所有编辑操作（从后往前应用，避免行号偏移）
        const sortedEdits = [...params.lineEdits].sort((a, b) => b.startLine - a.startLine)

        for (const edit of sortedEdits) {
          if (!edit.startLine || !edit.endLine || !edit.newLines) {
            return {
              success: false,
              error: 'lineEdits 中的每个编辑操作必须包含 startLine、endLine 和 newLines 字段',
            }
          }
          modifiedContent = replaceLinesInRange(
            modifiedContent,
            edit.startLine as number,
            edit.endLine as number,
            edit.newLines as string[]
          )
        }

        // 写入修改后的内容
        if (baseDir) {
          await writeTextFile(path, modifiedContent, { baseDir })
        } else {
          await writeTextFile(path, modifiedContent)
        }

        // 通知编辑器内容已从外部更新
        const emitter = (await import('@/lib/emitter')).default
        emitter.emit('external-content-update', modifiedContent)

        return {
          success: true,
          data: {
            filePath: currentFilePath,
            editCount: params.lineEdits.length,
          },
          message: `成功修改当前笔记 ${params.lineEdits.length} 处: ${currentFilePath}`,
        }
      }

      // 兼容原有的 content 模式（完整替换）
      if (!params.content || typeof params.content !== 'string') {
        return {
          success: false,
          error: '缺少必需参数，请提供 lineEdits 或 content',
        }
      }

      // 统一使用 getFilePathOptions 来处理路径
      const { path, baseDir } = await getFilePathOptions(currentFilePath)

      if (baseDir) {
        await writeTextFile(path, params.content, { baseDir })
      } else {
        await writeTextFile(path, params.content)
      }

      // 使用 emitter 通知编辑器内容已从外部更新，而不是直接调用 setCurrentArticle
      // 这样可以保留编辑器的撤销历史
      const emitter = (await import('@/lib/emitter')).default
      emitter.emit('external-content-update', params.content)

      return {
        success: true,
        data: { filePath: currentFilePath },
        message: `成功修改当前笔记: ${currentFilePath}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `修改当前笔记失败: ${error}`,
      }
    }
  },
}

export const readMarkdownFilesBatchTool: Tool = {
  name: 'read_markdown_files_batch',
  description: '批量读取多个 Markdown 笔记文件的内容，避免循环调用。适用于需要一次性读取多个文件的场景。',
  category: 'note',
  requiresConfirmation: false,
  parameters: [
    {
      name: 'filePaths',
      type: 'array',
      description: 'Markdown 文件路径数组',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      if (!Array.isArray(params.filePaths) || params.filePaths.length === 0) {
        return {
          success: false,
          error: '参数 filePaths 必须是非空数组',
        }
      }

      const results = []
      const errors = []

      for (const filePath of params.filePaths) {
        try {
          let content = ''

          // 统一使用 getFilePathOptions 来处理路径
          const { path, baseDir } = await getFilePathOptions(filePath)

          if (baseDir) {
            content = await readTextFile(path, { baseDir })
          } else {
            content = await readTextFile(path)
          }

          results.push({ filePath, content })
        } catch (error) {
          errors.push({ filePath, error: String(error) })
        }
      }

      // 只要有任何文件读取失败，就标记为失败状态
      const hasErrors = errors.length > 0
      return {
        success: !hasErrors,
        data: {
          files: results,
          failed: errors,
          successCount: results.length,
          failCount: errors.length,
        },
        message: hasErrors
          ? `部分失败：成功读取 ${results.length} 个文件，${errors.length} 个失败`
          : `成功读取 ${results.length} 个文件`,
        error: hasErrors
          ? `部分文件读取失败：${errors.map(e => `${e.filePath}: ${e.error}`).join('; ')}`
          : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: `批量读取文件失败: ${error}`,
      }
    }
  },
}

export const deleteMarkdownFilesBatchTool: Tool = {
  name: 'delete_markdown_files_batch',
  description: '批量删除多个 Markdown 笔记文件，避免循环调用。',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePaths',
      type: 'array',
      description: '要删除的 Markdown 文件路径数组',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      if (!Array.isArray(params.filePaths) || params.filePaths.length === 0) {
        return {
          success: false,
          error: '参数 filePaths 必须是非空数组',
        }
      }

      const articleStore = useArticleStore.getState()
      const results = []
      const errors = []
      let currentFileDeleted = false

      for (const filePath of params.filePaths) {
        try {
          if (articleStore.activeFilePath === filePath) {
            currentFileDeleted = true
          }

          // 统一使用 getFilePathOptions 来处理路径
          const { path, baseDir } = await getFilePathOptions(filePath)

          if (baseDir) {
            await remove(path, { baseDir })
          } else {
            await remove(path)
          }

          results.push(filePath)
        } catch (error) {
          errors.push({ filePath, error: String(error) })
        }
      }

      // 批量删除向量数据库中的记录（只删除成功的文件）
      const { deleteVectorDocumentsByFilename } = await import('@/db/vector')
      for (const filePath of results) {
        const filename = filePath.split('/').pop() || filePath
        try {
          await deleteVectorDocumentsByFilename(filename)
        } catch (error) {
          console.error(`删除文件 ${filename} 的向量数据失败:`, error)
        }
      }

      await articleStore.loadFileTree()

      if (currentFileDeleted) {
        await articleStore.setActiveFilePath('')
        articleStore.setCurrentArticle('')
      }

      // 只要有任何文件删除失败，就标记为失败状态
      const hasErrors = errors.length > 0
      return {
        success: !hasErrors,
        data: {
          deleted: results,
          failed: errors,
          successCount: results.length,
          failCount: errors.length,
        },
        message: hasErrors
          ? `部分失败：成功删除 ${results.length} 个文件，${errors.length} 个失败`
          : `成功删除 ${results.length} 个文件`,
        error: hasErrors
          ? `部分文件删除失败：${errors.map(e => `${e.filePath}: ${e.error}`).join('; ')}`
          : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: `批量删除文件失败: ${error}`,
      }
    }
  },
}

export const listMarkdownFilesByDateTool: Tool = {
  name: 'list_markdown_files_by_date',
  description: '列出指定时间范围内更新的 Markdown 笔记文件。支持按相对时间（如近 N 天、N 天之前）或绝对时间范围过滤。',
  category: 'note',
  requiresConfirmation: false,
  parameters: [
    {
      name: 'lastNDays',
      type: 'number',
      description: '可选：获取最近 N 天内修改的文件。与 olderThanDays/startDate/endDate 互斥，优先级最高。',
      required: false,
    },
    {
      name: 'olderThanDays',
      type: 'number',
      description: '可选：获取 N 天之前修改的文件（不含最近 N 天）。与 lastNDays/startDate/endDate 互斥。',
      required: false,
    },
    {
      name: 'startDate',
      type: 'string',
      description: '可选：开始日期（ISO 8601 格式，如 2024-01-01 或 2024-01-01T00:00:00Z）',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '可选：结束日期（ISO 8601 格式，如 2024-12-31 或 2024-12-31T23:59:59Z），默认为当前时间',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      let startDate: Date | undefined
      let endDate: Date | undefined

      // 优先使用 lastNDays 参数（最近 N 天）
      if (params.lastNDays && typeof params.lastNDays === 'number') {
        const now = new Date()
        startDate = new Date(now.getTime() - params.lastNDays * 24 * 60 * 60 * 1000)
        endDate = now
      }
      // 其次使用 olderThanDays 参数（N 天之前）
      else if (params.olderThanDays && typeof params.olderThanDays === 'number') {
        const now = new Date()
        endDate = new Date(now.getTime() - params.olderThanDays * 24 * 60 * 60 * 1000)
        // startDate 不设置，表示从最早开始到 endDate
      }
      // 最后使用 startDate/ endDate 参数（绝对时间范围）
      else {
        if (params.startDate) {
          startDate = new Date(params.startDate)
          if (isNaN(startDate.getTime())) {
            return {
              success: false,
              error: `无效的 startDate 格式: ${params.startDate}，请使用 ISO 8601 格式（如 2024-01-01）`,
            }
          }
        }
        if (params.endDate) {
          endDate = new Date(params.endDate)
          if (isNaN(endDate.getTime())) {
            return {
              success: false,
              error: `无效的 endDate 格式: ${params.endDate}，请使用 ISO 8601 格式（如 2024-12-31）`,
            }
          }
        } else {
          endDate = new Date()
        }
      }

      // 获取包含元数据的文件列表
      const allFiles = await getAllMarkdownFiles(true)

      // 根据时间范围过滤
      const filteredFiles: MarkdownFile[] = []
      for (const file of allFiles) {
        if (!file.modifiedAt) {
          continue // 没有修改时间的文件跳过
        }

        const modifiedTime = new Date(file.modifiedAt)

        // 检查是否在时间范围内
        if (startDate && modifiedTime < startDate) {
          continue
        }
        if (endDate && modifiedTime > endDate) {
          continue
        }

        filteredFiles.push(file)
      }

      // 按修改时间倒序排列
      filteredFiles.sort((a, b) => {
        const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
        const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
        return bTime - aTime
      })

      return {
        success: true,
        data: filteredFiles.map(({ name, relativePath, modifiedAt, metadata }) => ({
          name,
          relativePath,
          modifiedAt: modifiedAt?.toISOString(),
          size: metadata?.size,
          createdAt: metadata?.createdAt?.toISOString(),
          accessedAt: metadata?.accessedAt?.toISOString(),
          isReadOnly: metadata?.isReadOnly,
        })),
        message: `找到 ${filteredFiles.length} 个符合条件的文件（${startDate ? `从 ${startDate.toISOString()}` : ''}${endDate ? `到 ${endDate.toISOString()}` : ''}）`,
      }
    } catch (error) {
      console.error('[list_markdown_files_by_date] 获取文件列表失败', {
        error: String(error),
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `按时间获取 Markdown 文件列表失败: ${error}`,
      }
    }
  },
}

export const renameFileTool: Tool = {
  name: 'rename_file',
  description: '重命名指定的 Markdown 文件。只改变文件名，不改变文件所在的文件夹。',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: '要重命名的 Markdown 文件路径',
      required: true,
    },
    {
      name: 'newName',
      type: 'string',
      description: '新文件名（包含 .md 扩展名，如 "新笔记.md"）',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const articleStore = useArticleStore.getState()

      // 检查是否是当前打开的文件
      const isCurrentFile = articleStore.activeFilePath === params.filePath

      // 验证新文件名以 .md 结尾
      let newName = params.newName
      if (!newName.endsWith('.md')) {
        newName += '.md'
      }

      // 获取原文件的完整路径信息
      const { path: oldPath, baseDir } = await getFilePathOptions(params.filePath)

      // 构建新路径（保持原文件夹，只改文件名）
      const pathParts = params.filePath.split('/')
      pathParts[pathParts.length - 1] = newName
      const newRelativePath = pathParts.join('/')

      const { path: newPath, baseDir: newBaseDir } = await getFilePathOptions(newRelativePath)

      // 检查新文件名是否已存在
      const { exists } = await import('@tauri-apps/plugin-fs')
      const targetExists = newBaseDir
        ? await exists(newPath, { baseDir: newBaseDir })
        : await exists(newPath)

      if (targetExists) {
        return {
          success: false,
          error: `文件名 "${newName}" 已存在，请使用其他文件名`,
        }
      }

      // 执行重命名
      if (baseDir) {
        await rename(oldPath, newPath, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
      } else {
        await rename(oldPath, newPath)
      }

      // 刷新文件列表
      await articleStore.loadFileTree()

      // 如果重命名的是当前打开的文件，更新 activeFilePath 并重新读取内容
      if (isCurrentFile) {
        await articleStore.setActiveFilePath(newRelativePath)
        await articleStore.readArticle(newRelativePath)
      }

      return {
        success: true,
        data: {
          oldPath: params.filePath,
          newPath: newRelativePath,
          newName,
        },
        message: `成功将 "${params.filePath}" 重命名为 "${newRelativePath}"`,
      }
    } catch (error) {
      console.error('[rename_file] 重命名失败', {
        filePath: params.filePath,
        newName: params.newName,
        error: String(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `重命名文件失败: ${error}`,
      }
    }
  },
}

export const moveFileTool: Tool = {
  name: 'move_file',
  description: '将指定的 Markdown 文件移动到另一个文件夹。文件名保持不变。',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: '要移动的 Markdown 文件路径',
      required: true,
    },
    {
      name: 'targetFolderPath',
      type: 'string',
      description: '目标文件夹路径（相对于笔记根目录，如 "前端/React" 或 "学习笔记"）',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const articleStore = useArticleStore.getState()

      // 检查是否是当前打开的文件
      const isCurrentFile = articleStore.activeFilePath === params.filePath

      // 提取原文件名
      const fileName = params.filePath.split('/').pop() || params.filePath

      // 构建新路径
      const newRelativePath = params.targetFolderPath
        ? `${params.targetFolderPath}/${fileName}`
        : fileName

      // 验证目标文件夹是否存在
      const { exists } = await import('@tauri-apps/plugin-fs')
      const { path: targetFolderDir, baseDir: targetBaseDir } = await getFilePathOptions(params.targetFolderPath)

      const targetFolderExists = targetBaseDir
        ? await exists(targetFolderDir, { baseDir: targetBaseDir })
        : await exists(targetFolderDir)

      if (!targetFolderExists) {
        return {
          success: false,
          error: `目标文件夹 "${params.targetFolderPath}" 不存在，请先创建该文件夹`,
        }
      }

      // 获取原文件和新文件的完整路径信息
      const { path: oldPath, baseDir: oldBaseDir } = await getFilePathOptions(params.filePath)
      const { path: newPath, baseDir: newBaseDir } = await getFilePathOptions(newRelativePath)

      // 检查目标位置是否已存在同名文件
      const targetExists = newBaseDir
        ? await exists(newPath, { baseDir: newBaseDir })
        : await exists(newPath)

      if (targetExists) {
        return {
          success: false,
          error: `目标位置已存在同名文件 "${fileName}"，请先重命名或删除该文件`,
        }
      }

      // 执行移动（使用 rename）
      if (oldBaseDir) {
        await rename(oldPath, newPath, { oldPathBaseDir: oldBaseDir, newPathBaseDir: oldBaseDir })
      } else {
        await rename(oldPath, newPath)
      }

      // 刷新文件列表
      await articleStore.loadFileTree()

      // 如果移动的是当前打开的文件，更新 activeFilePath 并重新读取内容
      if (isCurrentFile) {
        await articleStore.setActiveFilePath(newRelativePath)
        await articleStore.readArticle(newRelativePath)
      }

      return {
        success: true,
        data: {
          oldPath: params.filePath,
          newPath: newRelativePath,
        },
        message: `成功将 "${params.filePath}" 移动到 "${newRelativePath}"`,
      }
    } catch (error) {
      console.error('[move_file] 移动失败', {
        filePath: params.filePath,
        targetFolderPath: params.targetFolderPath,
        error: String(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `移动文件失败: ${error}`,
      }
    }
  },
}

export const copyFileTool: Tool = {
  name: 'copy_file',
  description: '复制指定的 Markdown 文件到另一个文件夹。原文件保持不变。',
  category: 'note',
  requiresConfirmation: true,
  parameters: [
    {
      name: 'filePath',
      type: 'string',
      description: '要复制的 Markdown 文件路径',
      required: true,
    },
    {
      name: 'targetFolderPath',
      type: 'string',
      description: '目标文件夹路径（相对于笔记根目录，如 "前端/React" 或 "学习笔记"）。留空表示复制到当前文件夹',
      required: false,
    },
    {
      name: 'newName',
      type: 'string',
      description: '可选：新文件名（包含 .md 扩展名）。如果不指定，则使用原文件名，如果存在同名文件会自动添加序号',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const articleStore = useArticleStore.getState()

      // 提取原文件名
      const originalFileName = params.filePath.split('/').pop() || params.filePath

      // 确定新文件名
      let newFileName = params.newName || originalFileName
      if (!newFileName.endsWith('.md')) {
        newFileName += '.md'
      }

      // 构建新路径
      let newRelativePath = params.targetFolderPath
        ? `${params.targetFolderPath}/${newFileName}`
        : newFileName

      // 验证目标文件夹是否存在（如果指定了目标文件夹）
      if (params.targetFolderPath) {
        const { exists } = await import('@tauri-apps/plugin-fs')
        const { path: targetFolderDir, baseDir: targetBaseDir } = await getFilePathOptions(params.targetFolderPath)

        const targetFolderExists = targetBaseDir
          ? await exists(targetFolderDir, { baseDir: targetBaseDir })
          : await exists(targetFolderDir)

        if (!targetFolderExists) {
          return {
            success: false,
            error: `目标文件夹 "${params.targetFolderPath}" 不存在，请先创建该文件夹`,
          }
        }
      }

      // 获取原文件和新文件的完整路径信息
      const { path: oldPath, baseDir: oldBaseDir } = await getFilePathOptions(params.filePath)
      const { path: newPath, baseDir: newBaseDir } = await getFilePathOptions(newRelativePath)

      // 检查目标位置是否已存在同名文件
      const { exists } = await import('@tauri-apps/plugin-fs')
      let targetExists = newBaseDir
        ? await exists(newPath, { baseDir: newBaseDir })
        : await exists(newPath)

      // 如果存在同名文件且没有指定新文件名，自动添加序号
      if (targetExists && !params.newName) {
        const baseName = newFileName.replace(/\.md$/, '')
        let counter = 1
        do {
          newFileName = `${baseName} ${counter}.md`
          newRelativePath = params.targetFolderPath
            ? `${params.targetFolderPath}/${newFileName}`
            : newFileName

          const { path: checkPath, baseDir: checkBaseDir } = await getFilePathOptions(newRelativePath)
          targetExists = checkBaseDir
            ? await exists(checkPath, { baseDir: checkBaseDir })
            : await exists(checkPath)
          counter++
        } while (targetExists && counter < 1000)
      }

      // 重新获取最终的新路径
      const { path: finalNewPath, baseDir: finalNewBaseDir } = await getFilePathOptions(newRelativePath)

      // 执行复制
      if (oldBaseDir && finalNewBaseDir) {
        await copyFile(oldPath, finalNewPath, { fromPathBaseDir: oldBaseDir, toPathBaseDir: finalNewBaseDir })
      } else {
        await copyFile(oldPath, finalNewPath)
      }

      // 刷新文件列表
      await articleStore.loadFileTree()

      return {
        success: true,
        data: {
          sourcePath: params.filePath,
          newPath: newRelativePath,
          newName: newFileName,
        },
        message: `成功将 "${params.filePath}" 复制为 "${newRelativePath}"`,
      }
    } catch (error) {
      console.error('[copy_file] 复制失败', {
        filePath: params.filePath,
        targetFolderPath: params.targetFolderPath,
        error: String(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: `复制文件失败: ${error}`,
      }
    }
  },
}

export const noteTools: Tool[] = [
  listMarkdownFilesTool,
  readMarkdownFileTool,
  createMarkdownFileTool,
  updateMarkdownFileTool,
  deleteMarkdownFileTool,
  searchMarkdownFilesTool,
  modifyCurrentNoteTool,
  readMarkdownFilesBatchTool,
  deleteMarkdownFilesBatchTool,
  listMarkdownFilesByDateTool,
  renameFileTool,
  moveFileTool,
  copyFileTool,
]
