type FilePathOptions = {
  path: string
  baseDir?: unknown
}

type RootDropDeps = {
  fileName: string
  getFilePathOptions: (relativePath: string) => Promise<FilePathOptions>
  writeTextFile?: (path: string, content: string, options?: { baseDir: unknown }) => Promise<void>
  writeFile?: (path: string, content: Uint8Array, options?: { baseDir: unknown }) => Promise<void>
}

type RootDropPayload =
  | {
      kind: 'text'
      content: string
    }
  | {
      kind: 'binary'
      content: Uint8Array
    }

export function sanitizeDroppedFileName(fileName: string) {
  return fileName.replace(/\s+/g, '_')
}

export async function writeDroppedFileToRoot(deps: RootDropDeps, payload: RootDropPayload) {
  const sanitizedFileName = sanitizeDroppedFileName(deps.fileName)
  const pathOptions = await deps.getFilePathOptions(sanitizedFileName)

  if (payload.kind === 'text') {
    await deps.writeTextFile?.(pathOptions.path, payload.content, pathOptions.baseDir ? { baseDir: pathOptions.baseDir } : undefined)
  } else {
    await deps.writeFile?.(pathOptions.path, payload.content, pathOptions.baseDir ? { baseDir: pathOptions.baseDir } : undefined)
  }

  return sanitizedFileName
}
