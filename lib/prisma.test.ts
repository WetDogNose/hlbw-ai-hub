import prisma from './prisma';

describe('Prisma Client', () => {
  it('should be defined', () => {
    expect(prisma).toBeDefined();
  });

  it('should act as a singleton across global object', () => {
    const p1 = globalThis.prismaGlobal || prisma;
    expect(p1).toBeDefined();
  });
});
