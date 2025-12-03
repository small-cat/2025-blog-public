'use client'

import { notFound, useParams } from 'next/navigation'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import initialColumns from '../list.json'

// Updated interface to match actual JSON structure
export interface ColumnArticle {
  title: string
  tags: string[]
  date: string
  summary: string
  cover: string
  slug: string
}

// Column metadata still comes from list.json
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

export default function ColumnDetailPage() {
  const params = useParams() as { id?: string | string[] }
  const id = Array.isArray(params.id) ? params.id[0] : params.id || ''

  // Get column metadata from initialColumns
  const columnMetadata = initialColumns.find((col: ColumnBlog) => col.id === id)

  // Fetch articles from public/columns/[id]/index.json
  const [articles, setArticles] = useState<ColumnArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchColumnArticles() {
      try {
        setLoading(true)
        const response = await fetch(`/columns/${id}/index.json`)
        if (!response.ok) {
          throw new Error('Failed to fetch column articles')
        }
        const data = await response.json()
        setArticles(data)
        setError(false)
      } catch (e) {
        console.error('Error fetching column articles:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchColumnArticles()
    }
  }, [id])

  // Handle loading and error states
  if (loading) {
    return <div className='text-secondary flex h-full items-center justify-center text-sm pt-32'>加载中...</div>
  }

  if (error || !columnMetadata || articles.length === 0) {
    notFound()
  }

  // Group articles by year like blog/page.tsx
  const { groupedItems, years } = (() => {
    const sorted = [...articles].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const grouped = sorted.reduce(
      (acc, item) => {
        const year = dayjs(item.date).format('YYYY')
        if (!acc[year]) {
          acc[year] = []
        }
        acc[year].push(item)
        return acc
      },
      {} as Record<string, ColumnArticle[]>
    )
    const yearKeys = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))
    return { groupedItems: grouped, years: yearKeys }
  })()

  return (
    <>
      <div className='flex flex-col items-center justify-center gap-6 px-6 pt-32 pb-12 max-sm:pt-28'>
        {/* Column Header */}
        <div className="w-full max-w-[840px] mb-12 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className='mb-3 text-5xl font-bold text-gray-800'
          >
            {columnMetadata.name}
          </motion.h1>

          {/* Tags */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className='mt-3 flex flex-wrap justify-center gap-2'
          >
            {columnMetadata.tags.map((tag) => (
              <span
                key={tag}
                className="text-secondary rounded-lg bg-white/50 px-2 py-1 text-xs"
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
            {columnMetadata.summary}
          </motion.p>

          <div className="text-secondary text-sm mt-2">
            {articles.length} 篇文章
          </div>
        </div>

        {/* Articles List - Blog Page Style */}
        <div className="w-full max-w-[840px]">
          {years.map((year, yearIndex) => {
            const yearItems = groupedItems[year];

            return (
              <motion.div
                key={year}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className='card relative w-full space-y-6'
              >
                {/* Year Header */}
                <div className='mb-3 flex items-center gap-3 text-base'>
                  <div className='w-[44px] font-medium'>{year}</div>
                  <div className='h-2 w-2 rounded-full bg-[#D9D9D9]'></div>
                  <div className='text-secondary text-sm'>{yearItems.length} 篇文章</div>
                </div>

                {/* Articles for this year */}
                <div>
                  {yearItems.map((article, articleIndex) => (
                    <Link
                      href={`/columns/${columnMetadata.id}/${article.slug}`}
                      key={article.slug}
                      className='group flex min-h-10 items-center gap-3 py-3 transition-all cursor-pointer'
                    >
                      {/* Date instead of numbering */}
                      <span className='text-secondary w-[44px] shrink-0 text-sm font-medium'>
                        {dayjs(article.date).format('MM-DD')}
                      </span>

                      {/* Animated dot */}
                      <div className='relative flex h-2 w-2 items-center justify-center'>
                        <div className='bg-secondary group-hover:bg-brand h-[5px] w-[5px] rounded-full transition-all group-hover:h-4'></div>
                      </div>

                      {/* Title */}
                      <div className='flex-1 truncate text-sm font-medium transition-all group-hover:text-brand group-hover:translate-x-2'>
                        {article.title}
                      </div>

                      {/* Arrow */}
                      <svg
                        className='h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 ml-2'
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
                    </Link>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 + articles.length * 0.05 }}
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
            <span>Back</span>
          </Link>
        </motion.div>
      </div>
    </>
  )
}
