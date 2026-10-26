import { useState, useEffect } from 'react'
import { Bot, ArrowLeft, Settings, X, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import AIChat from '../components/AIChat'
import { api } from '../hooks/useApi'
import type { ChatHistory, ChatMessage } from '../types'

export default function AIChatPage() {
  const [showSettings, setShowSettings] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.get<{ baseUrl?: string; apiKey?: string; model?: string }>('/chat/settings')
        setBaseUrl(data.baseUrl || '')
        setApiKey(data.apiKey || '')
        setModel(data.model || '')
      } catch (err) {
        // Settings not configured yet, that's OK
      } finally {
        setLoaded(true)
      }
    }

    const fetchHistory = async () => {
      try {
        const history = await api.get<ChatHistory[]>('/chat/history')
        if (history && history.length > 0) {
          const msgs: ChatMessage[] = []
          // history is sorted newest first, reverse to chronological order
          const sorted = [...history].reverse()
          for (const h of sorted) {
            msgs.push({ id: h.id + '-q', role: 'user', content: h.question })
            msgs.push({ id: h.id + '-a', role: 'assistant', content: h.answer })
          }
          setHistoryMessages(msgs)
        }
      } catch (err) {
        // No history yet, that's OK
      }
    }

    fetchSettings()
    fetchHistory()
  }, [])

  const handleSaveSettings = async () => {
    setSaveMsg('')
    setSaving(true)
    try {
      await api.put('/chat/settings', { baseUrl, apiKey, model })
      setSaveMsg('✅ 设置已保存')
    } catch (err: any) {
      setSaveMsg(`❌ ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link to="/" className="p-1 hover:bg-gray-100 rounded-lg lg:hidden">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-800 text-sm">教培资讯 AI 助手</h1>
            <p className="text-xs text-gray-400">智能推荐教育网站和操作流程</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg hover:bg-gray-100 ${showSettings ? 'bg-gray-100' : ''}`}
          title="API 设置"
        >
          <Settings className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && loaded && (
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">API 配置</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              配置你的 OpenAI 兼容 API 以启用 AI 对话功能。不配置则使用本地智能匹配模式。
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-3.5-turbo"
                  className="input-field"
                />
              </div>

              <p className="text-xs text-gray-400">
                支持所有兼容 OpenAI 协议的 API，如 DeepSeek、通义千问、智谱等
              </p>

              {saveMsg && (
                <div className={`text-xs px-3 py-2 rounded ${
                  saveMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {saveMsg}
                </div>
              )}

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        <AIChat initialMessages={historyMessages} />
      </div>
    </div>
  )
}
