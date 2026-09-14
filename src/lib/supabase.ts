// src/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xalwsdeeujyhoqygcoul.supabase.co'
const supabaseKey = 'sb_publishable_r6j0Nf2Y0ndCMqZyzgtVVQ_J1OKjsCv'

export const supabase = createClient(supabaseUrl, supabaseKey)