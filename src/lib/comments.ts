import fs from 'fs'
import path from 'path'

export interface Comment {
	id: string
	articleId: string
	content: string
	author: string
	createdAt: string
	avatar?: string
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
export const addComment = (comment: Omit<Comment, 'id' | 'createdAt' | 'replies' | 'avatar'>): Comment => {
	ensureCommentsFile()
	const commentsData = fs.readFileSync(COMMENTS_FILE, 'utf-8')
	const comments: Comment[] = JSON.parse(commentsData)

	// Available avatar images
	const avatars = ['/images/avatar.png', '/images/avatar2.png', '/images/avatar-girl.png']

	// Assign a random avatar
	const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)]

	const newComment: Comment = {
		...comment,
		id: Date.now().toString(),
		createdAt: new Date().toISOString(),
		avatar: randomAvatar
	}

	comments.push(newComment)
	fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8')

	return newComment
}

// Add a reply to a comment
export const addReply = (
	articleId: string,
	parentCommentId: string,
	reply: Omit<Comment, 'id' | 'createdAt' | 'articleId' | 'replies' | 'avatar'>
): Comment => {
	ensureCommentsFile()
	const commentsData = fs.readFileSync(COMMENTS_FILE, 'utf-8')
	const comments: Comment[] = JSON.parse(commentsData)

	// Find the parent comment
	const parentIndex = comments.findIndex(comment => comment.id === parentCommentId)

	if (parentIndex === -1) {
		throw new Error('Parent comment not found')
	}

	// Available avatar images
	const avatars = ['/images/avatar.png', '/images/avatar2.png', '/images/avatar-girl.png']

	// Assign a random avatar
	const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)]

	const newReply: Comment = {
		...reply,
		articleId,
		id: Date.now().toString() + '-reply',
		createdAt: new Date().toISOString(),
		avatar: randomAvatar
	}

	// Add the reply to the parent's replies array
	if (!comments[parentIndex].replies) {
		comments[parentIndex].replies = []
	}

	comments[parentIndex].replies.push(newReply)
	fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8')

	return newReply
}
