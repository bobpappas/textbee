import { act, renderHook, waitFor } from '@testing-library/react'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import httpBrowserClient from '@/lib/httpBrowserClient'
import { TestProviders } from '@/test/render'
import {
  HISTORY_REFRESH_INTERVAL_MS,
  useDeviceMessages,
  useWebhookNotifications,
} from './hooks'

const messageEnvelope = (label = 'confirmed') => ({
  data: [{ _id: `message-${label}`, message: label }],
  meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
})

const deliveryEnvelope = {
  data: { data: [{ _id: 'delivery-1' }], meta: { total: 1, totalPages: 1 } },
}

const flushTimers = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
})

describe('history refresh lifecycle', () => {
  it.each([
    {
      name: 'message history',
      response: messageEnvelope(),
      useHistory: () => useDeviceMessages('device-1'),
    },
    {
      name: 'webhook history',
      response: deliveryEnvelope,
      useHistory: () => useWebhookNotifications({}),
    },
  ])(
    '$name polls every 15 seconds, pauses while hidden or offline, and refreshes on return',
    async ({ response, useHistory }) => {
      vi.useFakeTimers()
      focusManager.setFocused(true)
      onlineManager.setOnline(true)
      const get = vi
        .spyOn(httpBrowserClient, 'get')
        .mockResolvedValue({ data: response } as never)

      const { result } = renderHook(
        () => ({ isSuccess: useHistory().isSuccess }),
        { wrapper: TestProviders },
      )
      await flushTimers()
      expect(result.current.isSuccess).toBe(true)
      expect(get).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(HISTORY_REFRESH_INTERVAL_MS)
      })
      expect(get).toHaveBeenCalledTimes(2)

      focusManager.setFocused(false)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(HISTORY_REFRESH_INTERVAL_MS)
      })
      expect(get).toHaveBeenCalledTimes(2)

      focusManager.setFocused(true)
      await flushTimers()
      expect(get).toHaveBeenCalledTimes(3)

      onlineManager.setOnline(false)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(HISTORY_REFRESH_INTERVAL_MS)
      })
      expect(get).toHaveBeenCalledTimes(3)

      onlineManager.setOnline(true)
      await flushTimers()
      expect(get).toHaveBeenCalledTimes(4)
    },
  )

  it('cancels an in-flight history read when its last view unmounts', async () => {
    vi.useFakeTimers()
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    let aborted = false
    const get = vi.spyOn(httpBrowserClient, 'get').mockImplementation(
      (_url, config) =>
        new Promise((_resolve, reject) => {
          config?.signal?.addEventListener?.(
            'abort',
            () => {
              aborted = true
              reject(new DOMException('Cancelled', 'AbortError'))
            },
            { once: true },
          )
        }),
    )

    const { unmount } = renderHook(() => useDeviceMessages('device-1'), {
      wrapper: TestProviders,
    })
    await flushTimers()
    expect(get).toHaveBeenCalledOnce()

    unmount()
    await flushTimers()
    expect(aborted).toBe(true)
  })

  it('retains confirmed rows after a background failure and recovers on retry', async () => {
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    const get = vi
      .spyOn(httpBrowserClient, 'get')
      .mockResolvedValueOnce({ data: messageEnvelope('first') } as never)
      .mockRejectedValueOnce(new Error('temporary refresh failure'))
      .mockResolvedValueOnce({ data: messageEnvelope('recovered') } as never)

    const { result } = renderHook(
      () => useDeviceMessages('device-1', {}, { refetchInterval: false }),
      { wrapper: TestProviders },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data).toEqual([
      { _id: 'message-first', message: 'first' },
    ])

    await act(async () => {
      await result.current.refetch()
    })
    await waitFor(() =>
      expect(result.current.error?.message).toBe('temporary refresh failure'),
    )
    expect(result.current.data?.data).toEqual([
      { _id: 'message-first', message: 'first' },
    ])

    await act(async () => {
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data).toEqual([
      { _id: 'message-recovered', message: 'recovered' },
    ])
  })
})
