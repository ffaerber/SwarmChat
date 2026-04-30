import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { AddressInfo } from 'net'

export interface MockNode {
  id: string
  port: number
  url: string
  overlay: string        // 0x + 64 hex (32 bytes)
  pssPublicKey: string   // 0x + 66 hex (33 bytes, secp256k1 compressed-style)
  ethereumAddress: string
}

interface Subscription {
  nodeId: string
  topicHex: string       // 64 hex (no 0x), lowercase
  ws: WebSocket
}

interface Stamp {
  batchID: string
  utilization: number
  usable: boolean
  label: string
  depth: number
  amount: string
  bucketDepth: number
  blockNumber: number
  immutableFlag: boolean
  exists: boolean
  batchTTL: number
}

/**
 * In-memory broker that simulates a small Swarm cluster. Each "node" runs its
 * own HTTP+WebSocket server so frontend code can point a `Bee` instance at it
 * exactly as it would a real bee. PSS routing is mimicked: a message sent with
 * a target prefix is delivered only to subscribers whose node overlay starts
 * with that prefix and whose subscribed topic matches.
 */
export class MockBeeBroker {
  private nodes = new Map<string, MockNode>()
  private servers = new Map<string, Server>()
  private subs: Subscription[] = []
  private stamps = new Map<string, Stamp[]>()
  /** Shared content store; references are global like in the real network. */
  private bzz = new Map<string, { body: Buffer; contentType: string; name: string }>()

  async addNode(id: string): Promise<MockNode> {
    if (this.nodes.has(id)) throw new Error(`node "${id}" already exists`)

    // Deterministic identity per id so tests are reproducible.
    const seed = createHash('sha256').update(id).digest()
    const overlay = '0x' + seed.toString('hex')
    const pssPublicKey = '0x02' + seed.toString('hex')
    const ethereumAddress = '0x' + seed.subarray(0, 20).toString('hex')

    const app = express()
    app.use(express.raw({ type: '*/*', limit: '4mb' }))

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', version: 'mock-bee/0.0.1' })
    })

    app.get('/readiness', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.get('/addresses', (_req, res) => {
      res.json({
        overlay,
        pssPublicKey,
        ethereum: ethereumAddress,
        publicKey: pssPublicKey,
        underlay: [`/ip4/127.0.0.1/tcp/0/p2p/${id}`],
      })
    })

    app.get('/topology', (_req, res) => {
      res.json({
        baseAddr: overlay,
        population: this.nodes.size,
        connected: Math.max(0, this.nodes.size - 1),
        depth: 0,
        nnLowWatermark: 1,
        timestamp: new Date().toISOString(),
        bins: {},
      })
    })

    app.get('/stamps', (_req, res) => {
      res.json({ stamps: this.stamps.get(id) ?? [] })
    })

    app.get('/stamps/:batchID', (req, res) => {
      const list = this.stamps.get(id) ?? []
      const found = list.find(s => s.batchID === req.params.batchID)
      if (!found) return res.status(404).json({ message: 'not found' })
      res.json(found)
    })

    app.post('/stamps/:amount/:depth', (req, res) => {
      const stamp: Stamp = {
        batchID: randomBytes(32).toString('hex'),
        utilization: 0,
        usable: true,
        label: typeof req.query.label === 'string' ? req.query.label : '',
        depth: Number(req.params.depth),
        amount: String(req.params.amount),
        bucketDepth: 16,
        blockNumber: 0,
        immutableFlag: false,
        exists: true,
        batchTTL: 30 * 24 * 3600,
      }
      const list = this.stamps.get(id) ?? []
      list.push(stamp)
      this.stamps.set(id, list)
      res.json({ batchID: stamp.batchID })
    })

    app.post('/pss/send/:topic/:target', (req, res) => {
      const { topic, target } = req.params
      const body = req.body as Buffer
      this.deliver(topic, target, body)
      res.json({})
    })

    // Minimal /bzz upload+download. Real bee chunks + manifests files; the
    // mock just stores the bytes verbatim and returns a deterministic
    // reference (sha256 of the body, doubled for encrypted uploads to match
    // bee's hash+key encoding length).
    app.post('/bzz', (req, res) => {
      const body = req.body as Buffer
      // bee-js sends swarm-encrypt as a request header (lowercase in Express).
      const encrypt = req.headers['swarm-encrypt'] === 'true'
      const hash = createHash('sha256').update(body).digest('hex')
      const ref = encrypt ? hash + hash : hash
      const contentType = (req.headers['content-type'] as string | undefined)
        ?? 'application/octet-stream'
      const name = typeof req.query.name === 'string' ? req.query.name : 'file'
      this.bzz.set(ref, { body, contentType, name })
      res.json({ reference: ref })
    })

    const serveBzz = (req: express.Request, res: express.Response) => {
      const ref = req.params.ref.toLowerCase()
      const entry = this.bzz.get(ref)
      if (!entry) return res.status(404).end()
      res.setHeader('Content-Type', entry.contentType)
      res.setHeader('Content-Disposition', `attachment; filename="${entry.name}"`)
      res.send(entry.body)
    }
    app.get('/bzz/:ref', serveBzz)
    app.get('/bzz/:ref/', serveBzz)
    app.get('/bzz/:ref/*', serveBzz)

    const server = createServer(app)
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const m = url.pathname.match(/^\/pss\/subscribe\/([0-9a-fA-F]+)$/)
      if (!m) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket as any, head, ws => {
        const sub: Subscription = { nodeId: id, topicHex: m[1].toLowerCase(), ws }
        this.subs.push(sub)
        ws.on('close', () => {
          this.subs = this.subs.filter(s => s !== sub)
        })
        ws.on('error', () => { /* swallow */ })
      })
    })

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const url = `http://127.0.0.1:${port}`

    const node: MockNode = { id, port, url, overlay, pssPublicKey, ethereumAddress }
    this.nodes.set(id, node)
    this.servers.set(id, server)
    this.stamps.set(id, [])
    return node
  }

  private deliver(topicHex: string, targetHex: string, data: Buffer) {
    const topic = topicHex.toLowerCase()
    const target = targetHex.toLowerCase()

    for (const sub of this.subs) {
      if (sub.topicHex !== topic) continue
      const node = this.nodes.get(sub.nodeId)
      if (!node) continue
      const overlayHex = node.overlay.slice(2).toLowerCase()
      if (target.length > 0 && !overlayHex.startsWith(target)) continue
      try {
        sub.ws.send(data)
      } catch {
        /* connection dropped between match and send */
      }
    }
  }

  url(id: string): string {
    return this.requireNode(id).url
  }

  node(id: string): MockNode {
    return this.requireNode(id)
  }

  wsUrl(id: string, topicHex: string): string {
    return `ws://127.0.0.1:${this.requireNode(id).port}/pss/subscribe/${topicHex}`
  }

  private requireNode(id: string): MockNode {
    const n = this.nodes.get(id)
    if (!n) throw new Error(`unknown node: ${id}`)
    return n
  }

  async stop(): Promise<void> {
    for (const sub of this.subs) {
      try { sub.ws.close() } catch { /* */ }
    }
    this.subs = []
    await Promise.all(
      [...this.servers.values()].map(
        s => new Promise<void>(resolve => s.close(() => resolve())),
      ),
    )
    this.servers.clear()
    this.nodes.clear()
    this.stamps.clear()
  }
}

export async function startMockBee(opts: { nodes?: string[] } = {}): Promise<MockBeeBroker> {
  const broker = new MockBeeBroker()
  for (const id of opts.nodes ?? ['alice', 'bob']) {
    await broker.addNode(id)
  }
  return broker
}
