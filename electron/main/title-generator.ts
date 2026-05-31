/**
 * 对话标题生成器
 * 使用内置字典分词 + TextRank 提取式摘要算法
 * 生成 5~10 字的对话标题
 */

import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// 轻量级中文分词器（基于 jieba 字典 + DAG 最短路径算法）
// ============================================================

interface TrieNode {
  [key: string]: TrieNode | number
}

let _trie: TrieNode | null = null
let _freq: Record<string, number> = {}
let _minFreq = 0
let _total = 0

function loadDict(): void {
  if (_trie) return

  // 尝试加载 jieba-js 自带的大字典
  const dictPaths = [
    path.join(__dirname, '../node_modules/jieba-js/dict/dict.txt.big'),
    path.join(process.cwd(), 'node_modules/jieba-js/dict/dict.txt.big')
  ]

  let dictFile = ''
  for (const p of dictPaths) {
    try {
      fs.accessSync(p, fs.constants.R_OK)
      dictFile = p
      break
    } catch {
      // continue
    }
  }

  const trie: TrieNode = {}
  const freq: Record<string, number> = {}
  let total = 0

  if (dictFile) {
    const content = fs.readFileSync(dictFile, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split(/\s+/)
      const word = parts[0]
      const count = parseInt(parts[1], 10)
      if (!word || isNaN(count)) continue

      freq[word] = count
      total += count

      // 构建 Trie
      let p: TrieNode = trie
      for (let ci = 0; ci < word.length; ci++) {
        const c = word[ci]
        if (!(c in p)) {
          p[c] = {}
        }
        p = p[c] as TrieNode
      }
      ;(p as Record<string, number>)[''] = count
    }
  } else {
    // 无字典时使用简易分词回退
    _trie = {}
    _freq = {}
    _minFreq = 0
    _total = 0
    return
  }

  // 归一化频率为对数
  let minFreq = Infinity
  for (const k in freq) {
    freq[k] = Math.log(freq[k] / total)
    if (freq[k] < minFreq) {
      minFreq = freq[k]
    }
  }

  _trie = trie
  _freq = freq
  _minFreq = minFreq
  _total = total
}

function getDAG(sentence: string, trie: TrieNode, freq: Record<string, number>): Record<number, number[]> {
  const N = sentence.length
  const DAG: Record<number, number[]> = {}
  let i = 0
  let j = 0
  let p: TrieNode = trie

  while (i < N) {
    const c = sentence[j]
    if (c in p) {
      p = p[c] as TrieNode
      if ('' in p) {
        if (!(i in DAG)) {
          DAG[i] = []
        }
        DAG[i].push(j)
      }
      j += 1
      if (j >= N) {
        i += 1
        j = i
        p = trie
      }
    } else {
      p = trie
      i += 1
      j = i
    }
  }

  for (i = 0; i < N; i++) {
    if (!(i in DAG)) {
      DAG[i] = [i]
    }
  }

  return DAG
}

function calcRoute(
  sentence: string,
  DAG: Record<number, number[]>,
  freq: Record<string, number>,
  minFreq: number
): Record<number, [number, number]> {
  const N = sentence.length
  const route: Record<number, [number, number]> = {}
  route[N] = [0.0, 0]

  for (let idx = N - 1; idx >= 0; idx--) {
    let bestScore = -Infinity
    let bestX = idx
    for (const x of DAG[idx]) {
      const word = sentence.substring(idx, x + 1)
      const f = word in freq ? freq[word] : minFreq
      const score = f + route[x + 1][0]
      if (score > bestScore) {
        bestScore = score
        bestX = x
      }
    }
    route[idx] = [bestScore, bestX]
  }

  return route
}

function cutSync(sentence: string): string[] {
  loadDict()

  // 无字典时使用简易正则分词回退
  if (!_trie || Object.keys(_trie).length === 0) {
    return simpleCut(sentence)
  }

  const re_han = /([\u4E00-\u9FA5a-zA-Z0-9+#&\._]+)/
  const re_skip = /(\r\n|\s)/
  const blocks = sentence.split(re_han)
  const result: string[] = []

  for (const blk of blocks) {
    if (!blk) continue
    if (re_han.test(blk)) {
      const DAG = getDAG(blk, _trie!, _freq)
      const route = calcRoute(blk, DAG, _freq, _minFreq)
      let x = 0
      let buf = ''
      const N = blk.length
      const re_eng = /[a-zA-Z0-9]/

      while (x < N) {
        const y = route[x][1] + 1
        const lWord = blk.substring(x, y)
        if (re_eng.test(lWord) && lWord.length === 1) {
          buf += lWord
          x = y
        } else {
          if (buf.length > 0) {
            result.push(buf)
            buf = ''
          }
          result.push(lWord)
          x = y
        }
      }
      if (buf.length > 0) {
        result.push(buf)
      }
    } else {
      const tmp = blk.split(re_skip)
      for (const x of tmp) {
        if (re_skip.test(x)) {
          result.push(x)
        } else {
          for (const ch of x) {
            result.push(ch)
          }
        }
      }
    }
  }

  return result
}

// 无字典时的简易分词回退：按 CJK 字符逐字切分，英文按单词切分
function simpleCut(sentence: string): string[] {
  const result: string[] = []
  const re_cjk = /[\u4e00-\u9fff]/
  let buf = ''
  for (const ch of sentence) {
    if (re_cjk.test(ch)) {
      if (buf) {
        result.push(buf)
        buf = ''
      }
      result.push(ch)
    } else if (/\s/.test(ch)) {
      if (buf) {
        result.push(buf)
        buf = ''
      }
    } else {
      buf += ch
    }
  }
  if (buf) result.push(buf)
  return result
}

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '些', '什么', '怎么', '如何',
  '啊', '吧', '呢', '吗', '哦', '嗯', '呀', '哈', '嘛', '呗', '啦', '哇',
  '哎', '唉', '嗨', '哟', '地', '得',
  '您', '我们', '你们', '他们', '她们', '它们',
  '这个', '那个', '这些', '那些', '这里', '那里',
  '谁', '哪', '怎样', '为什么', '为啥',
  '把', '被', '让', '给', '对', '向', '从', '往', '于', '以',
  '为', '与', '跟', '同', '及', '或', '但', '而', '且', '则', '若',
  '非常', '太', '更', '最', '挺', '特别', '十分', '极其', '比较',
  '已经', '曾经', '正在', '将要', '刚刚', '刚才', '马上', '立刻',
  '还', '再', '又', '才', '只', '仅',
  '没', '别', '未', '非', '勿', '莫',
  '条', '件', '种', '样', '次', '回', '遍', '趟',
  '些', '点', '下', '口', '头', '块', '篇', '本', '张',
  '能', '可以', '应该', '需要', '必须', '得',
  '做', '搞', '弄', '来', '走', '跑', '听',
  '想', '觉得', '认为', '知道',
  '今天', '明天', '昨天', '现在', '以后', '之前', '之后', '时候', '时间',
  '年', '月', '日', '天', '时', '分', '秒',
  '请', '帮', '帮忙', '谢谢', '感谢', '你好', '您好', '请问',
  '可能', '一下', '一点', '一些', '所有', '每个', '任何', '各种',
  '如果', '虽然', '因为', '所以', '但是', '不过', '然而', '而且',
  '然后', '接着', '最后', '首先', '其次',
  '比如', '例如', '像', '如同',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'it', 'its', 'they', 'them', 'their'
])

// 使用 RegExp 构造函数来避免正则字面量中的编码问题
const RE_IMAGE = new RegExp('!\\[.*?\\]\\(.*?\\)', 'g')
const RE_LINK = new RegExp('\\[(.*?)\\]\\(.*?\\)', 'g')
const RE_HEADING = new RegExp('^#{1,6}\\s+', 'gm')
const RE_CODE_BLOCK = new RegExp('```[\\s\\S]*?```', 'g')
const RE_INLINE_CODE = new RegExp('`([^`]+)`', 'g')
const RE_BOLD_ITALIC = new RegExp('([*_]{1,3})(.*?)\\1', 'g')
const RE_FILE_ATTACH = new RegExp('\\[文件:.*?\\]', 'g')
const RE_FILE_ATTACH2 = new RegExp('\\[附件:.*?\\]', 'g')
const RE_FILE_BLOCK = new RegExp('---\\s*文件:.*?---[\\s\\S]*?---\\s*文件结束\\s*---', 'g')
const RE_QUOTE = new RegExp('^>\\s+', 'gm')
const RE_ULIST = new RegExp('^\\s*[-*+]\\s+', 'gm')
const RE_OLIST = new RegExp('^\\s*\\d+\\.\\s+', 'gm')

function cleanText(content: string): string {
  let text = content.trim()
  text = text.replace(RE_IMAGE, '')
  text = text.replace(RE_LINK, '$1')
  text = text.replace(RE_HEADING, '')
  text = text.replace(RE_CODE_BLOCK, '')
  text = text.replace(RE_INLINE_CODE, '$1')
  text = text.replace(RE_BOLD_ITALIC, '$2')
  text = text.replace(RE_FILE_ATTACH, '')
  text = text.replace(RE_FILE_ATTACH2, '')
  text = text.replace(RE_FILE_BLOCK, '')
  text = text.replace(RE_QUOTE, '')
  text = text.replace(RE_ULIST, '')
  text = text.replace(RE_OLIST, '')
  return text.trim()
}

// 分词过滤用的正则
const RE_PUNCTUATION = new RegExp('^[^\\w\\u4e00-\\u9fff]+$', '')
const RE_SINGLE_CJK = new RegExp('^[\\u4e00-\\u9fff]$', '')
const RE_ENGLISH = new RegExp('^[a-zA-Z]+$', '')
const RE_NUMBER = new RegExp('^\\d+$', '')

function segmentAndFilter(text: string): string[] {
  const words = cutSync(text)
  return words.filter((w) => {
    const trimmed = w.trim()
    if (!trimmed) return false
    if (RE_PUNCTUATION.test(trimmed)) return false
    if (STOP_WORDS.has(trimmed.toLowerCase())) return false
    if (RE_SINGLE_CJK.test(trimmed)) return false
    if (RE_ENGLISH.test(trimmed) && trimmed.length <= 2) return false
    if (RE_NUMBER.test(trimmed)) return false
    return true
  })
}

// 句子切分正则
const RE_SENTENCE_SPLIT = new RegExp('[。！？；\n!?;]+', '')

function splitSentences(text: string): string[] {
  const sentences = text.split(RE_SENTENCE_SPLIT).map((s) => s.trim()).filter((s) => s.length > 0)
  return sentences
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

function textRankSentences(
  sentences: string[],
  wordSets: Set<string>[],
  iterations: number = 30,
  dampingFactor: number = 0.85
): { index: number; score: number }[] {
  const n = sentences.length
  if (n === 0) return []
  if (n === 1) return [{ index: 0, score: 1.0 }]
  const similarityMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccardSimilarity(wordSets[i], wordSets[j])
      similarityMatrix[i][j] = sim
      similarityMatrix[j][i] = sim
    }
  }
  let scores = Array(n).fill(1.0 / n)
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const rowSum = similarityMatrix[j].reduce((a, b) => a + b, 0)
        if (rowSum > 0) {
          sum += (similarityMatrix[j][i] / rowSum) * scores[j]
        }
      }
      newScores[i] = (1 - dampingFactor) + dampingFactor * sum
    }
    scores = newScores
  }
  return scores.map((score, index) => ({ index, score })).sort((a, b) => b.score - a.score)
}

function extractKeywordsByTFIDF(words: string[], topN: number = 10): { word: string; score: number }[] {
  const tf: Map<string, number> = new Map()
  for (const w of words) {
    tf.set(w, (tf.get(w) || 0) + 1)
  }
  const totalWords = words.length
  const tfNormalized: Map<string, number> = new Map()
  for (const [word, count] of tf) {
    tfNormalized.set(word, count / totalWords)
  }
  const results: { word: string; score: number }[] = []
  for (const [word, tfVal] of tfNormalized) {
    const wordLen = word.length
    const freq = tf.get(word) || 1
    const idfApprox = Math.log(1 + totalWords / freq) * (1 + Math.log(wordLen))
    results.push({ word, score: tfVal * idfApprox })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topN)
}

function assembleTitle(candidates: string[]): string {
  if (candidates.length === 0) return '新对话'
  const MIN_LENGTH = 5
  const MAX_LENGTH = 10
  const result: string[] = []
  let currentLength = 0
  for (const word of candidates) {
    if (currentLength + word.length > MAX_LENGTH) {
      if (currentLength < MIN_LENGTH && currentLength + word.length <= MAX_LENGTH) {
        result.push(word)
        currentLength += word.length
      }
      break
    }
    result.push(word)
    currentLength += word.length
    if (currentLength >= MIN_LENGTH) break
  }
  const title = result.join('')
  if (!title || title.length < 3) return '新对话'
  return title
}

function buildTitleFromKeywords(words: string[]): string {
  const keywords = extractKeywordsByTFIDF(words, 10)
  return assembleTitle(keywords.map((k) => k.word))
}

function buildTitleFromMixedStrategy(
  topSentenceWords: string[],
  tfidfKeywords: { word: string; score: number }[],
  allWords: string[]
): string {
  const tfidfWordSet = new Set(tfidfKeywords.map((k) => k.word))
  const candidatesInOrder: string[] = []
  const seen = new Set<string>()
  for (const w of topSentenceWords) {
    if (tfidfWordSet.has(w) && !seen.has(w)) {
      candidatesInOrder.push(w)
      seen.add(w)
    }
  }
  for (const k of tfidfKeywords) {
    if (!seen.has(k.word)) {
      candidatesInOrder.push(k.word)
      seen.add(k.word)
    }
  }
  for (const w of allWords) {
    if (!seen.has(w)) {
      candidatesInOrder.push(w)
      seen.add(w)
    }
  }
  return assembleTitle(candidatesInOrder)
}

const RE_WHITESPACE = new RegExp('\\s+', 'g')

export function generateTitleFromContent(content: string): string {
  if (!content || !content.trim()) return '新对话'
  const cleanedText = cleanText(content)
  if (!cleanedText) return '新对话'
  const allWords = segmentAndFilter(cleanedText)
  if (allWords.length === 0) {
    const fallback = cleanedText.replace(RE_WHITESPACE, '').slice(0, 8)
    return fallback || '新对话'
  }
  const sentences = splitSentences(cleanedText)
  if (sentences.length <= 1) {
    return buildTitleFromKeywords(allWords)
  }
  const sentenceWordSets = sentences.map((s) => new Set(segmentAndFilter(s)))
  const rankedSentences = textRankSentences(sentences, sentenceWordSets)
  const topSentenceIdx = rankedSentences[0].index
  const topSentence = sentences[topSentenceIdx]
  const topSentenceWords = segmentAndFilter(topSentence)
  const tfidfKeywords = extractKeywordsByTFIDF(allWords, 10)
  const title = buildTitleFromMixedStrategy(topSentenceWords, tfidfKeywords, allWords)
  return title
}
