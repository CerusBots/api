import { NextFunction, Request, Response } from 'express'
import { EntityManager } from '@mikro-orm/mariadb'
import { BaseMessage } from '@cerusbots/common/dist/http/message'
import Bot from '../../../../database/entities/bot'
import { HttpUnauthorizedError } from '../../../exceptions'
import ac from '../../../../rbac/sys'
import { DI } from '../../../../di'
import { botsCreatedCounter } from '../../../../metrics/bot'

export default function genController() {
  return {
    create: (req: Request, res: Response, next: NextFunction) => {
      try {
        if (typeof req.auth !== 'object')
          throw new Error('Unable to retreive auth')
        if (typeof req.auth.user !== 'object')
          throw new Error('Unable to retreive user')

        const perm = ac.can(req.auth.user.type).createOwn('bot')

        if (perm.granted) {
          const { token, intents, isPublic } = req.body as {
            token: string
            intents?: string[]
            isPublic?: boolean
          }

          const em = DI.db.em.fork() as EntityManager
          const run = async () => {
            const bot = await em.findOne(Bot, {
              token: token,
            })

            if (bot === null) {
              const bot = new Bot(
                token as string,
                intents as string[],
                isPublic as boolean
              )
              await em.persistAndFlush(bot)
              botsCreatedCounter.inc({ id: bot.id })
              return bot
            } else {
              if (typeof intents === 'object') bot.intents = intents
              if (typeof isPublic === 'boolean') bot.isPublic = isPublic
              if (bot.deletedAt !== null) bot.deletedAt = undefined

              await em.persistAndFlush(bot)
              return bot
            }
          }

          run()
            .then((bot) => {
              res.json(
                new BaseMessage(
                  {
                    ...bot.transform(),
                    token: bot.token,
                  },
                  'bot:create'
                )
              )
              next()
            })
            .catch((e) => next(e))
        } else {
          throw new HttpUnauthorizedError(
            'User does not have permission to create bots'
          )
        }
      } catch (e) {
        next(e)
      }
    },
  }
}