import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  MapPin,
  FileText,
  Send,
  Check,
  X,
  Clock,
  CreditCard,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getOrder,
  getOrderMessages,
  updateOrderStatus,
  requestPrescription,
  sendMessage,
  bookDelivery,
  cancelDelivery,
  getDeliveryConfig,
} from '../services/api';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  awaiting_rx: 'bg-purple-100 text-purple-800 border-purple-200',
  rx_received: 'bg-purple-100 text-purple-800 border-purple-200',
  under_review: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  awaiting_payment: 'bg-orange-100 text-orange-800 border-orange-200',
  payment_confirmed: 'bg-green-100 text-green-800 border-green-200',
  ready_for_pickup: 'bg-teal-100 text-teal-800 border-teal-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  awaiting_rx: 'Awaiting Prescription',
  rx_received: 'Prescription Received',
  under_review: 'Under Review',
  confirmed: 'Confirmed',
  awaiting_payment: 'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  ready_for_pickup: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const deliveryStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  calculating: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-blue-100 text-blue-800',
  booked: 'bg-indigo-100 text-indigo-800',
  courier_assigned: 'bg-purple-100 text-purple-800',
  in_transit: 'bg-orange-100 text-orange-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
};

const deliveryStatusLabels: Record<string, string> = {
  pending: 'Pending',
  calculating: 'Calculating Price',
  quoted: 'Price Quoted',
  booked: 'Booked',
  courier_assigned: 'Courier Assigned',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cod'>('upi');
  const [cancelReason, setCancelReason] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id,
  });

  const { data: messagesData } = useQuery({
    queryKey: ['order-messages', id],
    queryFn: () => getOrderMessages(id!),
    enabled: !!id,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: deliveryConfig } = useQuery({
    queryKey: ['delivery-config'],
    queryFn: getDeliveryConfig,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateOrderStatus>[1]) =>
      updateOrderStatus(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowConfirmModal(false);
      setShowCancelModal(false);
    },
  });

  const requestRxMutation = useMutation({
    mutationFn: () => requestPrescription(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => sendMessage(id!, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-messages', id] });
      setCustomMessage('');
    },
  });

  const bookDeliveryMutation = useMutation({
    mutationFn: () => bookDelivery(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  const cancelDeliveryMutation = useMutation({
    mutationFn: () => cancelDelivery(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Order not found</p>
      </div>
    );
  }

  const handleConfirmOrder = () => {
    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    updateStatusMutation.mutate({
      status: paymentMethod === 'upi' ? 'awaiting_payment' : 'confirmed',
      totalAmount: amount,
      paymentMethod,
      notifyCustomer: true,
    });
  };

  const handleCancelOrder = () => {
    updateStatusMutation.mutate({
      status: 'cancelled',
      reason: cancelReason || 'Cancelled by pharmacy',
      notifyCustomer: true,
    });
  };

  const getAvailableActions = (status: string) => {
    switch (status) {
      case 'pending':
        return ['start_review', 'request_rx', 'cancel'];
      case 'awaiting_rx':
        return ['cancel'];
      case 'rx_received':
        return ['start_review', 'cancel'];
      case 'under_review':
        return ['confirm', 'request_rx', 'cancel'];
      case 'confirmed':
        return ['mark_ready', 'cancel'];
      case 'awaiting_payment':
        return ['confirm_payment', 'cancel'];
      case 'payment_confirmed':
        return ['mark_ready', 'cancel'];
      case 'ready_for_pickup':
        return ['complete', 'cancel'];
      default:
        return [];
    }
  };

  const actions = getAvailableActions(order.status);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/orders')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Order {order.orderNumber}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Created {format(new Date(order.createdAt), 'PPp')}
            </p>
          </div>

          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
              statusColors[order.status]
            }`}
          >
            {statusLabels[order.status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Customer</h2>
            <div className="space-y-3">
              <div className="flex items-center text-gray-600">
                <Phone className="w-5 h-5 mr-3" />
                <span>{order.customer.phone}</span>
              </div>
              {order.customer.name && (
                <div className="flex items-center text-gray-600">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center font-medium">
                    N
                  </span>
                  <span>{order.customer.name}</span>
                </div>
              )}
              {order.customer.address && (
                <div className="flex items-start text-gray-600">
                  <MapPin className="w-5 h-5 mr-3 mt-0.5" />
                  <span>{order.customer.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Order Items
            </h2>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Original Message:</p>
              <p className="text-gray-900 whitespace-pre-wrap">
                {order.rawMessage}
              </p>
            </div>

            {order.parsedItems && order.parsedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Parsed Items:</p>
                <ul className="divide-y divide-gray-100">
                  {order.parsedItems.map((item, index) => (
                    <li
                      key={index}
                      className="py-2 flex justify-between items-center"
                    >
                      <span className="text-gray-900">{item.name}</span>
                      <span className="text-gray-500">x {item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {order.totalAmount && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="font-medium text-gray-900">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  Rs. {Number(order.totalAmount).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Prescriptions */}
          {order.prescriptions.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Prescriptions
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {order.prescriptions.map((rx) => (
                  <a
                    key={rx.id}
                    href={rx.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border border-gray-200 rounded-lg overflow-hidden hover:border-primary-500 transition-colors"
                  >
                    <img
                      src={rx.mediaUrl}
                      alt="Prescription"
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-2 text-center text-sm text-gray-500">
                      {format(new Date(rx.createdAt), 'PPp')}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Delivery */}
          {(order.delivery || deliveryConfig?.enabled) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <Truck className="w-5 h-5 mr-2" />
                  Delivery
                </h2>
                {order.delivery && (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      deliveryStatusColors[order.delivery.status]
                    }`}
                  >
                    {deliveryStatusLabels[order.delivery.status]}
                  </span>
                )}
              </div>

              {order.delivery ? (
                <div className="space-y-4">
                  {/* Tracking URL */}
                  {order.delivery.trackingUrl && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Tracking Link</p>
                      <a
                        href={order.delivery.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-primary-600 hover:text-primary-700"
                      >
                        Track Delivery
                        <ExternalLink className="w-4 h-4 ml-1" />
                      </a>
                    </div>
                  )}

                  {/* Borzo Order Number */}
                  {order.delivery.borzoOrderNumber && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Delivery Order #</p>
                      <p className="text-gray-900">{order.delivery.borzoOrderNumber}</p>
                    </div>
                  )}

                  {/* Courier Info */}
                  {order.delivery.courierName && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Courier</p>
                      <p className="text-gray-900">{order.delivery.courierName}</p>
                      {order.delivery.courierPhone && (
                        <p className="text-gray-600">{order.delivery.courierPhone}</p>
                      )}
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Delivery Cost</p>
                    <p className="text-gray-900 font-medium">
                      Rs. {Number(order.delivery.finalPrice || order.delivery.estimatedPrice || 0).toFixed(2)}
                      {order.delivery.estimatedPrice && !order.delivery.finalPrice && (
                        <span className="text-xs text-gray-500 ml-1">(estimated)</span>
                      )}
                    </p>
                  </div>

                  {/* Cancel Delivery Button */}
                  {['booked', 'courier_assigned'].includes(order.delivery.status) && (
                    <button
                      onClick={() => cancelDeliveryMutation.mutate()}
                      disabled={cancelDeliveryMutation.isPending}
                      className="w-full flex items-center justify-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-4 h-4 mr-2" />
                      {cancelDeliveryMutation.isPending ? 'Cancelling...' : 'Cancel Delivery'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  {deliveryConfig?.enabled ? (
                    <>
                      <p className="text-gray-500 mb-4">
                        No delivery booked yet.
                        {!order.customer.address && (
                          <span className="block text-sm text-orange-600 mt-1">
                            Customer address not available.
                          </span>
                        )}
                      </p>
                      {order.customer.address && ['ready_for_pickup', 'payment_confirmed', 'confirmed'].includes(order.status) && (
                        <button
                          onClick={() => bookDeliveryMutation.mutate()}
                          disabled={bookDeliveryMutation.isPending}
                          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <Truck className="w-4 h-4 mr-2" />
                          {bookDeliveryMutation.isPending ? 'Booking...' : 'Book Delivery'}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500">Delivery service not enabled.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Messages</h2>

            <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
              {messagesData?.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.direction === 'outbound'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.direction === 'outbound'
                          ? 'text-primary-200'
                          : 'text-gray-500'
                      }`}
                    >
                      {format(new Date(msg.createdAt), 'h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Send message */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customMessage.trim()) {
                    sendMessageMutation.mutate(customMessage);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (customMessage.trim()) {
                    sendMessageMutation.mutate(customMessage);
                  }
                }}
                disabled={!customMessage.trim() || sendMessageMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar - Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Actions</h2>

            <div className="space-y-3">
              {actions.includes('start_review') && (
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: 'under_review',
                      notifyCustomer: true,
                    })
                  }
                  disabled={updateStatusMutation.isPending}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Start Review
                </button>
              )}

              {actions.includes('request_rx') && (
                <button
                  onClick={() => requestRxMutation.mutate()}
                  disabled={requestRxMutation.isPending}
                  className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Request Prescription
                </button>
              )}

              {actions.includes('confirm') && (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Confirm Order
                </button>
              )}

              {actions.includes('confirm_payment') && (
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: 'payment_confirmed',
                      notifyCustomer: true,
                    })
                  }
                  disabled={updateStatusMutation.isPending}
                  className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Confirm Payment
                </button>
              )}

              {actions.includes('mark_ready') && (
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: 'ready_for_pickup',
                      notifyCustomer: true,
                    })
                  }
                  disabled={updateStatusMutation.isPending}
                  className="w-full flex items-center justify-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Mark Ready
                </button>
              )}

              {actions.includes('complete') && (
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: 'completed',
                      notifyCustomer: true,
                    })
                  }
                  disabled={updateStatusMutation.isPending}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Complete Order
                </button>
              )}

              {actions.includes('cancel') && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full flex items-center justify-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel Order
                </button>
              )}
            </div>
          </div>

          {/* Order notes */}
          {order.notes && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Notes</h2>
              <p className="text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Order Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Confirm Order
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Amount (Rs.)
                </label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Enter total amount"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={() => setPaymentMethod('upi')}
                      className="mr-2"
                    />
                    UPI
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="mr-2"
                    />
                    Cash on Delivery
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={updateStatusMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {updateStatusMutation.isPending ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Cancel Order
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={updateStatusMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {updateStatusMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
