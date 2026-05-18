import { marked } from 'marked'
import type { Tokens } from 'marked'
import { codeToHtml } from 'shiki'
import katex from 'katex'

export type TocItem = { id: string; text: string; level: number }

export interface MarkdownRenderResult {
	html: string
	toc: TocItem[]
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
}

type MathEntry = { formula: string; display: boolean }

function extractMathFormulas(markdown: string): { markdown: string; mathMap: Map<string, MathEntry> } {
	const mathMap = new Map<string, MathEntry>()
	let idx = 0

	// Match display math ($$...$$) and inline math ($...$)
	const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g

	const processed = markdown.replace(mathRegex, (match, displayContent, inlineContent) => {
		// Use triple backticks with unique markers - marked will preserve these as code spans
		const key = `%%MATH${idx}%%`
		if (displayContent !== undefined) {
			// Display math $$...$$
			mathMap.set(key, { formula: displayContent.trim(), display: true })
		} else {
			// Inline math $...$
			mathMap.set(key, { formula: inlineContent, display: false })
		}
		idx++
		// Wrap in backticks so marked treats it as code and preserves the placeholder
		return `\`${key}\``
	})

	return { markdown: processed, mathMap }
}

function renderMathFormulas(html: string, mathMap: Map<string, MathEntry>): string {
	for (const [key, { formula, display }] of mathMap) {
		try {
			const rendered = katex.renderToString(formula, { displayMode: display })
			// Replace the code placeholder with KaTeX HTML
			html = html.replace(new RegExp(`<code>${key}</code>`, 'g'), rendered)
		} catch (e) {
			console.error('KaTeX rendering error:', e)
		}
	}
	return html
}

export async function renderMarkdown(markdown: string): Promise<MarkdownRenderResult> {
	// Extract and replace math formulas with placeholders before parsing
	const { markdown: mathProcessedMarkdown, mathMap } = extractMathFormulas(markdown)

	// Parse tokens and extract TOC
	const tokens = marked.lexer(mathProcessedMarkdown)

	// Parse TOC from markdown tokens, ignoring content inside code blocks
	const toc: TocItem[] = []
	for (const token of tokens) {
		// Only process headings, ignore anything else (including code blocks)
		if (token.type === 'heading') {
			const headingToken = token as Tokens.Heading
			const id = slugify(headingToken.text || '')
			toc.push({
				id,
				text: headingToken.text || '',
				level: headingToken.depth
			})
		}
	}

	// Pre-process code blocks with Shiki
	const codeBlockMap = new Map<string, { html: string; original: string }>()
	for (const token of tokens) {
		if (token.type === 'code') {
			const codeToken = token as Tokens.Code
			const originalCode = codeToken.text
			try {
				const html = await codeToHtml(originalCode, {
					lang: codeToken.lang || 'text',
					theme: 'one-light'
				})
				const key = `__SHIKI_CODE_${codeBlockMap.size}__`
				codeBlockMap.set(key, { html, original: originalCode })
				codeToken.text = key
			} catch {
				// Keep original if highlighting fails
				const key = `__SHIKI_CODE_${codeBlockMap.size}__`
				codeBlockMap.set(key, { html: '', original: originalCode })
				codeToken.text = key
			}
		}
	}

	// Render HTML with heading ids
	const renderer = new marked.Renderer()

	renderer.heading = (token: Tokens.Heading) => {
		const id = slugify(token.text || '')
		return `<h${token.depth} id="${id}">${token.text}</h${token.depth}>`
	}

	renderer.code = (token: Tokens.Code) => {
		// Check if this code block was pre-processed
		const codeData = codeBlockMap.get(token.text)
		if (codeData) {
			// Add data-code attribute with original code for copy functionality
			// Escape HTML entities for attribute value
			const escapedCode = codeData.original.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			if (codeData.html) {
				// Shiki highlighted code
				return `<pre data-code="${escapedCode}">${codeData.html}</pre>`
			}
			// Fallback for failed highlighting
			return `<pre data-code="${escapedCode}"><code>${codeData.original}</code></pre>`
		}
		// Fallback to default (inline code, not code block)
		return `<code>${token.text}</code>`
	}

	renderer.listitem = (token: Tokens.ListItem) => {
		// Render inline markdown inside list items (e.g. links, emphasis)
		const inner = token.tokens ? (marked.parser(token.tokens) as string) : token.text

		if (token.task) {
			const checkbox = token.checked ? '<input type="checkbox" checked disabled />' : '<input type="checkbox" disabled />'
			return `<li class="task-list-item">${checkbox} ${inner}</li>\n`
		}

		return `<li>${inner}</li>\n`
	}

	marked.use({
		renderer
	})
	let html = (marked.parser(tokens) as string) || ''

	// Restore rendered math formulas
	html = renderMathFormulas(html, mathMap)

	return { html, toc }
}
