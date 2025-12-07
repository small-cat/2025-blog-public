'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSize } from '@/hooks/use-size'

export interface ColumnBlog {
	id: string
	name: string
	tags: string[]
	summary: string
	catalogue: {
		id: string
		title: string
		url: string
	}[]
}

interface ColumnCardProps {
	column: ColumnBlog
}

export function ColumnCard({ column }: ColumnCardProps) {
	const showCatalogue = column.catalogue.slice(0, 3)
	const hasMore = column.catalogue.length > 3
	const { maxSM } = useSize()

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.9 }}
			{...(maxSM ? { animate: { opacity: 1, scale: 1 } } : { whileInView: { opacity: 1, scale: 1 } })}
			className='card group relative flex flex-col gap-4'>
			<Link href={`/columns/${column.id}`} className='block h-full'>
				{/* Header */}
				<div className='flex items-start gap-4'>
					{/* Placeholder for image similar to ProjectCard - can be replaced with actual image if available */}
					<div className='group relative'>
						<div className='flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600'>
							<span className='text-lg font-semibold text-white'>📚</span>
						</div>
					</div>

					<div className='flex-1'>
						<div className='flex items-center gap-2'>
							<h3 className='text-lg font-semibold'>{column.name}</h3>
						</div>
						{/* Tags */}
						<div className='mt-2 flex flex-wrap gap-2'>
							{column.tags.map(tag => (
								<span key={tag} className='text-secondary rounded-lg bg-white/50 px-2 py-1 text-xs'>
									{tag}
								</span>
							))}
						</div>
					</div>
				</div>

				{/* Summary */}
				<p className='text-secondary mt-4 text-sm leading-relaxed'>{column.summary}</p>

				{/* Catalogue Section */}
				<div className='mt-2'>
					<div className='mb-2 text-sm font-medium text-gray-700'>Catalogue ({column.catalogue.length} articles)</div>
					<div className='text-secondary space-y-1'>
						{showCatalogue.map((item, idx) => (
							<div key={idx} className='flex items-start gap-2 text-xs'>
								<span className='mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400' />
								<span>{item.title}</span>
							</div>
						))}

						{hasMore && <div className='mt-1 text-xs text-gray-400'>+{column.catalogue.length - 3} more articles</div>}
					</div>
				</div>

				{/* Action Button */}
				<div className='mt-2'>
					<div className='rounded-lg bg-white/50 px-3 py-1.5 text-center text-sm font-medium transition-colors hover:bg-white/80'>View Catalogue</div>
				</div>
			</Link>
		</motion.div>
	)
}
