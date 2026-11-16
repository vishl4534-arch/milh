import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { LabReport } from './LabReport'
import type { Block } from '../api/types'

afterEach(() => vi.unstubAllGlobals())
const blocks = [{ id: 'b1', name: 'Block 1' }, { id: 'b2', name: 'Block 2' }] as unknown as Block[]

test('shows extracted values and saves only what the owner confirms', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/lab-report')) {
      return new Response(JSON.stringify({ attachment_path: 'uploads/a.png', extract: {
        tested_on: '2026-11-10', lab: 'Central Lab', water: [],
        samples: [{ label: 'Plot B', ece: 3.1, ec_1to5: null, ph: 8, moisture_vwc: null }] } }))
    }
    return new Response(JSON.stringify({ id: 's1' }), { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<LabReport farmId="f1" blocks={blocks} />)
  fireEvent.change(screen.getByLabelText(/Lab report photo or PDF/), {
    target: { files: [new File(['x'], 'lab.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Read report' }))
  await waitFor(() => expect(screen.getByDisplayValue('3.1')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Block for Plot B'), { target: { value: 'b2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed values' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
  expect(url).toContain('/soil-tests?via=lab_report')
  expect(JSON.parse(String(init.body))).toMatchObject({ block_id: 'b2', ece: 3.1, ph: 8, attachment_path: 'uploads/a.png' })
})
