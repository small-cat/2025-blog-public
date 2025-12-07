import { NextRequest, NextResponse } from 'next/server'
import { addReply } from '@/lib/comments'

// POST a reply to a comment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const replyData = await request.json()
		const { parentCommentId, ...reply } = replyData

		if (!parentCommentId) {
			return NextResponse.json({ error: 'Parent comment ID is required' }, { status: 400 })
		}

		const newReply = addReply(id, parentCommentId, reply)
		return NextResponse.json(newReply, { status: 201 })
	} catch (error) {
		return NextResponse.json({ error: 'Failed to add reply' }, { status: 500 })
	}
}
