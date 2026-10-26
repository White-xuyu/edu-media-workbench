import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, FolderOpen, Globe, User, X, Upload, Image, Loader2, MessageCircle } from 'lucide-react'
import { api } from '../hooks/useApi'
import { useAuthStore } from '../store/authStore'
import type { Website, Category, Collection } from '../types'
import { CAMPUS_OPTIONS, GRADE_OPTIONS } from '../types'
import WebsiteCard from '../components/WebsiteCard'

type Tab = 'websites' | 'collections' | 'profile'

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('websites')
  const { user, updateUser } = useAuthStore()

  // Websites state
  const [myWebsites, setMyWebsites] = useState<Website[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showWebsiteModal, setShowWebsiteModal] = useState(false)
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null)
  const [websiteForm, setWebsiteForm] = useState({
    name: '', url: '', description: '', icon: '', categoryId: '', tags: '', isPublic: false,
  })

  // Collections state
  const [myCollections, setMyCollections] = useState<Collection[]>([])
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [collectionForm, setCollectionForm] = useState({
    name: '', description: '', websiteIds: [] as string[], isPublic: false,
  })

  // Profile state
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    campus: user?.campus || '',
    grade: user?.grade || '',
    avatar: user?.avatar || '',
  })
  const [profileMsg, setProfileMsg] = useState('')
  const [generatingMeta, setGeneratingMeta] = useState(false)

  // WeChat state
  const [showWechatModal, setShowWechatModal] = useState(false)
  const [editingWechat, setEditingWechat] = useState<Website | null>(null)
  const [wechatForm, setWechatForm] = useState({
    name: '', url: '', description: '', icon: '', categoryId: '', tags: '', isPublic: false,
  })

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [websites, cats, collections] = await Promise.all([
        api.get<Website[]>('/websites/my'),
        api.get<Category[]>('/categories'),
        api.get<Collection[]>('/collections'),
      ])
      setMyWebsites(websites)
      setCategories(cats)
      setMyCollections(collections)
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // WeChat handlers
  const handleAddWechat = () => {
    setEditingWechat(null)
    setWechatForm({ name: '', url: '', description: '', icon: '', categoryId: categories[0]?.id || '', tags: '', isPublic: false })
    setShowWechatModal(true)
  }

  const handleEditWechat = (website: Website) => {
    setEditingWechat(website)
    setWechatForm({
      name: website.name,
      url: website.url,
      description: website.description,
      icon: website.icon,
      categoryId: website.categoryId,
      tags: website.tags?.join(', ') || '',
      isPublic: website.isPublic || false,
    })
    setShowWechatModal(true)
  }

  const handleSaveWechat = async () => {
    try {
      const body = {
        ...wechatForm,
        type: 'wechat',
        tags: wechatForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      }

      if (editingWechat) {
        await api.put(`/websites/${editingWechat.id}`, body)
      } else {
        await api.post('/websites', body)
      }

      setShowWechatModal(false)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDeleteWechat = async (website: Website) => {
    if (!confirm(`确定删除公众号 "${website.name}"？`)) return
    try {
      await api.delete(`/websites/${website.id}`)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Website handlers
  const handleAddWebsite = () => {
    setEditingWebsite(null)
    setWebsiteForm({ name: '', url: '', description: '', icon: '', categoryId: categories[0]?.id || '', tags: '', isPublic: false })
    setShowWebsiteModal(true)
  }

  const handleEditWebsite = (website: Website) => {
    setEditingWebsite(website)
    setWebsiteForm({
      name: website.name,
      url: website.url,
      description: website.description,
      icon: website.icon,
      categoryId: website.categoryId,
      tags: website.tags?.join(', ') || '',
      isPublic: website.isPublic || false,
    })
    setShowWebsiteModal(true)
  }

  const handleDeleteWebsite = async (website: Website) => {
    if (!confirm(`确定删除网站 "${website.name}"？`)) return
    try {
      await api.delete(`/websites/${website.id}`)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleGenerateMeta = async () => {
    if (!websiteForm.url) {
      alert('请先填写网址')
      return
    }
    setGeneratingMeta(true)
    try {
      const data = await api.post<{ title: string; description: string; tags: string[] }>('/websites/generate-meta', {
        url: websiteForm.url,
      })
      setWebsiteForm((f) => ({
        ...f,
        name: f.name || data.title || f.name,
        description: data.description || f.description,
        tags: data.tags?.join(', ') || f.tags,
      }))
    } catch (err: any) {
      alert(err.message || 'AI 生成失败')
    } finally {
      setGeneratingMeta(false)
    }
  }

  const handleSaveWebsite = async () => {
    try {
      const body = {
        ...websiteForm,
        tags: websiteForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      }

      if (editingWebsite) {
        await api.put(`/websites/${editingWebsite.id}`, body)
      } else {
        await api.post('/websites', body)
      }

      setShowWebsiteModal(false)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Icon upload handler
  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      setWebsiteForm((prev) => ({ ...prev, icon: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  // Collection handlers
  const handleAddCollection = () => {
    setEditingCollection(null)
    setCollectionForm({ name: '', description: '', websiteIds: [], isPublic: false })
    setShowCollectionModal(true)
  }

  const handleToggleWebsiteInCollection = (websiteId: string) => {
    setCollectionForm((prev) => ({
      ...prev,
      websiteIds: prev.websiteIds.includes(websiteId)
        ? prev.websiteIds.filter((id) => id !== websiteId)
        : [...prev.websiteIds, websiteId],
    }))
  }

  const handleSaveCollection = async () => {
    try {
      if (editingCollection) {
        await api.put(`/collections/${editingCollection.id}`, collectionForm)
      } else {
        await api.post('/collections', collectionForm)
      }
      setShowCollectionModal(false)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDeleteCollection = async (collection: Collection) => {
    if (!confirm(`确定删除合集 "${collection.name}"？`)) return
    try {
      await api.delete(`/collections/${collection.id}`)
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Profile handler
  const handleUpdateProfile = async () => {
    setProfileMsg('')
    try {
      const body: any = {
        username: profileForm.username,
        campus: profileForm.campus,
        grade: profileForm.grade,
        avatar: profileForm.avatar,
      }

      const updated = await api.put<any>('/auth/profile', body)
      updateUser(updated)
      setProfileMsg('✅ 更新成功')
    } catch (err: any) {
      setProfileMsg(`❌ ${err.message}`)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">我的控制台</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[
          { key: 'websites' as Tab, label: '我的网站', icon: Globe },
          { key: 'collections' as Tab, label: '我的合集', icon: FolderOpen },
          { key: 'profile' as Tab, label: '账号设置', icon: User },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Websites Tab */}
      {tab === 'websites' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              我的网站 <span className="text-sm font-normal text-gray-400">({myWebsites.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={handleAddWebsite} className="btn-primary flex items-center gap-1 text-sm">
                <Plus className="w-4 h-4" />
                添加网站
              </button>
              <button onClick={handleAddWechat} className="btn-primary flex items-center gap-1 text-sm bg-green-500 hover:bg-green-600">
                <MessageCircle className="w-4 h-4" />
                添加公众号
              </button>
            </div>
          </div>

          {myWebsites.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">你还没有添加任何网站或公众号</p>
              <button onClick={handleAddWebsite} className="btn-primary text-sm">
                添加第一个网站
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myWebsites.map((ws) => (
                <WebsiteCard
                  key={ws.id}
                  website={ws}
                  showActions
                  onEdit={ws.type === 'wechat' ? handleEditWechat : handleEditWebsite}
                  onDelete={handleDeleteWebsite}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collections Tab */}
      {tab === 'collections' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              我的合集 <span className="text-sm font-normal text-gray-400">({myCollections.length})</span>
            </h2>
            <button onClick={handleAddCollection} className="btn-primary flex items-center gap-1 text-sm">
              <Plus className="w-4 h-4" />
              创建合集
            </button>
          </div>

          {myCollections.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">你还没有创建任何合集</p>
              <button onClick={handleAddCollection} className="btn-primary text-sm">
                创建第一个合集
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myCollections.map((col) => (
                <div key={col.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-gray-800">{col.name}</h3>
                      {col.description && (
                        <p className="text-sm text-gray-500">{col.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {col.websiteIds.length} 个网站
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingCollection(col)
                          setCollectionForm({
                            name: col.name,
                            description: col.description,
                            websiteIds: col.websiteIds,
                            isPublic: col.isPublic,
                          })
                          setShowCollectionModal(true)
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-4 h-4 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteCollection(col)}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">账号设置</h2>

          {profileMsg && (
            <div className={`text-sm px-4 py-3 rounded-lg mb-4 ${
              profileMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>
              {profileMsg}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                type="text"
                value={profileForm.username}
                onChange={(e) => setProfileForm((p) => ({ ...p, username: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">校区</label>
              <select
                value={profileForm.campus}
                onChange={(e) => setProfileForm((p) => ({ ...p, campus: e.target.value }))}
                className="input-field"
              >
                <option value="">请选择校区</option>
                {CAMPUS_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">学段</label>
              <select
                value={profileForm.grade}
                onChange={(e) => setProfileForm((p) => ({ ...p, grade: e.target.value }))}
                className="input-field"
              >
                <option value="">请选择学段</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">头像URL（选填）</label>
              <input
                type="text"
                value={profileForm.avatar}
                onChange={(e) => setProfileForm((p) => ({ ...p, avatar: e.target.value }))}
                placeholder="输入头像图片链接"
                className="input-field"
              />
            </div>

            <button onClick={handleUpdateProfile} className="btn-primary">
              保存修改
            </button>
          </div>
        </div>
      )}

      {/* Website Modal */}
      {showWebsiteModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {editingWebsite ? '编辑网站' : '添加网站'}
              </h3>
              <button onClick={() => setShowWebsiteModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网站名称 *</label>
                <input
                  type="text"
                  value={websiteForm.name}
                  onChange={(e) => setWebsiteForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="例如：教育部官网"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网址 *</label>
                <input
                  type="url"
                  value={websiteForm.url}
                  onChange={(e) => setWebsiteForm((f) => ({ ...f, url: e.target.value }))}
                  className="input-field"
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-400 mt-1">带 <span className="text-red-400">*</span> 号为必填项</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">简介</label>
                  <button
                    type="button"
                    onClick={handleGenerateMeta}
                    disabled={generatingMeta}
                    className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
                  >
                    {generatingMeta ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>✨</span>
                    )}
                    AI 一键生成
                  </button>
                </div>
                <textarea
                  value={websiteForm.description}
                  onChange={(e) => setWebsiteForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field"
                  rows={2}
                  placeholder="简短描述网站内容..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图标</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                    {websiteForm.icon ? (
                      <img src={websiteForm.icon} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <label className="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                    <Upload className="w-4 h-4" />
                    上传图片
                    <input type="file" accept="image/*" onChange={handleIconUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select
                  value={websiteForm.categoryId}
                  onChange={(e) => setWebsiteForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="input-field"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标签（逗号分隔）</label>
                <input
                  type="text"
                  value={websiteForm.tags}
                  onChange={(e) => setWebsiteForm((f) => ({ ...f, tags: e.target.value }))}
                  className="input-field"
                  placeholder="例如：政策, 教育部, 官方"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveWebsite} className="btn-primary flex-1">
                  {editingWebsite ? '保存修改' : '添加'}
                </button>
                <button onClick={() => setShowWebsiteModal(false)} className="btn-secondary">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WeChat Modal */}
      {showWechatModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {editingWechat ? '编辑公众号' : '添加公众号'}
              </h3>
              <button onClick={() => setShowWechatModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公众号名称 *</label>
                <input type="text" value={wechatForm.name}
                  onChange={(e) => setWechatForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field" placeholder="例如：微言教育" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公众号链接 *</label>
                <input type="url" value={wechatForm.url}
                  onChange={(e) => setWechatForm((f) => ({ ...f, url: e.target.value }))}
                  className="input-field" placeholder="公众号主页或文章链接" />
                <p className="text-xs text-gray-400 mt-1">带 <span className="text-red-400">*</span> 号为必填项</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
                <textarea value={wechatForm.description}
                  onChange={(e) => setWechatForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field" rows={2} placeholder="简短描述公众号内容..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">头像</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                    {wechatForm.icon ? (
                      <img src={wechatForm.icon} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <label className="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                    <Upload className="w-4 h-4" />上传图片
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (ev) => setWechatForm((prev) => ({ ...prev, icon: ev.target?.result as string }))
                      reader.readAsDataURL(file)
                    }} className="hidden" />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select value={wechatForm.categoryId}
                  onChange={(e) => setWechatForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="input-field">
                  {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标签（逗号分隔）</label>
                <input type="text" value={wechatForm.tags}
                  onChange={(e) => setWechatForm((f) => ({ ...f, tags: e.target.value }))}
                  className="input-field" placeholder="例如：官方, 高考, 政策" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveWechat} className="btn-primary flex-1">
                  {editingWechat ? '保存修改' : '添加'}
                </button>
                <button onClick={() => setShowWechatModal(false)} className="btn-secondary">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collection Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {editingCollection ? '编辑合集' : '创建合集'}
              </h3>
              <button onClick={() => setShowCollectionModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">合集名称 *</label>
                <input
                  type="text"
                  value={collectionForm.name}
                  onChange={(e) => setCollectionForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="例如：中考志愿填报资源"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={collectionForm.description}
                  onChange={(e) => setCollectionForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field"
                  rows={2}
                  placeholder="描述这个合集的内容..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择网站 ({collectionForm.websiteIds.length} 个已选)
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {myWebsites.length === 0 ? (
                    <p className="text-sm text-gray-400 p-4 text-center">暂无网站，请先添加网站</p>
                  ) : (
                    myWebsites.map((ws) => (
                      <label key={ws.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={collectionForm.websiteIds.includes(ws.id)}
                          onChange={() => handleToggleWebsiteInCollection(ws.id)}
                          className="w-4 h-4 text-primary-600 rounded"
                        />
                        <span className="text-sm text-gray-700 truncate">{ws.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveCollection} className="btn-primary flex-1">
                  {editingCollection ? '保存修改' : '创建'}
                </button>
                <button onClick={() => setShowCollectionModal(false)} className="btn-secondary">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
