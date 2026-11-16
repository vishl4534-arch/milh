import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { VoiceMode } from './VoiceMode'
import * as api from './api'

afterEach(() => vi.restoreAllMocks())

const pending = { action: 'mark_done', farm_id: 'f1', plan_id: 'p1', block_id: 'b3', block_name: 'Block 3' }

test('a pending done shows tick and cross, and the tick sends yes with the pending context', async () => {
  vi.spyOn(api, 'fetchLines').mockResolvedValue({})
  const askText = vi.spyOn(api, 'askText')
    .mockResolvedValueOnce({ ok: true, transcript: 'block 3 done', reply: 'Block 3: mark as done? Say yes or tap the tick.',
      audio_url: null, pending, context: { pending }, resume: false })
    .mockResolvedValueOnce({ ok: true, transcript: 'yes', reply: 'Done. Block 3 is marked as watered today.',
      audio_url: null, pending: null, context: {}, resume: false })
  render(<VoiceMode lang="en" onClose={vi.fn()} />)
  fireEvent.change(await screen.findByPlaceholderText('Type a question'), { target: { value: 'block 3 done' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Ask' }))
  const tick = await screen.findByRole('button', { name: 'Yes' })
  expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument()
  fireEvent.click(tick)
  await waitFor(() => expect(askText).toHaveBeenCalledTimes(2))
  expect(askText.mock.calls[1][0]).toMatchObject({ question: 'yes', context: { pending } })
  expect(await screen.findByText(/marked as watered/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
})

test('without a microphone it says so and still offers typing', async () => {
  vi.spyOn(api, 'fetchLines').mockResolvedValue({})
  render(<VoiceMode lang="en" onClose={vi.fn()} />)
  expect(await screen.findByText(/microphone is off/i)).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Type a question')).toBeInTheDocument()
})
