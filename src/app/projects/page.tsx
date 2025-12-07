'use client'

import { useState, useRef } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
// Import column blogs components
import { ColumnCard, type ColumnBlog } from '../columns/components/column-card'
import initialColumns from '../columns/list.json'

export default function Page() {
	return (
		<>
			{/* Blog Columns Section - Same style and background */}
			<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
				<div className='w-full max-w-[1200px]'>
					{/* Header */}
					<div className='mb-12 text-center'>
						<motion.h1
							initial={{ opacity: 0, y: -20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5 }}
							className='mb-3 text-5xl font-bold text-gray-800'>
							Blog Columns
						</motion.h1>
						<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }} className='text-lg text-gray-600'>
							Explore our curated collections of articles
						</motion.p>
					</div>

					{/* Column Cards - Same responsive grid as projects */}
					<div className='grid w-full grid-cols-2 gap-6 max-md:grid-cols-1'>
						{initialColumns.map((column, index) => (
							<ColumnCard key={column.id} column={column} />
						))}
					</div>
				</div>
			</div>
		</>
	)
}
