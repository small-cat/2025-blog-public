import fs from 'fs'
import path from 'path'

export interface Comment {
  id: string
  articleId: string
  content: string
  author: string
  createdAt: string
  replies?: Comment[]
}

const COMMENTS_FILE = path.join(process.cwd(), 'data', 'comments.json')

// Ensure the data directory and comments file exist
const ensureCommentsFile = () => {
  const dataDir = path.dirname(COMMENTS_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  if (!fs.existsSync(COMMENTS_FILE)) {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify([]), 'utf-8')
  }
}

// Get all comments for an article
export const getComments = (articleId: string): Comment[] => {
  ensureCommentsFile()
  const commentsData = fs.readFileSync(COMMENTS_FILE, 'utf-8')
  const allComments: Comment[] = JSON.parse(commentsData)

  // Filter comments for this article
  const articleComments = allComments.filter(comment => comment.articleId === articleId)

  // Create a map of comment IDs to comments
  const commentMap = new Map<string, Comment>()

  // First pass: add all top-level comments (without replies) to the map
  articleComments.forEach(comment => {
    // Make a copy without replies array since those will be nested
    const commentCopy = { ...comment, replies: [] }
    commentMap.set(comment.id, commentCopy)
  })

  // Second pass: add replies to their parent comments
  articleComments.forEach(comment => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach(reply => {
        const parentComment = commentMap.get(comment.id)
        if (parentComment) {
          parentComment.replies?.push(reply)
        }
      })
    }
  })

  // Convert map values back to array (only top-level comments)
  return Array.from(commentMap.values())
}

// Add a new comment
export const addComment = (comment: Omit<Comment, 'id' | 'createdAt' | 'replies'>): Comment => {
  ensureCommentsFile()
  const commentsData = fs.readFileSync(COMMENTS_FILE, 'utf-8')
  const comments: Comment[] = JSON.parse(commentsData)

  const newComment: Comment = {
    ...comment,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  }

  comments.push(newComment)
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8')

  return newComment
}

// Add a reply to a comment
export const addReply = (articleId: string, parentCommentId: string, reply: Omit<Comment, 'id' | 'createdAt' | 'articleId' | 'replies'>): Comment => {
  ensureCommentsFile()
  const commentsData = fs.readFileSync(COMMENTS_FILE, 'utf-8')
  const comments: Comment[] = JSON.parse(commentsData)

  // Find the parent comment
  const parentIndex = comments.findIndex(comment => comment.id === parentCommentId)

  if (parentIndex === -1) {
    throw new Error('Parent comment not found')
  }

  const newReply: Comment = {
    ...reply,
    articleId,
    id: Date.now().toString() + '-reply',
    createdAt: new Date().toISOString(),
  }

  // Add the reply to the parent's replies array
  if (!comments[parentIndex].replies) {
    comments[parentIndex].replies = []
  }

  comments[parentIndex].replies.push(newReply)
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8')

  return newReply
}
