import type { FastifyInstance } from 'fastify'
import type { DB } from '../db/connection'
import * as repo from '../db/repo'
import { requireAuth } from '../auth/session'
import type { BookDTO } from '../../shared/types'

export function registerBooksRoutes(app: FastifyInstance, db: DB): void {
  const auth = requireAuth(db)

  app.get('/api/books', { preHandler: auth }, async (request) => {
    const user = request.user!
    const books = repo.listBooks(db)
    const learnedByBook = repo.countLearnedByBook(db, user.id)
    const body: BookDTO[] = books.map((b) => {
      const wordCount = repo.bookWordCount(db, b.id)
      return {
        id: b.id,
        stage: b.stage,
        name: b.name,
        description: b.description,
        wordCount,
        learnedCount: learnedByBook.get(b.id) ?? 0,
        isActive: user.active_book_id === b.id,
      }
    })
    return { books: body }
  })

  app.post('/api/books/:id/activate', { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const book = repo.getBook(db, id)
    if (!book) {
      reply.code(404).send({ error: 'BOOK_NOT_FOUND' })
      return
    }
    repo.updateUser(db, request.user!.id, { active_book_id: id })
    return { activeBookId: id }
  })
}
