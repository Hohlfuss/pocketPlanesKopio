// server/index.ts
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { gameRouter } from './routes/gameRoutes'
import { leaderboardRouter } from './routes/leaderboardRoutes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API-reitit
app.use('/api/game', gameRouter)
app.use('/api/leaderboard', leaderboardRouter)

// Health check Renderia varten
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Staattisten tiedostojen tarjoilu (Render tuotantoympäristö)
const distPath = path.join(process.cwd(), 'dist')

if (fs.existsSync(distPath)) {
  console.log(`[Server] Tarjoillaan frontend kansiosta: ${distPath}`)
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      }
    }
  }))

  // Kaikki muut GET-pyynnöt ohjataan Vue Routerin SPA:lle (Express 5 yhteensopiva)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      return res.sendFile(path.join(distPath, 'index.html'))
    }
    next()
  })
} else {
  console.log(`[Server] Kehitystila: Frontend-dist kansiota ei löydy, käytä Vite-kehityspalvelinta`)
}

app.listen(PORT, () => {
  console.log(`===========================================`)
  console.log(`🚀 Pocket Planes Server käynnissä!`)
  console.log(`📡 Portti: ${PORT}`)
  console.log(`🌍 Tila: ${process.env.NODE_ENV || 'development'}`)
  console.log(`===========================================`)
})
