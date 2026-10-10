import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageCounter } from './message-counter'
import { normalizeSms, smsUnits } from '@/lib/sms-text'
import { normalizeSms as serverNormalize, smsUnits as serverUnits } from '../../../api/src/gateway/pacing/text'

describe('live SMS counter', () => {
  it('includes prefix and updates across standard and Unicode boundaries', () => {
    const { rerender } = render(<MessageCounter joinCode="G" body={'a'.repeat(157)} />)
    expect(screen.getByText(/160 \/ 160 SMS character units/)).toBeInTheDocument()
    rerender(<MessageCounter joinCode="G" body={'a'.repeat(158)} />)
    expect(screen.getByText(/161 \/ 306 SMS character units/)).toBeInTheDocument()
    rerender(<MessageCounter joinCode="G" body={'漢'.repeat(67)} />)
    expect(screen.getByText(/70 \/ 70 SMS character units/)).toBeInTheDocument()
    rerender(<MessageCounter joinCode="G" body={'漢'.repeat(68)} recipients={6} />)
    expect(screen.getByText(/71 \/ 134 SMS character units/)).toBeInTheDocument()
    expect(screen.getByText(/6 recipients × 2 segments = 12 total/)).toBeInTheDocument()
  })
  it('counts normalized punctuation and emoji without rewriting URLs', () => {
    const { rerender } = render(<MessageCounter joinCode="G" body="  “Hi…”  " />)
    expect(screen.getByText(/10 \/ 160 SMS character units/)).toBeInTheDocument()
    expect(screen.getByText(/automatically simplified/)).toBeInTheDocument()
    rerender(<MessageCounter joinCode="G" body="😊" />)
    expect(screen.getByText(/5 \/ 70 SMS character units/)).toBeInTheDocument()
    rerender(<MessageCounter joinCode="G" body="https://example.test/“hi”" />)
    expect(screen.getByText(/Characters using Unicode: “ ”/)).toBeInTheDocument()
  })
  it('matches server normalization and accounting over the Unicode range and boundaries', () => {
    const samples = ['', '“test”—…', 'https://example.test/“a”…', 'www.example.test/é', '^{}€', '👨‍👩‍👧‍👦']
    for (let cp = 0; cp <= 0x10ffff; cp += 127) samples.push(String.fromCodePoint(cp))
    for (const c of ['a', '漢', '😊', '^']) for (const n of [0, 67, 70, 71, 134, 135, 153, 160, 161, 306, 307]) samples.push(c.repeat(n))
    for (const text of samples) {
      expect(normalizeSms(text)).toEqual(serverNormalize(text))
      expect(smsUnits(normalizeSms(text))).toEqual(serverUnits(serverNormalize(text)))
    }
  })
})
