import { Link } from 'react-router-dom'
import { usePageTitle } from '../App'

/** 全局 404（设计 §4.8）。 */
export function NotFoundPage() {
  usePageTitle('页面不存在')
  return (
    <div className="notfound-page">
      <div>
        <div style={{ fontSize: 46 }} aria-hidden="true">
          🌱
        </div>
        <h1 style={{ fontSize: 22, margin: '10px 0 4px' }}>页面不存在</h1>
        <p style={{ color: 'var(--text-sub)', marginBottom: 22 }}>这条小路还没修好</p>
        <Link to="/today" className="btn btn-primary btn-lg">
          回今日
        </Link>
      </div>
    </div>
  )
}
