export function buildRemotePathsToLoad(expandedPaths: string[]): string[] {
  const uniquePaths = new Set<string>([''])

  for (const path of expandedPaths) {
    if (path) {
      uniquePaths.add(path)
    }
  }

  return Array.from(uniquePaths)
}
