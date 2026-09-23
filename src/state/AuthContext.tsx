import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, fetchMe, UNAUTHORIZED_EVENT } from '../api/client'
import type { MeDTO } from '../../shared/types'

interface AuthApi {
  me: MeDTO | null
  loading: boolean
  /** 会话过期弹层（F1-5） */
  expired: boolean
  dismissExpired: () => void
  refresh: () => Promise<MeDTO | null>
  mockLogin: () => Promise<MeDTO>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthApi>({
  me: null,
  loading: true,
  expired: false,
  dismissExpired: () => {},
  refresh: async () => null,
  mockLogin: async () => {
    throw new Error('not mounted')
  },
  logout: async () => {},
})

export function useAuth(): AuthApi {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)

  const refresh = useCallback(async (): Promise<MeDTO | null> => {
    try {
      const data = await fetchMe()
      setMe(data)
      setExpired(false)
      return data
    } catch {
      setMe(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onUnauthorized = () => {
      setMe(null)
      // 已在登录页时不弹过期提示
      if (window.location.pathname !== '/login') setExpired(true)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [refresh])

  const mockLogin = useCallback(async (): Promise<MeDTO> => {
    await api.post('/api/auth/mock')
    const data = await fetchMe()
    setMe(data)
    setExpired(false)
    return data
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      setMe(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        me,
        loading,
        expired,
        dismissExpired: () => setExpired(false),
        refresh,
        mockLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
