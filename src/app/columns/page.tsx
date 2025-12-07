'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { ColumnCard, type ColumnBlog } from './components/column-card'
import initialColumns from './list.json'

export default function ColumnsPage() {
	const [columns] = useState<ColumnBlog[]>(initialColumns as ColumnBlog[])

	return (
		<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
			<div className='w-full max-w-[1200px]'>
				{/* Column Cards */}
				<div className='grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
					{columns.map((column, index) => (
						<ColumnCard key={column.id} column={column} />
					))}
				</div>
			</div>
		</div>
	)
}
