// Fetches and displays the 5 most recently updated boxes from the database, ordered by their update time.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatest() {
    try {
        const boxes = await prisma.box.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 5
        });
        console.log("Latest 5 Boxes:");
        boxes.forEach(b => {
            console.log(`Box ID: ${b.id}`);
            console.log(`Name: ${b.name}`);
            console.log(`Image URL: ${b.imageUrl}`);
            console.log(`Updated At: ${b.updatedAt}`);
            console.log("-------------------");
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
checkLatest();
