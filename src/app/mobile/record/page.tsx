'use client'
import { MobileMarkHeader } from './mobile-mark-header'
import { MobileRecordStream } from './mobile-record-stream'

export default function Record() {
  return (
    <div id="mobile-record" className="flex flex-col h-full w-full bg-background">
      <MobileMarkHeader />
      <MobileRecordStream />
    </div>
  )
}
