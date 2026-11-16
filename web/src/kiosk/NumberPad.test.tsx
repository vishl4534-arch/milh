import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { NumberPad } from './NumberPad'

function Harness({ max = 60, decimals = 2 }: { max?: number; decimals?: number }) {
  const [v, setV] = useState('')
  return (
    <>
      <NumberPad value={v} onChange={setV} max={max} decimals={decimals} />
      <output data-testid="out">{v}</output>
    </>
  )
}

const press = (k: string) => fireEvent.click(screen.getByRole('button', { name: k }))

test('rejects value above max and more decimals', () => {
  render(<Harness max={60} decimals={2} />)
  press('3'); press('.'); press('6'); press('5'); press('9')
  expect(screen.getByTestId('out').textContent).toBe('3.65')
  press('⌫'); press('⌫'); press('⌫'); press('⌫')
  press('9'); press('9')
  expect(screen.getByTestId('out').textContent).toBe('9')
})

test('only one decimal point', () => {
  render(<Harness />)
  press('1'); press('.'); press('.'); press('5')
  expect(screen.getByTestId('out').textContent).toBe('1.5')
})
