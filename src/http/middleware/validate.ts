import { NextFunction, Request, Response } from 'express'
import { Schema, validate } from 'jsonschema'
import { HttpValidationError } from '../exceptions'

type GetDataFunction = (req: Request) => object

const validateRequest = (getData: GetDataFunction) => (schema: Schema) => {
  return function notFoundHandler(
    req: Request,
    _res: Response | null,
    next: NextFunction
  ) {
    const v = validate(getData(req), schema)

    if (v.valid) {
      next()
    } else {
      next(new HttpValidationError(v.errors))
    }
  }
}

export const validateBody = validateRequest((req) => req.body)
export const validateQuery = validateRequest((req) => req.query)
