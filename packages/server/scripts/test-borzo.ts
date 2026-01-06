/**
 * Borzo API Test Script
 * Tests the Borzo test platform before requesting production access
 *
 * Run with: npx ts-node scripts/test-borzo.ts
 */

const BORZO_TEST_URL = 'https://robotapitest-in.borzodelivery.com/api/business/1.6';
const BORZO_AUTH_TOKEN = '3EE9F74425116CC5EBB0EF08ECD0BAEB24C92F01';

// Test addresses in India (Mumbai area)
const TEST_PICKUP = {
  address: 'Andheri East, Mumbai, Maharashtra 400069',
  phone: '+919876543210',
  name: 'Test Pharmacy',
};

const TEST_DELIVERY = {
  address: 'Bandra West, Mumbai, Maharashtra 400050',
  phone: '+919876543211',
  name: 'Test Customer',
};

interface BorzoResponse {
  is_successful: boolean;
  order?: any;
  orders?: any[];
  errors?: string[];
  parameter_errors?: Record<string, string[]>;
}

async function borzoRequest(endpoint: string, method: 'GET' | 'POST', body?: any): Promise<BorzoResponse> {
  const url = `${BORZO_TEST_URL}${endpoint}`;

  console.log(`\n📤 ${method} ${endpoint}`);
  if (body) {
    console.log('   Request:', JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-DV-Auth-Token': BORZO_AUTH_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as BorzoResponse;

  if (data.is_successful) {
    console.log('   ✅ Success');
  } else {
    console.log('   ❌ Failed');
    if (data.errors) console.log('   Errors:', data.errors);
    if (data.parameter_errors) console.log('   Parameter Errors:', data.parameter_errors);
  }

  return data;
}

async function testCalculatePrice() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Calculate Delivery Price');
  console.log('='.repeat(60));

  const result = await borzoRequest('/calculate-order', 'POST', {
    matter: 'Medicines',
    vehicle_type_id: 8, // Bike
    points: [
      {
        address: TEST_PICKUP.address,
        contact_person: { phone: TEST_PICKUP.phone },
      },
      {
        address: TEST_DELIVERY.address,
        contact_person: { phone: TEST_DELIVERY.phone },
      },
    ],
  });

  if (result.is_successful && result.order) {
    console.log(`   💰 Estimated Price: Rs. ${result.order.payment_amount}`);
    console.log(`   📦 Delivery Fee: Rs. ${result.order.delivery_fee_amount}`);
  }

  return result;
}

async function testCreateOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Create Delivery Order');
  console.log('='.repeat(60));

  const orderNumber = `TEST-${Date.now()}`;

  const result = await borzoRequest('/create-order', 'POST', {
    matter: 'Medicines',
    vehicle_type_id: 8, // Bike
    is_contact_person_notification_enabled: true,
    points: [
      {
        address: TEST_PICKUP.address,
        contact_person: {
          phone: TEST_PICKUP.phone,
          name: TEST_PICKUP.name,
        },
        client_order_id: orderNumber,
        note: 'Pharmacy pickup - Test order',
      },
      {
        address: TEST_DELIVERY.address,
        contact_person: {
          phone: TEST_DELIVERY.phone,
          name: TEST_DELIVERY.name,
        },
        note: `Order ${orderNumber} - Test delivery`,
      },
    ],
  });

  if (result.is_successful && result.order) {
    console.log(`   🆔 Order ID: ${result.order.order_id}`);
    console.log(`   📋 Order Name: ${result.order.order_name}`);
    console.log(`   📊 Status: ${result.order.status} - ${result.order.status_description}`);
    console.log(`   💰 Price: Rs. ${result.order.payment_amount}`);

    if (result.order.points?.[1]?.tracking_url) {
      console.log(`   🔗 Tracking URL: ${result.order.points[1].tracking_url}`);
    }
  }

  return result;
}

async function testGetOrders(orderId?: number) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Get Orders');
  console.log('='.repeat(60));

  const endpoint = orderId ? `/orders?order_id=${orderId}` : '/orders';
  const result = await borzoRequest(endpoint, 'GET');

  if (result.is_successful && result.orders) {
    console.log(`   📦 Found ${result.orders.length} order(s)`);
    result.orders.forEach((order: any) => {
      console.log(`   - Order ${order.order_id}: ${order.status} (${order.status_description})`);
    });
  }

  return result;
}

async function testCancelOrder(orderId: number) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Cancel Order');
  console.log('='.repeat(60));

  const result = await borzoRequest('/cancel-order', 'POST', {
    order_id: orderId,
  });

  if (result.is_successful) {
    console.log(`   🚫 Order ${orderId} cancelled successfully`);
  }

  return result;
}

async function runAllTests() {
  console.log('🚀 Borzo API Test Script');
  console.log(`📍 Using test endpoint: ${BORZO_TEST_URL}`);
  console.log(`🔑 Auth token: ${BORZO_AUTH_TOKEN.substring(0, 8)}...`);

  try {
    // Test 1: Calculate price
    await testCalculatePrice();

    // Test 2: Create order
    const createResult = await testCreateOrder();

    if (createResult.is_successful && createResult.order) {
      const orderId = createResult.order.order_id;

      // Test 3: Get order details
      await testGetOrders(orderId);

      // Test 4: Cancel the test order
      await testCancelOrder(orderId);

      // Verify cancellation
      await testGetOrders(orderId);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Check the Borzo test dashboard to confirm orders');
    console.log('2. Email api.in@borzodelivery.com to request production access');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
