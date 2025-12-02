'use client'

import { useState, useRef } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import GridView, { type Blogger } from './grid-view'
import CreateDialog from './components/create-dialog'
import { pushBloggers } from './services/push-bloggers'
import { useAuthStore } from '@/hooks/use-auth'
import initialList from './list.json'
import type { AvatarItem } from './components/avatar-upload-dialog'

export default function Page() {
	const [bloggers, setBloggers] = useState<Blogger[]>(initialList as Blogger[])
	const [isEditMode, setIsEditMode] = useState(false)

	return (
		<>
			<GridView bloggers={bloggers} isEditMode={isEditMode} />
		</>
	)
}
