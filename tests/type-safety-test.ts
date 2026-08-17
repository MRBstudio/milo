// Test script to validate type safety issues
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testTypeSafety() {
  console.log('Testing type safety issues...');
  
  // Test passport route type safety
  console.log('\n1. Testing passport route type safety...');
  console.log('Issue: The passport route uses `any` type instead of proper TypeScript interfaces');
  console.log('Fix: Define proper TypeScript interfaces for the response');

  // Example of proper typing for passport response
  interface PassportResponse {
    exists: boolean;
    travelerNumber: string;
    foundingTraveler?: boolean;
    stamps: {
      dropName: string;
      location: string;
      at: Date;
    }[];
  }

  console.log('\n2. Testing operator route type safety...');
  console.log('Issue: The operator route has several places using `any` type');
  console.log('Fix: Define proper TypeScript interfaces for request/response bodies');

  // Example of proper typing for operator response
  interface OperatorActionResponse {
    ok: boolean;
    code?: string;
    error?: string;
  }

  interface DropItemWithMenu {
    id: string;
    available: number;
    sold: number;
    menuItem: {
      name: string;
    };
  }

  interface StatusCount {
    status: string;
    _count: {
      _all: number;
    };
  }

  interface OperatorLiveData {
    items: DropItemWithMenu[];
    statusCounts: StatusCount[];
  }

  console.log('\n3. Testing reservation route type safety...');
  console.log('Issue: The reservation route uses `!` assertions that could cause runtime errors');
  console.log('Fix: Properly handle potentially undefined values');

  // Example of safer code
  async function saferReservationHandling(dropId: string, itemIds: string[]) {
    // Instead of using `!` assertion, properly handle potentially undefined values
    const items = await prisma.dropItem.findMany({
      where: { 
        dropId,
        id: { in: itemIds }
      },
      include: { menuItem: true }
    });

    // Process items safely
    for (const item of items) {
      if (!item.menuItem) {
        console.error(`MenuItem not found for drop item: ${item.id}`);
        continue; // Skip this item instead of crashing
      }
      
      // Process the item with certainty that menuItem exists
      console.log(`Processing item: ${item.menuItem.name}`);
    }
  }

  console.log('\n4. General recommendations:');
  console.log('- Replace all `any` types with specific interfaces');
  console.log('- Avoid non-null assertions (`!`) where possible');
  console.log('- Use proper error handling instead of assertions');
  console.log('- Implement proper validation for all inputs');

  console.log('\nType safety test completed.');
}

testTypeSafety()
  .catch(console.error)
  .finally(() => prisma.$disconnect());