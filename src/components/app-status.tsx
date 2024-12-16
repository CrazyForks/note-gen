import { SidebarMenuButton } from "./ui/sidebar";
import { createSyncRepo, getUserInfo } from "@/lib/github";
import { useEffect, useState } from "react";
import useSettingStore from "@/stores/setting";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { CircleUserRound, LoaderPinwheel, Power } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { UserInfo } from "@/lib/github.types";
import { Button } from "./ui/button";
import { OpenBroswer } from "@/app/core/setting/open-broswer";

export default function AppStatus() {
  const { accessToken, setGithubUsername } = useSettingStore()
  const [loading, setLoading] = useState(false)
  const [userInfo, setUserInfo] = useState<UserInfo>()
  const [imageRepoStatus, setImageRepoStatus] = useState(false)
  const [articleRepoStatus, setArticleRepoStatus] = useState(false)

  async function handleGetUserInfo() {
    setLoading(true)
    const res = await getUserInfo()
    if (res) {
      setUserInfo(res.data as UserInfo)
      setGithubUsername(res.data.login)
    } else {
      setUserInfo(undefined)
    }
    const imageRes = await createSyncRepo('note-gen-image-sync')
    if (imageRes || imageRes === 422) {
      setImageRepoStatus(true)
    }
    const articleRes = await createSyncRepo('note-gen-article-sync')
    if (articleRes || articleRes === 422) {
      setArticleRepoStatus(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    handleGetUserInfo()
  }, [accessToken])

  return <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
    <Avatar>
      <Popover>
        <PopoverTrigger asChild>
          <AvatarImage src={userInfo?.avatar_url} className="cursor-pointer" />
        </PopoverTrigger>
        <PopoverContent className="p-0" side="right" align="start">
          <div className="p-4 border-b flex items-center gap-2">
            <Avatar>
              <AvatarImage src={userInfo?.avatar_url} />
            </Avatar>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold">{userInfo?.login}</h3>
              <span className="text-xs">{userInfo?.email}</span>
            </div>
          </div>
          <div className="p-4 border-b text-xs flex justify-between gap-2">
            <span className="mr-4 font-bold">同步仓库状态</span>
            <div className="flex gap-2">
              <span className="flex items-center gap-1">
                <Power className={`${imageRepoStatus ? 'text-green-500' : 'text-red-500'} size-3`} />
                <OpenBroswer title="图床仓库" url={`https://github.com/${userInfo?.login}/note-gen-image-sync`} />
              </span>
              <span className="flex items-center gap-1">
                <Power className={`${articleRepoStatus ? 'text-green-500' : 'text-red-500'} size-3`} />
                <OpenBroswer title="文章仓库" url={`https://github.com/${userInfo?.login}/note-gen-article-sync`} />
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <AvatarFallback className="rounded-none">
        <Button size="icon" onClick={handleGetUserInfo}>
          {
            loading ? 
              <LoaderPinwheel className={`${loading ? 'animate-spin' : ''}`} /> :
              <CircleUserRound />
          }
        </Button>
      </AvatarFallback>
    </Avatar>
  </SidebarMenuButton>
}