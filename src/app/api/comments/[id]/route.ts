import { NextRequest, NextResponse } from 'next/server'
import { getComments, addComment } from '@/lib/comments'

// GET comments for an article
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const comments = getComments(id)
		return NextResponse.json(comments)
	} catch (error) {
		return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
	}
}

// POST a new comment for an article
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const commentData = await request.json()
		const newComment = addComment({
			...commentData,
			articleId: id
		})
		return NextResponse.json(newComment, { status: 201 })
	} catch (error) {
		return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
	}
}
