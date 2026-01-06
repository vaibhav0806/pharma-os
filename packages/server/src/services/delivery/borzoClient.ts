/**
 * Borzo API Client
 * Documentation: https://borzodelivery.com/in/business-api/doc
 */

import { config } from '../../config';
import { logger } from '../../utils/logger';

const BORZO_TEST_URL = 'https://robotapitest-in.borzodelivery.com/api/business/1.6';
const BORZO_PROD_URL = 'https://robot-in.borzodelivery.com/api/business/1.6';

interface BorzoPoint {
  address: string;
  contact_person: {
    phone: string;
    name?: string;
  };
  client_order_id?: string;
  note?: string;
}

interface BorzoOrderRequest {
  matter: string; // Description of delivery contents
  points: BorzoPoint[];
  vehicle_type_id?: number; // 8 = bike (default for small packages)
  total_weight_kg?: number;
  insurance_amount?: number;
  is_contact_person_notification_enabled?: boolean;
}

interface BorzoOrderResponse {
  is_successful: boolean;
  order?: {
    order_id: number;
    order_name: string;
    status: string;
    status_description: string;
    payment_amount: string;
    delivery_fee_amount: string;
    points: Array<{
      point_id: number;
      address: string;
      tracking_url?: string;
      status: string;
    }>;
    courier?: {
      name: string;
      phone: string;
    };
  };
  errors?: string[];
  parameter_errors?: Record<string, string[]>;
}

interface BorzoPriceResponse {
  is_successful: boolean;
  order?: {
    payment_amount: string;
    delivery_fee_amount: string;
    weight_fee_amount: string;
  };
  errors?: string[];
}

class BorzoClient {
  private baseUrl: string;
  private authToken: string;

  constructor() {
    this.baseUrl = config.env === 'production' ? BORZO_PROD_URL : BORZO_TEST_URL;
    this.authToken = config.borzo?.authToken || '';
  }

  private async request<T extends { is_successful: boolean; errors?: string[]; parameter_errors?: Record<string, string[]> }>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    logger.debug({ event: 'borzo_request', endpoint, method });

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-DV-Auth-Token': this.authToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as T;

    if (!response.ok || !data.is_successful) {
      logger.error({
        event: 'borzo_error',
        endpoint,
        status: response.status,
        errors: data.errors,
        parameterErrors: data.parameter_errors,
      });
      throw new BorzoError(
        data.errors?.[0] || 'Borzo API error',
        data.errors,
        data.parameter_errors
      );
    }

    logger.debug({ event: 'borzo_response', endpoint, success: true });

    return data;
  }

  /**
   * Calculate delivery price without creating an order
   */
  async calculatePrice(
    pickupAddress: string,
    pickupPhone: string,
    deliveryAddress: string,
    deliveryPhone: string,
    matter: string = 'Medicines'
  ): Promise<{ amount: number; currency: string }> {
    const response = await this.request<BorzoPriceResponse>('/calculate-order', 'POST', {
      matter,
      vehicle_type_id: 8, // Bike
      points: [
        {
          address: pickupAddress,
          contact_person: { phone: this.formatPhone(pickupPhone) },
        },
        {
          address: deliveryAddress,
          contact_person: { phone: this.formatPhone(deliveryPhone) },
        },
      ],
    });

    return {
      amount: parseFloat(response.order?.payment_amount || '0'),
      currency: 'INR',
    };
  }

  /**
   * Create a delivery order
   */
  async createOrder(params: {
    pickupAddress: string;
    pickupPhone: string;
    pickupName?: string;
    deliveryAddress: string;
    deliveryPhone: string;
    deliveryName?: string;
    matter?: string;
    orderNumber: string;
    note?: string;
  }): Promise<{
    orderId: string;
    orderNumber: string;
    trackingUrl: string;
    price: number;
    status: string;
  }> {
    const response = await this.request<BorzoOrderResponse>('/create-order', 'POST', {
      matter: params.matter || 'Medicines',
      vehicle_type_id: 8, // Bike
      is_contact_person_notification_enabled: true,
      points: [
        {
          address: params.pickupAddress,
          contact_person: {
            phone: this.formatPhone(params.pickupPhone),
            name: params.pickupName,
          },
          client_order_id: params.orderNumber,
          note: 'Pharmacy pickup',
        },
        {
          address: params.deliveryAddress,
          contact_person: {
            phone: this.formatPhone(params.deliveryPhone),
            name: params.deliveryName,
          },
          note: params.note || `Order ${params.orderNumber}`,
        },
      ],
    });

    if (!response.order) {
      throw new BorzoError('No order in response');
    }

    const deliveryPoint = response.order.points[1]; // Second point is delivery

    return {
      orderId: response.order.order_id.toString(),
      orderNumber: response.order.order_name,
      trackingUrl: deliveryPoint?.tracking_url || '',
      price: parseFloat(response.order.payment_amount),
      status: response.order.status,
    };
  }

  /**
   * Cancel a delivery order
   */
  async cancelOrder(borzoOrderId: string): Promise<void> {
    await this.request('/cancel-order', 'POST', {
      order_id: parseInt(borzoOrderId, 10),
    });
  }

  /**
   * Get order status
   */
  async getOrder(borzoOrderId: string): Promise<{
    status: string;
    statusDescription: string;
    courier?: { name: string; phone: string };
    trackingUrl?: string;
  }> {
    const response = await this.request<{ is_successful: boolean; orders: BorzoOrderResponse['order'][] }>(
      `/orders?order_id=${borzoOrderId}`,
      'GET'
    );

    const order = response.orders?.[0];
    if (!order) {
      throw new BorzoError('Order not found');
    }

    return {
      status: order.status,
      statusDescription: order.status_description,
      courier: order.courier,
      trackingUrl: order.points[1]?.tracking_url,
    };
  }

  /**
   * Format phone number for Borzo API (requires country code)
   */
  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');

    // If starts with 91, add +
    if (digits.startsWith('91') && digits.length === 12) {
      return `+${digits}`;
    }

    // If 10 digits, assume Indian number
    if (digits.length === 10) {
      return `+91${digits}`;
    }

    // Return as-is with + prefix
    return phone.startsWith('+') ? phone : `+${digits}`;
  }
}

export class BorzoError extends Error {
  constructor(
    message: string,
    public errors?: string[],
    public parameterErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'BorzoError';
  }
}

// Export singleton instance
export const borzoClient = new BorzoClient();
