// Test script to validate the reservation system
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testRaceCondition() {
  console.log('Testing race condition in reservation system...');
  
  // Create a test drop with limited inventory
  const testDrop = await prisma.drop.create({
    data: {
      name: 'Test Drop',
      slug: 'test-drop-' + Date.now(),
      location: 'Test Location',
      startsAt: new Date(),
      status: 'LIVE',
      admission: 'OPEN',
      items: {
        create: {
          menuItem: {
              create: {
                name: 'Test Item',
                slug: 'test-item-' + Date.now(),
                description: 'Test item for race condition',
                price: 10000
              }
          },
          capacity: 2, // Only 2 items available
          available: 2
        }
      }
    },
    include: {
      items: {
        include: {
          menuItem: true
        }
      }
    }
  });

  const dropItem = testDrop.items[0];
  const dropId = testDrop.id;
  const dropItemId = dropItem.id;

  console.log(`Created test drop with ID: ${dropId}`);
  console.log(`Drop item ID: ${dropItemId}, Available: ${dropItem.available}`);

  // Simulate multiple concurrent reservations
  const promises = Array.from({ length: 5 }, (_, i) => 
    prisma.$transaction(async (tx) => {
      // Attempt to reserve 1 item
      const updated = await tx.dropItem.updateMany({
        where: { 
          id: dropItemId, 
          available: { gte: 1 } 
        },
        data: {
          available: { decrement: 1 },
          reserved: { increment: 1 }
        }
      });
      
      if (updated.count > 0) {
        console.log(`Reservation ${i+1}: SUCCESS`);
        return true;
      } else {
        console.log(`Reservation ${i+1}: FAILED - Sold out`);
        return false;
      }
    })
  );

  const results = await Promise.allSettled(promises);
  
  // Count successful reservations
  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
  console.log(`\nResults: ${successful} successful reservations out of 5 attempts`);
  
  // Check current inventory
  const currentItem = await prisma.dropItem.findUnique({
    where: { id: dropItemId }
  });
  
  console.log(`Current inventory - Available: ${currentItem.available}, Reserved: ${currentItem.reserved}, Capacity: ${currentItem.capacity}`);
  
  // Clean up
  await prisma.drop.delete({
    where: { id: dropId }
  });
  
  console.log('\nTest completed. If successful reservations > available capacity (2), then race condition exists.');
}

testRaceCondition()
  .catch(console.error)
  .finally(() => prisma.$disconnect());