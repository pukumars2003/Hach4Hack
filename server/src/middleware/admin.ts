import { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({
      code: 'unauthorized',
      message: 'Authentication token is required or invalid',
    });
  }

  if ((req.user as { role?: string } | undefined)?.role !== 'admin') {
    return reply.status(403).send({
      code: 'forbidden',
      message: 'Admin access required.',
    });
  }
}
