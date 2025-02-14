import { decodeBase64ToString, getFiles } from '@/lib/github'
import { GithubContent, RepoNames } from '@/lib/github.types'
import { getCurrentFolder } from '@/lib/path'
import { join } from '@tauri-apps/api/path'
import { BaseDirectory, DirEntry, exists, mkdir, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { Store } from '@tauri-apps/plugin-store'
import { cloneDeep, uniq } from 'lodash-es'
import { create } from 'zustand'

export interface Article {
  article: string
  path: string
}

interface NoteState {
  loading: boolean
  setLoading: (loading: boolean) => void

  activeFilePath: string 
  setActiveFilePath: (name: string) => void

  html2md: boolean
  initHtml2md: () => Promise<void>
  setHtml2md: (html2md: boolean) => Promise<void>

  fileTree: DirTree[]
  fileTreeLoading: boolean
  setFileTree: (tree: DirTree[]) => void
  addFile: (file: DirTree) => void
  loadFileTree: () => Promise<void>
  loadCollapsibleFiles: (folderName: string) => Promise<void>
  newFolder: () => void
  newFile: () => void
  newFileOnFolder: (path: string) => void

  collapsibleList: string[]
  initCollapsibleList: () => Promise<void>
  setCollapsibleList: (name: string, value: boolean) => Promise<void>

  currentArticle: string
  readArticle: (path: string, sha?: string, isLocale?: boolean) => Promise<void>
  setCurrentArticle: (content: string) => void
  saveCurrentArticle: (content: string) => Promise<void>

  allArticle: Article[]
  loadAllArticle: () => Promise<void>
}

export interface DirTree extends DirEntry {
  children?: DirTree[]
  parent?: DirTree
  sha?: string
  isEditing?: boolean
  isLocale: boolean
}

const useArticleStore = create<NoteState>((set, get) => ({
  loading: false,
  setLoading: (loading: boolean) => { set({ loading }) },

  activeFilePath: '',
  setActiveFilePath: async (path: string) => {
    set({ activeFilePath: path })
    const store = await Store.load('store.json');
    await store.set('activeFilePath', path)
  },

  html2md: false,
  initHtml2md: async () => {
    const store = await Store.load('store.json');
    const res = await store.get<boolean>('html2md')
    set({ html2md: res || false })
  },
  setHtml2md: async (html2md: boolean) => {
    set({ html2md })
    const store = await Store.load('store.json');
    store.set('html2md', html2md)
  },

  fileTree: [],
  setFileTree: (tree: DirTree[]) => {
    set({ fileTree: tree })
  },
  addFile: (file: DirTree) => {
    set({ fileTree: [file, ...get().fileTree] })
  },
  fileTreeLoading: false,
  loadFileTree: async () => {
    set({ fileTreeLoading: true })
    set({ fileTree: [] })
    const isArticleDir = await exists('article', { baseDir: BaseDirectory.AppData })
    if (!isArticleDir) {
      await mkdir('article', { baseDir: BaseDirectory.AppData })
    }
    // 获取 article 路径下所有的文件
    const dirs = (await readDir('article', { baseDir: BaseDirectory.AppData }))
      .filter(file => file.name !== '.DS_Store').map(file => ({
        ...file,
        isEditing: false,
        isLocale: true,
        parent: undefined,
        sha: ''
      }))
    await processEntriesRecursively('article', dirs as DirTree[]);
    async function processEntriesRecursively(parent: string, entries: DirTree[]) {
      for (const entry of entries) {
        if (entry.isDirectory) {
          const dir = await join(parent, entry.name);
          const children = (await readDir(dir, { baseDir: BaseDirectory.AppLocalData }))
            .filter(file => file.name !== '.DS_Store')
            .map(file => ({
              ...file,
              parent: entry,
              isEditing: false,
              isLocale: true,
              sha: ''
            })) as DirTree[]
          entry.children = children
          await processEntriesRecursively(dir, children)
        }
      }
    }
    set({ fileTree: dirs })
    // 读取 github 同步文件
    const store = await Store.load('store.json');
    const accessToken = await store.get<string>('accessToken')
    if (!accessToken) {
      set({ fileTreeLoading: false })
      return
    } else {
      const githubFiles = await getFiles({ path: '', repo: RepoNames.sync })
      if (githubFiles) {
        githubFiles.forEach((file: GithubContent) => {
          const index = dirs.findIndex(item => item.name === file.path.replace('article/', ''))
          if (index !== -1) {
            dirs[index].sha = file.sha
          } else {
            dirs.push({
              name: file.path,
              isFile: file.type === 'file',
              isSymlink: false,
              parent: undefined,
              isEditing: false,
              isDirectory: file.type === 'dir',
              sha: file.sha,
              isLocale: false,
            })
          }
        });
        set({ fileTree: dirs })
        set({ fileTreeLoading: false })
      }
    }
  },
  // 加载文件夹内部的 Github 仓库文件
  loadCollapsibleFiles: async (fullpath: string) => {
    const cacheTree: DirTree[] = get().fileTree
    const currentFolder = getCurrentFolder(fullpath, cacheTree)

    const githubFiles = await getFiles({ path: fullpath, repo: RepoNames.sync })
    if (githubFiles && currentFolder) {
      githubFiles.forEach((file: GithubContent) => {
        const index = currentFolder.children?.findIndex(item => item.name === file.name)
        if (index !== undefined && index !== -1 && currentFolder.children) {
          currentFolder.children[index].sha = file.sha
        } else {
          currentFolder.children?.push({
            name: file.path.replace(`${fullpath}/`, ''),
            isFile: file.type === 'file',
            isSymlink: false,
            parent: currentFolder,
            isEditing: false,
            isDirectory: file.type === 'dir',
            sha: file.sha,
            isLocale: false,
            children: file.type === 'file' ? undefined : []
          })
        }
      });
      set({ fileTree: cacheTree })
    }
  },
  newFolder: async () => {
    const path = get().activeFilePath;
    const cacheTree = cloneDeep(get().fileTree)

    const parentFolderPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
    const currentFolder = getCurrentFolder(parentFolderPath, cacheTree)

    const newDir: DirTree = {
      name: '',
      isFile: false,
      isSymlink: false,
      parent: undefined,
      isEditing: true,
      isDirectory: true,
      isLocale: true,
      children: []
    }
    currentFolder?.children?.unshift(newDir)
    set({ fileTree: cacheTree })
  },
  newFile: async () => {
    // 判断 activeFilePath 是否存在 parent
    const path = get().activeFilePath;
    const fileTree = get().fileTree;
    if (path.includes('/')) {
      const folderPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
      const currentFolder = getCurrentFolder(folderPath, fileTree)
      if (currentFolder) {
        const newFile: DirTree = {
          name: '',
          isFile: true,
          isSymlink: false,
          parent: currentFolder,
          isEditing: true,
          isDirectory: false,
          isLocale: true,
        }
        currentFolder.children?.unshift(newFile)
        set({ fileTree })
      }
    } else {
      // 不存在 parent，直接在根目录下创建
      const newFile: DirTree = {
        name: '',
        isFile: true,
        isSymlink: false,
        parent: undefined,
        isEditing: true,
        isDirectory: false,
        isLocale: true,
      }
      const fileTree = get().fileTree
      fileTree.unshift(newFile)
      set({ fileTree })
    }
  },

  newFileOnFolder: async (path: string) => {
    const dirIndex = get().fileTree.findIndex(item => item.name === path)
    if (dirIndex!== undefined && dirIndex!== -1) {
      const fileTree = get().fileTree
      fileTree[dirIndex].isEditing = true
      const newFile: DirTree = {
        name: '',
        isFile: true,
        isSymlink: false,
        parent: fileTree[dirIndex],
        isEditing: true,
        isDirectory: false,
        isLocale: true,
      }
      fileTree[dirIndex].children?.unshift(newFile)
      set({ fileTree })
      set({ collapsibleList: [...get().collapsibleList, path]})
    }
  },

  collapsibleList: [],
  initCollapsibleList: async () => {
    const store = await Store.load('store.json');
    const res = await store.get<string[]>('collapsibleList')
    const activeFilePath = await store.get<string>('activeFilePath')
    if (activeFilePath) {
      set({ activeFilePath })
      get().readArticle(activeFilePath)
    }
    set({ collapsibleList: res || [] })
  },
  setCollapsibleList: async (path: string, value: boolean) => {
    const collapsibleList = get().collapsibleList
    if (value) {
      collapsibleList.push(path)
    } else {
      collapsibleList.splice(collapsibleList.indexOf(path), 1)
    }
    const store = await Store.load('store.json');
    await store.set('collapsibleList', collapsibleList)
    set({ collapsibleList: uniq(collapsibleList).filter(item => !item.includes('.md')) })
  },

  currentArticle: '',
  readArticle: async (path: string, sha?: string, isLocale = true) => {
    if (!path) return
    if (isLocale) {
      let res = ''
      try {
        res = await readTextFile(`article/${path}`, { baseDir: BaseDirectory.AppData })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        try{
          res = decodeBase64ToString(await getFiles({ path, repo: RepoNames.sync }))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
        }
      }
      set({ currentArticle: res })
    } else {
      const res = await getFiles({ path, repo: RepoNames.sync })
      set({ currentArticle: decodeBase64ToString(res.content) })
    }
  },

  setCurrentArticle: (content: string) => {
    set({ currentArticle: content })
  },
  saveCurrentArticle: async (content: string) => {
    if (content) {
      const path = get().activeFilePath
      const isLocale = await exists(`article/${path}`, { baseDir: BaseDirectory.AppData })
      if (path.includes('/')) {
        const dirPath = path.split('/')[0]
        if (!await exists(`article/${dirPath}`, { baseDir: BaseDirectory.AppData })) {
          await mkdir(`article/${dirPath}`, { baseDir: BaseDirectory.AppData })
        } 
      }
      await writeTextFile(`article/${path}`, content, { baseDir: BaseDirectory.AppData })
      if (!isLocale) {
        const cacheTree = cloneDeep(get().fileTree)
        if (path.includes('/')) {
          const dirPath = path.split('/')[0]
          const dirIndex = get().fileTree.findIndex(item => item.name === dirPath)
          const fileIndex = get().fileTree[dirIndex].children?.findIndex(item => item.name === path.split('/')[1])
          if (fileIndex !== undefined && fileIndex !== -1) {
            const file = get().fileTree[dirIndex].children?.[fileIndex]
            if (file) {
              file.isLocale = true
              cacheTree[dirIndex]?.children?.splice(fileIndex, 1, file)
            }
          }
        } else {
          const index = get().fileTree.findIndex(item => item.name === path)
          cacheTree[index].isLocale = true
        }
        set({ fileTree: cacheTree })
      }
    }
  },

  allArticle: [],
  loadAllArticle: async () => {
    const res = await readDir('article', { baseDir: BaseDirectory.AppData })
    const allArticle = res.filter(file => file.isFile && file.name !== '.DS_Store').map(file => ({ article: '', path: file.name }))
    for (let index = 0; index < allArticle.length; index += 1) {
      const file = allArticle[index];
      const article = await readTextFile(`article/${file.path}`, { baseDir: BaseDirectory.AppData })
      allArticle[index].article = article
    }
    set({ allArticle })
  }
}))

export default useArticleStore