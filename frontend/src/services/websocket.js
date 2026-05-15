import { useCallback, useEffect, useRef, useState } from 'react'

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export class AuctionWebSocket {
  constructor(auctionId, onMessage, onConnect, onDisconnect) {
    this.auctionId = auctionId
    this.onMessage = onMessage
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.ws = null
    this.reconnectAttempt = 0
    this.lastSeq = '0'
    this.clientBidId = null
    this._closed = false
    this._pingTimer = null
  }

  connect() {
    if (this._closed) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/auctions/${this.auctionId}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempt = 0
      if (this.onConnect) this.onConnect()
      // Send resume if reconnecting
      if (this.lastSeq !== '0') {
        this.send({ type: 'resume', last_seq: this.lastSeq })
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'ping') {
          this.send({ type: 'pong' })
          return
        }
        if (msg.seq) {
          this.lastSeq = String(msg.seq)
        }
        if (this.onMessage) this.onMessage(msg)
      } catch (e) {
        console.error('WS parse error', e)
      }
    }

    this.ws.onclose = () => {
      if (this.onDisconnect) this.onDisconnect()
      this._scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      console.error('WS error', err)
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  bid(amount) {
    const clientBidId = crypto.randomUUID()
    this.clientBidId = clientBidId
    this.send({
      type: 'bid',
      client_bid_id: clientBidId,
      amount: amount,
    })
    return clientBidId
  }

  _scheduleReconnect() {
    if (this._closed) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt += 1
    setTimeout(() => this.connect(), delay + Math.random() * 1000) // jitter
  }

  close() {
    this._closed = true
    if (this.ws) {
      this.ws.close()
    }
  }
}

export function useAuctionWebSocket(auctionId, { enabled = true } = {}) {
  const [connected, setConnected] = useState(false)
  const [price, setPrice] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [leaderId, setLeaderId] = useState(null)
  const [messages, setMessages] = useState([])
  const wsRef = useRef(null)

  useEffect(() => {
    if (!auctionId || !enabled) return

    const ws = new AuctionWebSocket(
      auctionId,
      (msg) => {
        setMessages((prev) => [...prev.slice(-50), msg])
        if (msg.type === 'price_update' || msg.type === 'snapshot') {
          setPrice(msg.current_price)
          setEndTime(msg.end_time)
          setLeaderId(msg.leader_id)
        }
      },
      () => setConnected(true),
      () => setConnected(false),
    )

    ws.connect()
    wsRef.current = ws

    return () => ws.close()
  }, [auctionId, enabled])

  const placeBid = useCallback((amount) => {
    if (wsRef.current) {
      wsRef.current.bid(amount)
    }
  }, [])

  return { connected, price, endTime, leaderId, messages, placeBid }
}
