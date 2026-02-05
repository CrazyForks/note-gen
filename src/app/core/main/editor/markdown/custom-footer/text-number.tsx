import emitter from "@/lib/emitter";
import useArticleStore from "@/stores/article";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function TextNumber() {
  const {activeFilePath} = useArticleStore()
  const [textNumber, setTextNumber] = useState(0)
  const t = useTranslations('article.footer')

  useEffect(() => {
    emitter.on('toolbar-text-number', (length: unknown) => {
      setTextNumber(length as number)
    })
    return () => {
      emitter.off('toolbar-text-number')
    }
  }, [])

  useEffect(() => {
    if (activeFilePath) {
      emitter.emit('toolbar-text-number', 0)
    }
  }, [activeFilePath])

  return <div className="flex items-center gap-1">
    <span className="text-muted-foreground text-xs px-2">{t('wordCount')}: {textNumber}</span>
  </div>
}