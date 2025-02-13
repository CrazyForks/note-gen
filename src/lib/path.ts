import { DirTree } from "@/stores/article"

// 计算父目录路径
export function computedParentPath(item: DirTree) {
  let path = item.name
  function readParentPath(item: DirTree) {
    if (item.parent) {
      path = item.parent.name + '/' + path
      if (item.parent.parent) {
        readParentPath(item.parent)
      }
    }
  }
  readParentPath(item)
  return path
}

export function getCurrentFolder(path: string, fileTree: DirTree[]) {
  let currentFolder: DirTree | undefined
  const levels = path.split('/')

  for (let index = 0; index < levels.length; index++) {
    const level = levels[index]
    let currentIndex = -1
    if (index === 0) {
      currentIndex = fileTree.findIndex(item => item.name === level)
    } else {
      currentIndex = currentFolder?.children?.findIndex(item => item.name === level) || -1
    }
    if (index === 0) {
      currentFolder = fileTree[currentIndex]
    } else {
      currentFolder = currentFolder?.children?.[currentIndex]
    }
  }

  return currentFolder
}