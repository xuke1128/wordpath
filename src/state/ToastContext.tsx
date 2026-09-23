import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastType = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  text: string
  type: ToastType
}

interface ToastApi {
  show: (text: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastApi>({ show: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])

  const show = useCallback((text: string, type: ToastType = 'info') => {
    const id = nextId++
    setItems((prev) => [...prev.slice(-2), { id, text, type }])
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 2500)
    timers.current.push(timer)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
