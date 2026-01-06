import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

// Orders
export interface Order {
  id: string;
  orderNumber: string;
  customer: {
    id: string;
    phone: string;
    name: string | null;
  };
  status: string;
  rawMessage: string;
  parsedItems: Array<{ name: string; quantity: number }> | null;
  requiresRx: boolean;
  rxVerified: boolean;
  paymentMethod: 'upi' | 'cod' | null;
  totalAmount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getOrders = async (params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const response = await api.get<OrdersResponse>('/orders', { params });
  return response.data;
};

export interface Delivery {
  id: string;
  status: 'pending' | 'calculating' | 'quoted' | 'booked' | 'courier_assigned' | 'in_transit' | 'delivered' | 'cancelled' | 'failed';
  trackingUrl: string | null;
  borzoOrderNumber: string | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  courierName: string | null;
  courierPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends Order {
  customer: {
    id: string;
    phone: string;
    name: string | null;
    address: string | null; // Last used address (for reference)
  };
  deliveryAddress: string | null; // This order's delivery address
  prescriptions: Array<{
    id: string;
    mediaUrl: string;
    mediaType: string;
    isValid: boolean | null;
    createdAt: string;
  }>;
  delivery: Delivery | null;
}

export const getOrder = async (id: string) => {
  const response = await api.get<OrderDetail>(`/orders/${id}`);
  return response.data;
};

export const updateOrderStatus = async (
  id: string,
  data: {
    status: string;
    totalAmount?: number;
    paymentMethod?: 'upi' | 'cod';
    reason?: string;
    notifyCustomer?: boolean;
  }
) => {
  const response = await api.patch(`/orders/${id}/status`, data);
  return response.data;
};

export const updateOrder = async (
  id: string,
  data: {
    parsedItems?: Array<{ name: string; quantity: number }>;
    notes?: string;
    totalAmount?: number;
  }
) => {
  const response = await api.patch(`/orders/${id}`, data);
  return response.data;
};

export const requestPrescription = async (id: string) => {
  const response = await api.post(`/orders/${id}/request-rx`);
  return response.data;
};

export const sendPaymentInstructions = async (id: string) => {
  const response = await api.post(`/orders/${id}/send-payment`);
  return response.data;
};

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  mediaUrl: string | null;
  status: string;
  createdAt: string;
}

export const getOrderMessages = async (id: string) => {
  const response = await api.get<{ messages: Message[] }>(`/orders/${id}/messages`);
  return response.data;
};

export const sendMessage = async (id: string, message: string) => {
  const response = await api.post(`/orders/${id}/messages`, { message });
  return response.data;
};

export const requestAddress = async (id: string) => {
  const response = await api.post(`/orders/${id}/request-address`);
  return response.data;
};

// Pharmacy
export interface Pharmacy {
  id: string;
  name: string;
  phone: string;
  whatsappNumber: string;
  address: string | null;
  upiId: string | null;
  isActive: boolean;
}

export const getPharmacy = async () => {
  const response = await api.get<Pharmacy>('/pharmacy');
  return response.data;
};

export const updatePharmacy = async (data: {
  name?: string;
  address?: string;
  upiId?: string;
}) => {
  const response = await api.patch('/pharmacy', data);
  return response.data;
};

// Delivery
export interface DeliveryConfig {
  enabled: boolean;
  provider: string;
}

export const getDeliveryConfig = async () => {
  const response = await api.get<DeliveryConfig>('/delivery/config');
  return response.data;
};

export const getDelivery = async (orderId: string) => {
  const response = await api.get<{ delivery: Delivery | null }>(`/delivery/order/${orderId}`);
  return response.data;
};

export const bookDelivery = async (orderId: string) => {
  const response = await api.post<{ success: boolean; trackingUrl?: string }>('/delivery/book', { orderId });
  return response.data;
};

export const cancelDelivery = async (orderId: string) => {
  const response = await api.delete(`/delivery/order/${orderId}`);
  return response.data;
};

export default api;
