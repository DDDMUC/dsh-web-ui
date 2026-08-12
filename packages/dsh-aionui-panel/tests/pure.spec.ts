/**
 * Pure helper tests: markdown rendering (escaping first, own tags only),
 * CSV parsing, URL normalization, grid-track parsing, and content-type
 * detection.
 */
import { describe, expect, it } from 'vitest'
import { renderInline, renderMarkdown } from '../src/client/preview/markdown.ts'
import { parseCsv, normalizeUrl } from '../src/client/preview/content.tsx'
import { parseGridTracks, trackPx } from '../src/client/layout.ts'
import { detectContentType } from '../src/client/fileType.ts'

describe('renderMarkdown', () => {
  it('renders headings, paragraphs and hr', () => {
    const html = renderMarkdown('# Title\n\nbody text\n\n---\n')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<p>body text</p>')
    expect(html).toContain('<hr />')
  })

  it('escapes raw HTML and keeps code blocks intact', () => {
    const html = renderMarkdown('```ts\nconst x = "<b>"\n```\n\n<script>alert(1)</script>')
    expect(html).toContain('<pre class="language-ts"><code>const x = &quot;&lt;b&gt;&quot;</code></pre>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('renders inline formatting', () => {
    expect(renderInline('a **b** c')).toBe('a <strong>b</strong> c')
    expect(renderInline('a *b* c')).toBe('a <em>b</em> c')
    expect(renderInline('`code` here')).toBe('<code>code</code> here')
    expect(renderInline('[x](https://a.b)')).toBe('<a href="https://a.b" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('renders tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders lists and blockquotes', () => {
    const html = renderMarkdown('- one\n- two\n\n> quote\n')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<blockquote><p>quote</p></blockquote>')
  })
})

describe('parseCsv', () => {
  it('parses quoted cells and escaped quotes', () => {
    const rows = parseCsv('a,"b,c","d""e"\n1,2,3\n')
    expect(rows).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']])
  })
})

describe('normalizeUrl', () => {
  it('adds https to bare domains and searches whitespace queries', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeUrl('hello world')).toContain('https://www.bing.com/search?q=')
    expect(normalizeUrl('')).toBe('about:blank')
  })
})

describe('parseGridTracks / trackPx', () => {
  it('parses the shell inline grid including minmax with spaces', () => {
    const tracks = parseGridTracks('280px minmax(0, 1fr) 0px')
    expect(tracks).toEqual(['280px', 'minmax(0, 1fr)', '0px'])
    expect(trackPx(tracks[0])).toBe(280)
    expect(trackPx(tracks[1])).toBe(0)
    expect(trackPx(tracks[2])).toBe(0)
  })

  it('parses five-track strings', () => {
    const tracks = parseGridTracks('280px minmax(0, 1fr) 0px 480px 260px')
    expect(tracks).toHaveLength(5)
    expect(trackPx(tracks[3])).toBe(480)
    expect(trackPx(tracks[4])).toBe(260)
  })
})

describe('detectContentType', () => {
  it('maps the format set', () => {
    expect(detectContentType('README.md')).toBe('markdown')
    expect(detectContentType('index.html')).toBe('html')
    expect(detectContentType('app.tsx')).toBe('code')
    expect(detectContentType('patch.diff')).toBe('diff')
    expect(detectContentType('data.csv')).toBe('csv')
    expect(detectContentType('doc.pdf')).toBe('pdf')
    expect(detectContentType('a.docx')).toBe('word')
    expect(detectContentType('b.xlsx')).toBe('excel')
    expect(detectContentType('c.pptx')).toBe('ppt')
    expect(detectContentType('pic.png')).toBe('image')
    expect(detectContentType('LICENSE')).toBe('text')
    expect(detectContentType('weird.bin')).toBe('unsupported')
  })
})
