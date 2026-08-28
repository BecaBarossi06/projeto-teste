import './globals.css'

export const metadata = {
  title: 'Fluxo — Controle Financeiro',
  description: 'Controle financeiro pessoal com Supabase'
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
