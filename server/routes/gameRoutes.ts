// server/routes/gameRoutes.ts
import { Router, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { loadGameState, saveGameState } from '../db/storage'
import { suoritaToiminto, tickGameState } from '../game/gameEngine'

export const gameRouter = Router()

// Kaikki pelireitit vaativat autentikoinnin
gameRouter.use(requireAuth)

// GET /api/game/state - Hakee ja päivittää nykyisen pelitilan
gameRouter.get('/state', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!
    const username = req.username!
    const state = await loadGameState(userId, username)
    const { events } = tickGameState(state)

    // Tallennetaan taustalla vain jos tapahtumia tai lennon tiloja muuttui
    if (events.length > 0) {
      await saveGameState(state)
    }

    res.json({ state, events })
  } catch (error: any) {
    console.error('Virhe pelitilan haussa:', error)
    res.status(500).json({ error: 'Pelitilan haku epäonnistui' })
  }
})

// POST /api/game/action - Suorittaa pelaajan toiminnon
gameRouter.post('/action', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!
    const username = req.username!
    const { action, payload } = req.body

    if (!action) {
      return res.status(400).json({ error: 'Toiminto puuttuu' })
    }

    const state = await loadGameState(userId, username)
    const result = suoritaToiminto(state, action, payload)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        state: result.state
      })
    }

    // Tallennetaan onnistunut toiminto
    await saveGameState(result.state)

    res.json({
      success: true,
      message: result.message,
      state: result.state
    })
  } catch (error: any) {
    console.error('Virhe toiminnon suorituksessa:', error)
    res.status(500).json({ error: 'Toiminnon suoritus epäonnistui' })
  }
})
