import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/* As variáveis VITE_* são embutidas no build: se faltarem, avisa em vez de mostrar tela em branco */
if (!url || !key) {
  document.body.innerHTML =
    '<p style="font-family:system-ui;padding:24px;color:#ff8b8b">Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY <b>antes do build</b> (veja o README).</p>'
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não definidas')
}

export const supabase = createClient(url, key)
