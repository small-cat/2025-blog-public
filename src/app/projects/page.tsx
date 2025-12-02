'use client'

import { useState, useRef } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { ProjectCard, type Project } from './components/project-card'
import CreateDialog from './components/create-dialog'
import { pushProjects } from './services/push-projects'
import { useAuthStore } from '@/hooks/use-auth'
import initialList from './list.json'
import type { ImageItem } from './components/image-upload-dialog'

export default function Page() {
	const [projects, setProjects] = useState<Project[]>(initialList as Project[])
	const [isEditMode, setIsEditMode] = useState(false)

	return (
		<>
			<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
				<div className='grid w-full max-w-[1200px] grid-cols-2 gap-6 max-md:grid-cols-1'>
					{projects.map((project, index) => (
						<ProjectCard
							key={project.url}
							project={project}
							isEditMode={isEditMode}
						/>
					))}
				</div>
			</div>
			
		</>
	)
}
