// server/test/chat.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { chatRouter } from '../routes/chatRoutes'

test('Chat: viestien lähetys, validointi ja haku toimivat oikein', async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/chat', chatRouter)

  const server = app.listen(0)
  const address = server.address() as any
  const baseUrl = `http://localhost:${address.port}`

  try {
    // 1. Tyhjän viestin esto
    const resEmpty = await fetch(`${baseUrl}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ', sender: 'Testaaja' })
    })
    assert.equal(resEmpty.status, 400)
    const emptyJson: any = await resEmpty.json()
    assert.ok(emptyJson.error)

    // 2. Liian pitkän viestin esto (>300 merkkiä)
    const longText = 'A'.repeat(301)
    const resLong = await fetch(`${baseUrl}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: longText, sender: 'Testaaja' })
    })
    assert.equal(resLong.status, 400)

    // 3. Validin viestin lähetys
    const resValid = await fetch(`${baseUrl}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Moro kaikille piloteille! ✈️', sender: 'Kapteeni Ässä', taso: 5 })
    })
    assert.equal(resValid.status, 201)
    const validJson: any = await resValid.json()
    assert.ok(validJson.message)
    assert.equal(validJson.message.sender, 'Kapteeni Ässä')
    assert.equal(validJson.message.text, 'Moro kaikille piloteille! ✈️')
    assert.equal(validJson.message.taso, 5)
    assert.ok(validJson.message.timestamp > 0)

    // 4. Viestien haku GET /api/chat/messages
    const resGet = await fetch(`${baseUrl}/api/chat/messages`)
    assert.equal(resGet.status, 200)
    const getJson: any = await resGet.json()
    assert.ok(Array.isArray(getJson.messages))
    const found = getJson.messages.find((m: any) => m.text === 'Moro kaikille piloteille! ✈️')
    assert.ok(found)
    assert.equal(found.sender, 'Kapteeni Ässä')
  } finally {
    server.close()
  }
})
