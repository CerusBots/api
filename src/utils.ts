import { promises as dns } from 'dns'
import { isIPv4, isIPv6 } from 'net'
import { utcToZonedTime } from 'date-fns-tz'
import ipaddr from 'ipaddr.js'
import config from './config'

const ipClassesV4: Record<string, [string, string]> = {
  A: ['10.0.0.0', '10.255.255.255'],
  B: ['172.16.0.0', '172.31.255.255'],
  C: ['192.168.0.0', '192.168.255.255'],
}
const ipClassesV6: Record<string, [string, string]> = {
  A: ['fc00::/7', 'fc00::/8'],
}

export function nowUTC(): Date {
  return utcToZonedTime(new Date(), 'Etc/UTC')
}

export function nowLocal(): Date {
  return utcToZonedTime(nowUTC(), config.timezone)
}

export function parseIP(addr: string) {
  try {
    return ipaddr.parse(addr)
  } catch (e) {
    return ipaddr.parseCIDR(addr)[0]
  }
}

export function ltArray(a: number[], b: number[]) {
  if (a.length != b.length) throw new Error('Array lengths do not match')
  for (let i = 0; i < a.length; i++) {
    if (!(a[i] < b[i])) return false
  }
  return true
}

export async function isLocalDomain(domain: string) {
  const resolveV4 = async () => {
    try {
      const ip = await dns.resolve4(domain)
      return Object.fromEntries(ip.map((addr) => [addr, isLocalIP(addr)]))
    } catch (e: any) {
      if (e.code !== 'ENODATA') {
        throw e
      }
    }
  }
  const resolveV6 = async () => {
    try {
      const ip = await dns.resolve6(domain)
      return Object.fromEntries(ip.map((addr) => [addr, isLocalIP(addr)]))
    } catch (e: any) {
      if (e.code !== 'ENODATA') {
        throw e
      }
    }
  }
  return {
    ...(await resolveV4()),
    ...(await resolveV6()),
  }
}

export function isLocalIP(ip: string) {
  const addr = ipaddr.parse(ip)
  if (
    addr.range() === 'private' ||
    addr.range() === 'loopback' ||
    addr.range().endsWith('Local')
  )
    return true
  if (isIPv4(ip)) {
    if (ip === '0.0.0.0') return true
    if (ip === '127.0.0.1') return true
    return (
      Object.values(ipClassesV4).findIndex(([start, end]) => {
        const startAddr = ipaddr.parse(start)
        const endAddr = ipaddr.parse(end)
        return (
          ltArray(addr.toByteArray(), startAddr.toByteArray()) &&
          ltArray(addr.toByteArray(), endAddr.toByteArray())
        )
      }) > -1
    )
  } else if (isIPv6(ip)) {
    if (ip === '::1/128') return true
    if (ip === '0:0:0:0:0:0:0:1') return true
    return (
      Object.values(ipClassesV6).findIndex(([start, end]) => {
        const startAddr = parseIP(start)
        const endAddr = parseIP(end)
        return (
          ltArray(addr.toByteArray(), startAddr.toByteArray()) &&
          ltArray(addr.toByteArray(), endAddr.toByteArray())
        )
      }) > -1
    )
  }
  return true
}
