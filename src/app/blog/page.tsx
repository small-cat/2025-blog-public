'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ANIMATION_DELAY, INIT_DELAY } from '@/consts'
import ShortLineSVG from '@/svgs/short-line.svg'
import { useBlogIndex, type BlogIndexItem } from '@/hooks/use-blog-index'
import { useReadArticles } from '@/hooks/use-read-articles'
import JuejinSVG from '@/svgs/juejin.svg'
import { useAuthStore } from '@/hooks/use-auth'
import { readFileAsText } from '@/lib/file-utils'
import { cn } from '@/lib/utils'
import { batchDeleteBlogs } from './services/batch-delete-blogs'
import { Check } from 'lucide-react'

export default function BlogPage() {
	const { items, loading } = useBlogIndex()
	const { isRead } = useReadArticles()
	const { isAuth, setPrivateKey } = useAuthStore()

	const keyInputRef = useRef<HTMLInputElement>(null)
	const [editMode, setEditMode] = useState(false)
	const [editableItems, setEditableItems] = useState<BlogIndexItem[]>([])
	const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
	const [saving, setSaving] = useState(false)
	// Add search state
	const [searchQuery, setSearchQuery] = useState('')

	useEffect(() => {
		if (!editMode) {
			setEditableItems(items)
		}
	}, [items, editMode])

	const displayItems = editMode ? editableItems : items

	// Search filter: title and summary
	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return displayItems;

		const query = searchQuery.toLowerCase();
		return displayItems.filter(item =>
			item.title?.toLowerCase().includes(query) ||
			item.summary?.toLowerCase().includes(query) ||
			item.tags?.toString().toLowerCase().includes(query)
		);
	}, [searchQuery, displayItems]);

	const { groupedItems, years } = useMemo(() => {
		const sorted = [...filteredItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		const grouped = sorted.reduce(
			(acc, item) => {
				const year = dayjs(item.date).format('YYYY')
				if (!acc[year]) {
					acc[year] = []
				}
				acc[year].push(item)
				return acc
			},
			{} as Record<string, BlogIndexItem[]>
		)
		const yearKeys = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))
		return { groupedItems: grouped, years: yearKeys }
	}, [filteredItems])

	const selectedCount = selectedSlugs.size

	const toggleSelect = useCallback((slug: string) => {
		setSelectedSlugs(prev => {
			const next = new Set(prev)
			if (next.has(slug)) {
				next.delete(slug)
			} else {
				next.add(slug)
			}
			return next
		})
	}, [])

	const handleItemClick = useCallback(
		(event: React.MouseEvent, slug: string) => {
			if (!editMode) return
			event.preventDefault()
			event.stopPropagation()
			toggleSelect(slug)
		},
		[editMode, toggleSelect]
	)

	return (
		<>

			<div className='flex flex-col items-center justify-center gap-6 px-6 pt-32 pb-12 max-sm:pt-28'>
				<>
					{/* Search Bar */}
					<div className='w-full max-w-[840px] mb-4'>
						<input
							type="text"
							placeholder="搜索文章标题或摘要..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm shadow-sm"
						/>
						{searchQuery && (
							<div className="mt-2 text-xs text-secondary">
								找到 {filteredItems.length} 篇匹配文章
							</div>
						)}
					</div>

					{searchQuery.trim() ? (
						// Show only matched items when search query exists
						<div className="w-full max-w-[840px]">
							{years.map((year, index) => {
								const yearItems = groupedItems[year];
								if (yearItems.length === 0) return null; // Skip years with no matched items

								return (
									<motion.div
										key={year}
										initial={{ opacity: 0, scale: 0.9 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={{ delay: INIT_DELAY + ANIMATION_DELAY * index }}
										className='card relative w-full space-y-6'>
										<div className='mb-3 flex items-center gap-3 text-base'>
											<div className='w-[44px] font-medium'>{year}</div>
											<div className='h-2 w-2 rounded-full bg-[#D9D9D9]'></div>
											<div className='text-secondary text-sm'>{yearItems.length} 篇文章</div>
										</div>
										<div>
											{yearItems.map(it => {
												const hasRead = isRead(it.slug);
												const isSelected = selectedSlugs.has(it.slug);
												return (
													<Link
														href={`/blog/${it.slug}`}
														key={it.slug}
														onClick={event => handleItemClick(event, it.slug)}
														className={cn(
															'group flex min-h-10 items-center gap-3 py-3 transition-all',
															editMode
																? cn(
																		'rounded-lg border px-3',
																		isSelected ? 'border-brand/60 bg-brand/5' : 'hover:border-brand/40 border-transparent hover:bg-white/60'
																	)
																: 'cursor-pointer'
														)}>
														{editMode && (
															<span
																className={cn(
																	'flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold',
																	isSelected ? 'border-brand bg-brand text-white' : 'border-[#D9D9D9] text-transparent'
																)}>
																<Check />
															</span>
														)}
														<span className='text-secondary w-[44px] shrink-0 text-sm font-medium'>{dayjs(it.date).format('MM-DD')}</span>
														<div className='relative flex h-2 w-2 items-center justify-center'>
															<div className='bg-secondary group-hover:bg-brand h-[5px] w-[5px] rounded-full transition-all group-hover:h-4'></div>
															<ShortLineSVG className='absolute bottom-4' />
														</div>
														<div
															className={cn(
																'flex-1 truncate text-sm font-medium transition-all',
																editMode ? null : 'group-hover:text-brand group-hover:translate-x-2'
															)}>
															{it.title || it.slug}
															{hasRead && <span className='text-secondary ml-2 text-xs'>[已阅读]</span>}
														</div>
														<div className='flex flex-wrap items-center gap-2 max-sm:hidden'>
															{(it.tags || []).map(t => (
																<span key={t} className='text-secondary text-sm'>
																	#{t}
																</span>
															))}
														</div>
													</Link>
												);
											})}
										</div>
									</motion.div>
								);
							})}
							{!loading && filteredItems.length === 0 && <div className='text-secondary py-6 text-center text-sm'>没有找到匹配的文章</div>}
						</div>
					) : (
						// Show all years and items when no search query
						years.map((year, index) => (
						<motion.div
							key={year}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: INIT_DELAY + ANIMATION_DELAY * index }}
							className='card relative w-full max-w-[840px] space-y-6'>
							<div className='mb-3 flex items-center gap-3 text-base'>
								<div className='w-[44px] font-medium'>{year}</div>

								<div className='h-2 w-2 rounded-full bg-[#D9D9D9]'></div>

								<div className='text-secondary text-sm'>{groupedItems[year].length} 篇文章</div>
							</div>
							<div>
								{groupedItems[year].map(it => {
									const hasRead = isRead(it.slug)
									const isSelected = selectedSlugs.has(it.slug)
									return (
										<Link
											href={`/blog/${it.slug}`}
											key={it.slug}
											onClick={event => handleItemClick(event, it.slug)}
											className={cn(
												'group flex min-h-10 items-center gap-3 py-3 transition-all',
												editMode
													? cn(
															'rounded-lg border px-3',
															isSelected ? 'border-brand/60 bg-brand/5' : 'hover:border-brand/40 border-transparent hover:bg-white/60'
														)
													: 'cursor-pointer'
											)}>
											{editMode && (
												<span
													className={cn(
														'flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold',
														isSelected ? 'border-brand bg-brand text-white' : 'border-[#D9D9D9] text-transparent'
													)}>
													<Check />
												</span>
											)}
											<span className='text-secondary w-[44px] shrink-0 text-sm font-medium'>{dayjs(it.date).format('MM-DD')}</span>

											<div className='relative flex h-2 w-2 items-center justify-center'>
												<div className='bg-secondary group-hover:bg-brand h-[5px] w-[5px] rounded-full transition-all group-hover:h-4'></div>
												<ShortLineSVG className='absolute bottom-4' />
											</div>
											<div
												className={cn(
													'flex-1 truncate text-sm font-medium transition-all',
													editMode ? null : 'group-hover:text-brand group-hover:translate-x-2'
												)}>
												{it.title || it.slug}
												{hasRead && <span className='text-secondary ml-2 text-xs'>[已阅读]</span>}
											</div>
											<div className='flex flex-wrap items-center gap-2 max-sm:hidden'>
												{(it.tags || []).map(t => (
													<span key={t} className='text-secondary text-sm'>
														#{t}
													</span>
												))}
											</div>
										</Link>
									)
								})}
							</div>
						</motion.div>
					)))}
					{ /* {items.length > 0 && (
						<div className='text-center'>
							<motion.a
								initial={{ opacity: 0, scale: 0.6 }}
								animate={{ opacity: 1, scale: 1 }}
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								href='https://juejin.cn/user/2427311675422382/posts'
								target='_blank'
								className='card text-secondary static inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs'>
								<JuejinSVG className='h-4 w-4' />
								更多
							</motion.a>
						</div>
					)} */}
					{!loading && items.length === 0 && <div className='text-secondary py-6 text-center text-sm'>暂无文章</div>}
					{loading && <div className='text-secondary py-6 text-center text-sm'>加载中...</div>}
				</>
			</div>

		</>
	)
}
