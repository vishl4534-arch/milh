import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders app name', () => {
  render(<App />)
  expect(screen.getByText('Milh')).toBeInTheDocument()
})
