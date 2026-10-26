import { ExternalLink, Globe, MessageCircle } from 'lucide-react'
import type { Website } from '../types'

interface Props {
  website: Website
  showActions?: boolean
  onEdit?: (website: Website) => void
  onDelete?: (website: Website) => void
  onWechatClick?: (website: Website) => void
}

export default function WebsiteCard({ website, showActions, onEdit, onDelete, onWechatClick }: Props) {
  const isWechat = website.type === 'wechat'

  const nameElement = isWechat ? (
    <button
      onClick={() => onWechatClick?.(website)}
      className="font-medium text-gray-800 hover:text-green-600 transition-colors text-sm flex items-center gap-1 text-left"
    >
      <span className="truncate">{website.name}</span>
      <MessageCircle className="w-3 h-3 flex-shrink-0 text-green-400" />
    </button>
  ) : (
    <a
      href={website.url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-gray-800 hover:text-primary-600 transition-colors text-sm flex items-center gap-1"
    >
      <span className="truncate">{website.name}</span>
      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
    </a>
  )

  return (
    <div className="card-hover bg-white rounded-xl border border-gray-200 p-4 flex flex-col relative">
      {/* WeChat badge */}
      {isWechat && (
        <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded-full font-medium border border-green-200">
          公众号
        </span>
      )}

      {/* Icon & Title */}
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${isWechat ? 'bg-green-50' : 'bg-primary-50'}`}>
          {website.icon ? (
            <img src={website.icon} alt="" className="w-full h-full object-cover" />
          ) : isWechat ? (
            <MessageCircle className="w-5 h-5 text-green-500" />
          ) : (
            <Globe className="w-5 h-5 text-primary-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {nameElement}
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{website.description}</p>
        </div>
      </div>

      {/* Tags */}
      {website.tags && website.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {website.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
          <button
            onClick={() => onEdit?.(website)}
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            编辑
          </button>
          <button
            onClick={() => onDelete?.(website)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
