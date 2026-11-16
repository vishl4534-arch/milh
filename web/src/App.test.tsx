import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'
import { setToken } from './api/client'

test('signed-out visitors land on the owner sign in', async () => {
  setToken(null)
  window.history.pushState({}, '', '/owner')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Owner sign in' })).toBeInTheDocument()
})

test('farm tablet route asks for the tablet key and PIN', async () => {
  setToken(null)
  window.history.pushState({}, '', '/kiosk')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Farm tablet' })).toBeInTheDocument()
})
