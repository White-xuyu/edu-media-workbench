import { useState } from 'react'
import { Copy, X, MessageCircle, Check } from 'lucide-react'
import type { Website } from '../types'

interface Props {
  website: Website
  onClose: () => void
}

export default function WechatDialog({ website, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(website.name)
    } catch {
      const input = document.createElement('input')
      input.value = website.name
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-50 px-5 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">{website.name}</h3>
            <p className="text-xs text-green-600 font-medium">微信公众号</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-green-100 rounded-lg flex-shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {website.description && (
            <p className="text-sm text-gray-500">{website.description}</p>
          )}

          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            💡 微信公众号链接无法在普通浏览器中直接打开。请复制名称后去微信搜索关注：
          </p>

          <div className="space-y-2">
            <button
              onClick={handleCopy}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                copied ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  复制成功
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制公众号名称
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">
            复制名称后，打开微信 → 搜索 → 粘贴即可找到该公众号
          </p>
        </div>
      </div>
    </div>
  )
}
