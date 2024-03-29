import { EntityManager } from '@mikro-orm/mariadb'
import { WebsocketRequestHandler } from 'express-ws'
import { NextFunction, Request, Response } from 'express'
import Prometheus from 'prom-client'
import { HttpUnauthorizedError } from '../../exceptions'
import { BaseMessage } from '@cerusbots/common/dist/http/message'
import DatabaseAudit from '../../../database/entities/databaseaudit'
import { DI } from '../../../di'
import { isLocalIP } from '../../../utils'

export default function genController() {
  return {
    events: ((ws, req, next) => {
      try {
        const { resource } = req.params

        const send = (msg: any) =>
          ws.send(JSON.stringify(new BaseMessage(msg, 'admin:event').toJSON()))

        ws.on('close', () => next())
        ws.on('message', () => {
          ws.close()
          next()
        })

        const kafkaResource = (topic: string) => {
          const run = async () => {
            const consumer = DI.kafka.consumer({
              groupId: `admin-event`,
            })
            await consumer.connect()
            await consumer.subscribe({ topic })
            await consumer.run({
              eachMessage: async ({ message }) => {
                send({
                  timestamp: parseInt(message.timestamp),
                  value: message.value?.toString('utf8'),
                })
              },
            })
          }

          run().catch((e) => {
            ws.send(JSON.stringify(new BaseMessage(null, e)))
            ws.close()
            next()
          })
        }

        switch (resource) {
          case 'database':
            kafkaResource('cerus-database')
            break
          case 'logger':
            kafkaResource('cerus-logger')
            break
          default:
            ws.close()
            next()
            break
        }
      } catch (e) {
        ws.send(
          JSON.stringify(
            new BaseMessage(
              null,
              e instanceof Error ? e : new Error(e as string)
            )
          )
        )
        ws.close()
        next()
      }
    }) as WebsocketRequestHandler,
    audit: (req: Request, res: Response, next: NextFunction) => {
      try {
        const { resource } = req.params
        const offset = parseInt((req.query.offset as string) || '0')
        const limit = parseInt((req.query.limit as string) || '5')
        const order =
          typeof req.query.order === 'string' ? req.query.order : 'asc'

        switch (resource) {
          case 'database':
            const run = async () => {
              const em = DI.db.em.fork() as EntityManager

              const [audits, count] = await em.findAndCount(
                DatabaseAudit,
                {},
                {
                  offset,
                  limit,
                  orderBy: {
                    createdAt: order,
                  },
                }
              )

              res.json(
                new BaseMessage(
                  {
                    query: {
                      kind: resource,
                      offset,
                      limit,
                      order,
                    },
                    count,
                    resources: audits.map((a) => a.toJSON()),
                  },
                  'admin:audit'
                )
              )
            }

            run().catch((e) => next(e))
            break
          default:
            next()
            break
        }
      } catch (e) {
        next(e)
      }
    },
    metrics: (req: Request, res: Response, next: NextFunction) => {
      const remoteAddress = (req.socket.remoteAddress as string).replace(
        '::ffff:',
        ''
      )

      try {
        if (!isLocalIP(remoteAddress)) {
          throw new HttpUnauthorizedError(
            'Must be send through the prometheus server'
          )
        }

        res.set('Content-Type', Prometheus.register.contentType)
        Prometheus.register
          .metrics()
          .then((v) => res.send(v))
          .catch((e) => next(e))
      } catch (e) {
        next(e)
      }
    },
  }
}
