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
        {/* Header */}
        <div className='mb-12 text-center'>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className='mb-3 text-5xl font-bold text-gray-800'
          >
            Column Blogs
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className='text-lg text-gray-600'
          >
            Explore our curated collections of articles on various topics
          </motion.p>
        </div>

        {/* Column Cards */}
        <div className='grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {columns.map((column, index) => (
            <ColumnCard
              key={column.id}
              column={column}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
