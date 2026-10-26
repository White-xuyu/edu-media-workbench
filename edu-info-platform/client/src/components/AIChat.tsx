import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Flame } from 'lucide-react'
import { api } from '../hooks/useApi'
import type { ChatMessage } from '../types'

interface Props {
  initialMessages?: ChatMessage[]
}

interface HotTopic {
  id: string
  label: string
  question: string
  emoji: string
}

export default function AIChat({ initialMessages }: Props) {
  const welcomeMessage: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: `👋 你好！我是教培资讯AI助手。

我可以帮你：
- 🔍 **查找教育政策**相关网站
- 📋 **提供操作流程**（如志愿填报、考试报名等）
- 🔑 **推荐检索关键词**

直接告诉我你的需求即可，例如：
- "我想了解初三报志愿的政策"
- "教师资格证怎么考"
- "高考志愿填报流程"`,
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial = initialMessages || []
    return initial.length > 0 ? [...initial, welcomeMessage] : [welcomeMessage]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hotspots, setHotspots] = useState<HotTopic[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Build history for context
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }))

      const data = await api.post<{ id: string; message: string }>('/chat', {
        message: userMessage.content,
        history,
      })

      const assistantMessage: ChatMessage = {
        id: data.id || Date.now().toString(),
        role: 'assistant',
        content: data.message,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: `❌ 抱歉，AI回复失败：${err.message || '请稍后重试'}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Fetch hotspots on mount
  useEffect(() => {
    api.get<HotTopic[]>('/chat/hotspots')
      .then(setHotspots)
      .catch(() => {})
  }, [])

  const handleHotspotClick = (topic: HotTopic) => {
    if (loading) return
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: topic.question,
    }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    const history = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }))

    api.post<{ id: string; message: string }>('/chat', {
      message: topic.question,
      history,
    })
      .then((data) => {
        setMessages((prev) => [...prev, { id: data.id, role: 'assistant', content: data.message }])
      })
      .catch((err: any) => {
        setMessages((prev) => [...prev, {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: `❌ 抱歉，AI回复失败：${err.message || '请稍后重试'}`,
        }])
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 animate-fade-in ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-primary-600'
                  : 'bg-green-500'
              }`}
            >
              {msg.role === 'user' ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Bot className="w-4 h-4 text-white" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdown(msg.content),
                  }}
                />
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-1">
              <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
              <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
              <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Hot Topics */}
      {hotspots.length > 0 && (
        <div className="px-4 py-2 bg-white border-t border-gray-100">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs font-medium text-gray-500">热点话题</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {hotspots.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => handleHotspotClick(topic)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors border border-orange-200 disabled:opacity-50 whitespace-nowrap"
                >
                  {topic.emoji} {topic.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，例如：初三报志愿的政策是什么？"
            rows={1}
            className="input-field resize-none flex-1"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="btn-primary flex items-center gap-1 px-4 self-end disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">发送</span>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          教培资讯AI助手 · 按Enter发送，Shift+Enter换行
        </p>
      </div>
    </div>
  )
}

function formatMarkdown(text: string): string {
  // Simple markdown to HTML conversion
  let html = text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // H3 headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Ordered lists
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Unordered lists
    .replace(/^-\s(.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')

  // Wrap consecutive <li> tags in <ol> or <ul>
  html = html.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/g, (match) => {
    return `<ol>${match}</ol>`
  })

  return html
}
