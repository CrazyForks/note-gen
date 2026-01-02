import { platform } from "@tauri-apps/plugin-os";

// 异步检查是否为移动设备的函数
export function isMobileDevice() {
  try {
    const platformName = platform();
    console.log('Platform detected:', platformName);
    return platformName === 'android' || platformName === 'ios';
  } catch (error) {
    console.error('Error detecting platform:', error);
    // 如果 Tauri API 失败，尝试使用 user agent 检测
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      console.log('Fallback to user agent detection, isMobile:', isMobile);
      return isMobile;
    }
    return false;
  }
}
