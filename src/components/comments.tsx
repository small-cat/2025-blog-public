'use client'

import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { motion } from 'motion/react'

interface Comment {
  id: string
  articleId: string
  content: string
  author: string
  createdAt: string
  replies?: Comment[]
}

interface CommentsProps {
  articleId: string
}

export function Comments({ articleId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState({ author: '', content: '' })
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyAuthor, setReplyAuthor] = useState('')

  // Fetch comments on mount
  useEffect(() => {
    async function fetchComments() {
      try {
        const response = await fetch(`/api/comments/${articleId}`)
        if (response.ok) {
          const data = await response.json()
          setComments(data)
        }
      } catch (error) {
        console.error('Failed to fetch comments:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchComments()
  }, [articleId])

  // Submit a new comment
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newComment.author.trim() || !newComment.content.trim()) {
      return
    }

    try {
      const response = await fetch(`/api/comments/${articleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComment),
      })

      if (response.ok) {
        const comment = await response.json()
        setComments([...comments, comment])
        setNewComment({ author: '', content: '' })
      }
    } catch (error) {
      console.error('Failed to submit comment:', error)
    }
  }

  // Submit a reply
  const handleSubmitReply = async (e: React.FormEvent, parentId: string) => {
    e.preventDefault()

    if (!replyAuthor.trim() || !replyContent.trim()) {
      return
    }

    try {
      const response = await fetch(`/api/comments/${articleId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentCommentId: parentId,
          author: replyAuthor,
          content: replyContent,
        }),
      })

      if (response.ok) {
        // Update comments state with the new reply
        const reply = await response.json()
        setComments(comments.map(comment => {
          if (comment.id === parentId) {
            return {
              ...comment,
              replies: [...(comment.replies || []), reply],
            }
          }
          return comment
        }))

        // Reset reply form
        setReplyingTo(null)
        setReplyContent('')
        setReplyAuthor('')
      }
    } catch (error) {
      console.error('Failed to submit reply:', error)
    }
  }

  if (loading) {
    return <div className="mt-8 text-center text-secondary">加载评论中...</div>
  }

  return (
    <div className="mx-auto flex max-w-[1140px] justify-start gap-6 px-6 pt-4 pb-12 max-sm:px-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="card static grow max-w-[calc(100%-200px-1.5rem)] overflow-auto rounded-xl bg-white/80 p-8 max-sm:max-w-full"
      >
        <h2 className="mb-6 text-xl font-semibold">评论 ({comments.length})</h2>

        {/* Comment Form */}
        <form onSubmit={handleSubmitComment} className="mb-8">
          <div className="mb-4">
            <label htmlFor="author" className="block mb-1 text-sm font-medium">
              昵称
            </label>
            <input
              type="text"
              id="author"
              value={newComment.author} onChange={(e) => setNewComment({ ...newComment, author: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入你的昵称或邮箱"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="content" className="block mb-1 text-sm font-medium">
              评论内容
            </label>
            <textarea
              id="content"
              rows={3}
              value={newComment.content}
              onChange={(e) => setNewComment({ ...newComment, content: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="写下你的评论..."
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            提交评论
          </button>
        </form>

        {/* Comments List */}
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="border-b border-gray-100 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{comment.author}</span>
                <span className="text-sm text-gray-500">
                  {dayjs(comment.createdAt).format('YYYY年 M月 D日')}
                </span>
              </div>

              <p className="mb-3">{comment.content}</p>

              {/* Reply Button */}
              <button
                onClick={() => setReplyingTo(comment.id)}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                回复
              </button>

              {/* Reply Form */}
              {replyingTo === comment.id && (
                <form
                  onSubmit={(e) => handleSubmitReply(e, comment.id)}
                  className="mt-4 ml-6 border-l-2 border-gray-200 pl-4"
                >
                  <div className="mb-4">
                    <input
                      type="text"
                      value={replyAuthor}
                      onChange={(e) => setReplyAuthor(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="你的昵称"
                    />
                  </div>

                  <div className="mb-4">
                    <textarea
                      rows={2}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="回复评论..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                    >
                      回复
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(null)
                        setReplyContent('')
                        setReplyAuthor('')
                      }}
                      className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-300"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-4 ml-6 space-y-4 border-l-2 border-gray-200 pl-4">
                  {comment.replies.map((reply) => (
                    <div className="pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{reply.author}</span>
                        <span className="text-xs text-gray-500">
                          {dayjs(reply.createdAt).format('YYYY年 M月 D日')}
                        </span>
                      </div>
                      <p className="text-sm">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {comments.length === 0 && (
          <p className="text-center text-secondary">暂无评论，快来成为第一个评论的人吧！</p>
        )}
      </motion.div>
    </div>
  )
}
