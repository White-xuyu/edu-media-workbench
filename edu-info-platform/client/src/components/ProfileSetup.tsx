import { useState } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'
import { CAMPUS_OPTIONS, GRADE_OPTIONS } from '../types'

export default function ProfileSetup() {
  const { user, updateUser } = useAuthStore()
  const [username, setUsername] = useState(user?.username || '')
  const [campus, setCampus] = useState(user?.campus || '')
  const [grade, setGrade] = useState(user?.grade || '')
  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!username.trim()) { setMsg('请填写姓名'); return }
    if (!campus) { setMsg('请选择校区'); return }
    if (!grade) { setMsg('请选择学段'); return }
    setSaving(true)
    setMsg('')
    try {
      const updated = await api.put<any>('/auth/profile', {
        username: username.trim(),
        campus,
        grade,
        avatar,
      })
      // 更新成功后 App 会据此关闭引导层
      updateUser(updated)
    } catch (err: any) {
      setMsg(err.message || '保存失败，请重试')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-800">教培资讯</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">欢迎使用，先设置一下你的资料（仅本机保存，无需注册）</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="请输入你的姓名"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">校区 *</label>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="input-field"
            >
              <option value="">请选择校区</option>
              {CAMPUS_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学段 *</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="input-field"
            >
              <option value="">请选择学段</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">头像链接（选填）</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="input-field"
              placeholder="头像图片链接"
            />
          </div>

          {msg && (
            <div className="text-sm px-4 py-3 rounded-lg bg-amber-50 text-amber-700">{msg}</div>
          )}

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 保存中...
              </span>
            ) : (
              '进入平台'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
