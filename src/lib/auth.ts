// src/lib/auth.ts
//
// Supabase Auth is email/password based under the hood, but the game only wants
// a username + password. The trick: derive a fake, deterministic email address
// from the username (e.g. "pilotti123" -> "pilotti123@lentopeli.local") and use
// that for every Supabase Auth call. The user never sees or types an email.
//
// IMPORTANT one-time setup in the Supabase dashboard:
//   Authentication -> Providers -> Email -> turn OFF "Confirm email"
//   (fake addresses can never receive a confirmation link, so sign-in would be
//   stuck otherwise)

import { supabase } from './supabase'

// Change this to anything unique to your project - it never has to be a real domain.
const FAKE_EMAIL_DOMAIN = 'lentopeli.local'

const USERNAME_RULES = /^[a-zA-Z0-9_]{3,20}$/

export function validateUsername(username: string): string | null {
  if (!USERNAME_RULES.test(username)) {
    return 'Käyttäjänimen pitää olla 3-20 merkkiä (kirjaimet, numerot, _)'
  }
  return null
}

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`
}

export async function registerWithUsername(username: string, password: string) {
  const validationError = validateUsername(username)
  if (validationError) return { error: { message: validationError } }

  const email = usernameToEmail(username)
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    // Supabase reports a duplicate fake email as "already registered" -
    // translate that back into a username-shaped message.
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: { message: 'Käyttäjänimi on jo varattu' } }
    }
    return { error }
  }

  if (data.user) {
    // Store the human-readable username, linked 1:1 to the auth user.
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, username: username.trim() })
    if (profileError) return { error: profileError }
  }

  return { data, error: null }
}

export async function loginWithUsername(username: string, password: string) {
  const email = usernameToEmail(username)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: { message: 'Väärä käyttäjänimi tai salasana' } }
  }
  return { data, error: null }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  return { id: user.id, username: profile?.username ?? 'Pelaaja' }
}