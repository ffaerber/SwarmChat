import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import WebSocket from 'ws'
import { startMockBee, MockBeeBroker } from '../mock-bee'

const TOPIC_INBOX = 'a'.repeat(64) // any 32-byte hex; bee-js hashes topic strings to this shape

async function buyStamp(beeUrl: string): Promise<string> {
  const res = await fetch(`${beeUrl}/stamps/100000/20`, { method: 'POST' })
  const json = await res.json()
  return json.batchID
}

async function pssSend(
  beeUrl: string,
  topic: string,
  target: string,
  recipientPubKey: string,
  batchId: string,
  data: string | Uint8Array,
) {
  const res = await fetch(
    `${beeUrl}/pss/send/${topic}/${target}?recipient=${recipientPubKey}`,
    {
      method: 'POST',
      headers: {
        'Swarm-Postage-Batch-Id': batchId,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    },
  )
  if (!res.ok) throw new Error(`pss/send failed: ${res.status} ${await res.text()}`)
}

function subscribe(wsUrl: string): Promise<{ ws: WebSocket; next: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const queue: string[] = []
    const waiters: Array<(v: string) => void> = []

    ws.on('message', data => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
      const w = waiters.shift()
      if (w) w(text)
      else queue.push(text)
    })
    ws.on('open', () => {
      resolve({
        ws,
        next: () =>
          new Promise<string>(res => {
            const v = queue.shift()
            if (v !== undefined) res(v)
            else waiters.push(res)
          }),
      })
    })
    ws.on('error', err => reject(err))
  })
}

describe('mock-bee', () => {
  let broker: MockBeeBroker

  beforeEach(async () => {
    broker = await startMockBee({ nodes: ['alice', 'bob'] })
  })
  afterEach(async () => {
    await broker.stop()
  })

  it('serves /addresses with a stable overlay and pss key per node', async () => {
    const res = await fetch(`${broker.url('alice')}/addresses`).then(r => r.json())
    expect(res.overlay).toMatch(/^0x[0-9a-f]{64}$/)
    expect(res.pssPublicKey).toMatch(/^0x[0-9a-f]{66}$/)

    // Same node id should produce the same identity across restarts.
    const fresh = await startMockBee({ nodes: ['alice'] })
    const again = await fetch(`${fresh.url('alice')}/addresses`).then(r => r.json())
    expect(again.overlay).toBe(res.overlay)
    expect(again.pssPublicKey).toBe(res.pssPublicKey)
    await fresh.stop()
  })

  it('mints usable stamps via /stamps/:amount/:depth', async () => {
    const batchID = await buyStamp(broker.url('alice'))
    expect(batchID).toMatch(/^[0-9a-f]{64}$/)

    const list = await fetch(`${broker.url('alice')}/stamps`).then(r => r.json())
    expect(list.stamps).toHaveLength(1)
    expect(list.stamps[0].usable).toBe(true)
    expect(list.stamps[0].batchID).toBe(batchID)
  })

  it('routes a PSS message from alice to bob', async () => {
    const bob = broker.node('bob')
    const target = bob.overlay.slice(2, 6) // first 2 bytes
    const recipient = bob.pssPublicKey.slice(2)

    const sub = await subscribe(broker.wsUrl('bob', TOPIC_INBOX))
    const batch = await buyStamp(broker.url('alice'))
    await pssSend(broker.url('alice'), TOPIC_INBOX, target, recipient, batch, 'hello bob')

    expect(await sub.next()).toBe('hello bob')
    sub.ws.close()
  })

  it('does not deliver to a node outside the target neighborhood', async () => {
    await broker.addNode('carol')
    const bob = broker.node('bob')
    const target = bob.overlay.slice(2, 6)

    const carolSub = await subscribe(broker.wsUrl('carol', TOPIC_INBOX))
    let carolGot = false
    carolSub.next().then(() => { carolGot = true })

    const batch = await buyStamp(broker.url('alice'))
    await pssSend(broker.url('alice'), TOPIC_INBOX, target, '00', batch, 'should miss carol')

    await new Promise(r => setTimeout(r, 50))
    expect(carolGot).toBe(false)
    carolSub.ws.close()
  })

  it('does not deliver to subscribers on a different topic', async () => {
    const bob = broker.node('bob')
    const target = bob.overlay.slice(2, 6)
    const recipient = bob.pssPublicKey.slice(2)

    const sub = await subscribe(broker.wsUrl('bob', 'b'.repeat(64))) // wrong topic
    let got = false
    sub.next().then(() => { got = true })

    const batch = await buyStamp(broker.url('alice'))
    await pssSend(broker.url('alice'), TOPIC_INBOX, target, recipient, batch, 'wrong-topic')

    await new Promise(r => setTimeout(r, 50))
    expect(got).toBe(false)
    sub.ws.close()
  })

  it('delivers messages in order to a single subscriber', async () => {
    const bob = broker.node('bob')
    const target = bob.overlay.slice(2, 6)
    const recipient = bob.pssPublicKey.slice(2)

    const sub = await subscribe(broker.wsUrl('bob', TOPIC_INBOX))
    const batch = await buyStamp(broker.url('alice'))

    for (const msg of ['one', 'two', 'three']) {
      await pssSend(broker.url('alice'), TOPIC_INBOX, target, recipient, batch, msg)
    }

    expect(await sub.next()).toBe('one')
    expect(await sub.next()).toBe('two')
    expect(await sub.next()).toBe('three')
    sub.ws.close()
  })
})
