'use client'

import { notFound } from 'next/navigation'
import { motion } from 'motion/react'
import Link from 'next/link'
import initialColumns from '../list.json'
import type { ColumnBlog } from '../components/column-card'

interface ColumnDetailProps {
  params: { id: string }
}

export default function ColumnDetailPage({ params }: ColumnDetailProps) {
  const column = initialColumns.find((col: ColumnBlog) => col.id === params.id)

  if (!column) {
    notFound()
  }

  return (
    <div className='flex flex-col items-center justify-center px-6 pt-24 pb-24'>
      <div className='w-full max-w-[1000px]'>
        {/* Header */}
        <div className='mb-12 text-center'>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className='mb-3 text-5xl font-bold text-gray-800'
          >
            {column.name}
          </motion.h1>

          {/* Tags */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className='mt-3 flex flex-wrap justify-center gap-2'
          >
            {column.tags.map((tag) => (
              <span
                key={tag}
                className='rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800'
              >
                {tag}
              </span>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className='mt-6 text-lg text-gray-600'
          >
            {column.summary}
          </motion.p>
        </div>

        {/* Full Catalogue */}
        <div className='book-catalogue rounded-2xl border-2 border-gray-200 bg-white p-8 shadow-sm'>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className='mb-6 flex items-center justify-between'>
              <h2 className='text-2xl font-semibold text-gray-800'>Full Catalogue</h2>
              <span className='rounded-full bg-gray-100 px-4 py-1 text-sm text-gray-700'>
                {column.catalogue.length} articles
              </span>
            </div>

            <div className='space-y-4'>
              {column.catalogue.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                  className='group relative'
                >
                  <div className='relative flex items-center gap-4 rounded-xl border border-gray-100 p-4 transition-all hover:border-blue-200 hover:shadow-md'>
                    {/* Index */}
                    <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800'>
                      {index + 1}
                    </div>

                    {/* Content */}
                    <div className='flex-1'>
                      <h3 className='text-lg font-medium text-gray-800 group-hover:text-blue-600'>
                        {item.title}
                      </h3>
                    </div>

                    {/* Arrow */}
                    <svg
                      className='h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M9 5l7 7-7 7'
                      />
                    </svg>

                    {/* Link */}
                    <Link
                      href={item.url}
                      className='absolute inset-0'
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className='mt-10 flex justify-center'
        >
          <Link
            href='/columns'
            className='flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-800 transition-all hover:border-gray-400 hover:shadow-md'
          >
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
            <span>Back to Columns</span>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
