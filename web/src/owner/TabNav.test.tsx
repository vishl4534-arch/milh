import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { TabNav } from './TabNav'

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/owner/farms/:farmId/*" element={<TabNav farmId="f1" alerts={0} />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('tab links stay absolute from any tab', () => {
  at('/owner/farms/f1/salt')
  expect(screen.getByRole('link', { name: 'Add data' })).toHaveAttribute('href', '/owner/farms/f1/data')
  expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/owner/farms/f1')
})

test('only the open tab is marked current', () => {
  at('/owner/farms/f1/salt')
  expect(screen.getByRole('link', { name: 'Salt clock' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
})
