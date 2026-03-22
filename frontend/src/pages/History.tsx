import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// History page now redirects to the unified Portfolio page (/bets)
export function History() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/portfolio', { replace: true }) }, [navigate])
  return null
}
