// server/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL || 'https://xalwsdeeujyhoqygcoul.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_r6j0Nf2Y0ndCMqZyzgtVVQ_J1OKjsCv'

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

export interface AuthenticatedRequest extends Request {
  userId?: string
  username?: string
  token?: string
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Kirjautumistoken puuttuu' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Virheellinen tai vanhentunut istunto' })
    }

    req.userId = user.id
    req.token = token

    // Haetaan käyttäjänimi profiles-taulusta
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    req.username = profile?.username || user.email?.split('@')[0] || 'Pelaaja'
    next()
  } catch (err: any) {
    console.error('Auth virhe:', err)
    return res.status(401).json({ error: 'Autentikointi epäonnistui' })
  }
}
