import prisma from '../src/config/db.js';

const main = async () => {
  const result = await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log('Database connection OK:', result[0]);
};

main()
  .catch((error) => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
