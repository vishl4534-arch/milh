import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import '../i18n'
import { KioskLogin, OwnerLogin } from './Login'

afterEach(() => vi.unstubAllGlobals())

const accounts = {
  farm: 'Al-Batinah example farm',
  owners: [{ name: 'Aisha Al-Balushi', title: 'Farm owner', role: 'owner', email: 'owner@milh.test', password: 'milh-abc', note: '' }],
  workers: [{ name: 'Imran Khan', title: 'Field worker', language: 'ur', pin: '1234', device_key: 'pre.key', note: 'Urdu' }],
}

function stubDemo(ok: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => (ok ? new Response(JSON.stringify(accounts), { status: 200 }) : new Response('', { status: 404 }))))
}

test('picking a demo owner fills the sign-in form', async () => {
  stubDemo(true)
  const { container } = render(<MemoryRouter><OwnerLogin /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Aisha Al-Balushi/ }))
  expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe('owner@milh.test')
  expect(container.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.value).toBe('milh-abc')
  expect(screen.getByText('Filled in')).toBeInTheDocument()
})

test('picking a demo worker fills the tablet key and PIN', async () => {
  stubDemo(true)
  const { container } = render(<MemoryRouter><KioskLogin /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Imran Khan/ }))
  const inputs = container.querySelectorAll<HTMLInputElement>('form input')
  expect(inputs[0].value).toBe('pre.key')
  expect(inputs[1].value).toBe('1234')
})

test('no demo list when the server is not in demo mode', async () => {
  stubDemo(false)
  render(<MemoryRouter><OwnerLogin /></MemoryRouter>)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByLabelText('Demo accounts')).toBeNull()
})
