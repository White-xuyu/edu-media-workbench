import { ExternalLink, MessageCircle, Clock, Tag } from 'lucide-react'
import type { Article } from '../types'

interface Props {
  article: Article
}

export default function ArticleCard({ article }: Props) {
  const isWechat = article.sourceType === 'wechat'

  return (
    <div className="card-hover bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      {/* Source badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isWechat
            ? 'bg-green-50 text-green-600 border border-green-200'
            : 'bg-primary-50 text-primary-600 border border-primary-200'
        }`}>
          {isWechat ? '公众号' : '网站'}
        </span>
        <span className="text-xs text-gray-400">{article.sourceName}</span>
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-gray-800 hover:text-primary-600 transition-colors text-sm leading-snug mb-2 flex items-start gap-1"
      >
        <span className="line-clamp-2">{article.title}</span>
        {isWechat ? (
          <MessageCircle className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
        ) : (
          <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0 mt-0.5" />
        )}
      </a>

      {/* Summary */}
      {article.summary && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{article.summary}</p>
      )}

      {/* Bottom row */}
      <div className="mt-auto flex items-center gap-3 text-xs text-gray-400">
        {article.publishDate && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(article.publishDate).toLocaleDateString('zh-CN')}
          </span>
        )}
        {article.tags && article.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Tag className="w-3 h-3 flex-shrink-0" />
            <div className="flex flex-wrap gap-1">
              {article.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-1 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        <span className="ml-auto flex-shrink-0">
          {new Date(article.crawledAt).toLocaleDateString('zh-CN')}
        </span>
      </div>
    </div>
  )
}
