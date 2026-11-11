import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      code: 'unauthorized',
      message: 'Authentication token is required or invalid',
    });
  }
}

export function getCallerUser(req: FastifyRequest): AuthUser {
  return req.user as AuthUser;
}
