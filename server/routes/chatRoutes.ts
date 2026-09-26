// server/routes/chatRoutes.ts
import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'

export interface ChatMessage {
  id: string
  userId?: string
  sender: string
  text: string
  taso?: number
  timestamp: number
}

export const chatRouter = Router()

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const CHAT_FILE = path.join(DATA_DIR, 'chat_history.json')
const MAX_MESSAGES = 100

// In-memory cache for fast access
let messageCache: ChatMessage[] = []

function loadMessagesFromFile() {
  try {
    if (fs.existsSync(CHAT_FILE)) {
      const data = fs.readFileSync(CHAT_FILE, 'utf-8')
      messageCache = JSON.parse(data)
      if (!Array.isArray(messageCache)) {
        messageCache = []
      }
    }
  } catch (err: any) {
    console.warn('Virhe chat-historian lukemisessa:', err.message)
    messageCache = []
  }
}

function saveMessagesToFile() {
  if (process.env.NODE_ENV === 'test') return
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(CHAT_FILE, JSON.stringify(messageCache.slice(-MAX_MESSAGES), null, 2), 'utf-8')
  } catch (err: any) {
    console.warn('Virhe chat-historian tallennuksessa:', err.message)
  }
}

loadMessagesFromFile()

// GET /api/chat/messages - Hae viimeisimmät viestit
chatRouter.get('/messages', (_req: Request, res: Response) => {
  try {
    res.json({ messages: messageCache.slice(-MAX_MESSAGES) })
  } catch (error: any) {
    console.error('Virhe chat-viestien haussa:', error)
    res.status(500).json({ error: 'Viestien haku epäonnistui' })
  }
})

// POST /api/chat/messages - Lähetä uusi viesti
chatRouter.post('/messages', (req: Request, res: Response) => {
  try {
    const { text, sender, taso, userId } = req.body

    const trimmedText = typeof text === 'string' ? text.trim() : ''
    const cleanSender = typeof sender === 'string' && sender.trim() ? sender.trim().slice(0, 30) : 'Lentäjä'

    if (!trimmedText) {
      return res.status(400).json({ error: 'Viesti ei voi olla tyhjä' })
    }

    if (trimmedText.length > 300) {
      return res.status(400).json({ error: 'Viesti on liian pitkä (max 300 merkkiä)' })
    }

    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: typeof userId === 'string' ? userId : undefined,
      sender: cleanSender,
      text: trimmedText,
      taso: typeof taso === 'number' ? taso : undefined,
      timestamp: Date.now()
    }

    messageCache.push(newMessage)
    if (messageCache.length > MAX_MESSAGES) {
      messageCache = messageCache.slice(-MAX_MESSAGES)
    }

    saveMessagesToFile()

    res.status(201).json({ message: newMessage })
  } catch (error: any) {
    console.error('Virhe viestin tallennuksessa:', error)
    res.status(500).json({ error: 'Viestin lähetys epäonnistui' })
  }
})
