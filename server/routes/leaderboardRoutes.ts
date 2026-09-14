// server/routes/leaderboardRoutes.ts
import { Router, Request, Response } from 'express'
import { getLeaderboard } from '../db/storage'

export const leaderboardRouter = Router()

// GET /api/leaderboard - Hakee julkisen tulostaulun suoraan palvelimelta
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  try {
    const sortBy = (req.query.sortBy as string) || 'rahat'
    const data = await getLeaderboard(sortBy)
    res.json({ leaderboard: data })
  } catch (error: any) {
    console.error('Virhe tulostaulun haussa:', error)
    res.status(500).json({ error: 'Tulostaulun haku epäonnistui' })
  }
})
