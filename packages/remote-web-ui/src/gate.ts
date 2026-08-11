/**
 * The `api/gate` listener: application-level access control layered on top
 * of the transport fence (the fence is Host/Origin based and explicitly not
 * an authentication layer — packages/client/connection documents this
 * event as the sanctioned seam for pairing/revocation).
 *
 * Policy: loopback requests (the desktop) pass without a device identity;
 * every non-loopback /api request must carry a live, non-revoked device
 * cookie. This makes the QR the only way into a LAN-exposed dsh web and
 * gives "停止" real teeth: revoked devices 403 on their next request,
 * including the mux/SSE stream (which then dies on reconnect).
 */

import type { IncomingMessage } from 'node:http'
import type { PairingService } from './pairing.ts'

/**
 * Whether a normalized URL hostname names the local loopback authority.
 * Semantics mirror the connection package's internal predicate (localhost,
 * IPv6 loopback, any IPv4 address in 127/8); it is reimplemented here because
 * the connection package no longer exports it — the fence now lives inside
 * the connection plugin, and external host plugins only need the
 * classification, not the whole trust decision.
 * @param hostname - WHATWG URL hostname (IPv6 literals retain brackets).
 * @returns true for localhost, IPv6 loopback, or any IPv4 address in 127/8.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Read one cookie value from a Cookie header.
 * @param header - the raw Cookie header value (or undefined).
 * @param name - the cookie name.
 * @returns the value, or undefined when absent.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (key === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/**
 * The effective Host hostname of a request.
 * @param request - node HTTP request.
 * @returns the normalized hostname, or undefined when unparsable.
 */
export function hostnameOf(request: IncomingMessage): string | undefined {
  const host = request.headers.host
  if (typeof host !== 'string') return undefined
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

/**
 * Build the api/gate listener for one pairing service.
 * @param service - the pairing service.
 * @param requirePairingForLan - when false, non-loopback requests pass
 * without a device cookie (the feature then only manages tokens/status;
 * revocation of paired devices still holds). Defaults to true.
 * @returns the cordis waterfall listener: call `next()` to delegate,
 * return false (without calling it) to veto with 403.
 */
export function makeGateListener(
  service: PairingService,
  requirePairingForLan = true,
): (request: IncomingMessage, method: string | undefined, next: () => boolean | Promise<boolean>) => boolean | Promise<boolean> {
  return (request, _method, next) => {
    const hostname = hostnameOf(request)
    if (hostname === undefined) return false
    if (isLoopbackHostname(hostname)) return next()
    if (!requirePairingForLan) return next()
    const deviceId = readCookie(request.headers.cookie, service.config.cookieName)
    if (deviceId === undefined) return false
    return service.touchDevice(deviceId) ? next() : false
  }
}
