import { getFileCommits } from "@/lib/github";
import { RepoNames } from "@/lib/github.types";
import useArticleStore, { DirTree } from "@/stores/article";
import dayjs from "dayjs";
import { Cloud, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function SyncState() {
  const { fileTree, activeFilePath } = useArticleStore()
  const [file, setFile] = useState<DirTree | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState('')

  async function getSyscTime() {
    const res = await getFileCommits({ path: activeFilePath, repo: RepoNames.sync })
    if (res && res.length > 0) {
      setLastSyncTime(dayjs(res[0].commit.committer.date).fromNow())
    }
  }

  useEffect(() => {
    if (!fileTree) return
    if (activeFilePath.includes('/')) {
      const folderName = activeFilePath.split('/')[0]
      const folder = fileTree.find(item => item.name === folderName)
      if (folder) {
        const file = folder.children?.find(item => item.name === activeFilePath.split('/')[1])
        if (file) {
          setFile(file)
        }
      }
    } else {
      const file = fileTree.find(item => item.name === activeFilePath)
      if (file) {
        setFile(file)
      }
    }
  }, [activeFilePath, fileTree])

  useEffect(() => {
    setLastSyncTime('')
    getSyscTime()
  }, [activeFilePath])

  return (
    <div className="flex items-center gap-1">
      {file?.sha ? <Cloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
      <span className="h-3.5">{file?.sha ? `${lastSyncTime || '已'}同步` : '未同步'}</span>
    </div>
  )
}