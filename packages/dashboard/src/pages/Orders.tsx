import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { getOrders, Order } from '../services/api';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  awaiting_rx: 'bg-purple-100 text-purple-800',
  rx_received: 'bg-purple-100 text-purple-800',
  under_review: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  awaiting_payment: 'bg-orange-100 text-orange-800',
  payment_confirmed: 'bg-green-100 text-green-800',
  ready_for_pickup: 'bg-teal-100 text-teal-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  awaiting_rx: 'Awaiting Rx',
  rx_received: 'Rx Received',
  under_review: 'Under Review',
  confirmed: 'Confirmed',
  awaiting_payment: 'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  ready_for_pickup: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusFilters = [
  { value: '', label: 'All Orders' },
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_rx', label: 'Awaiting Rx' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'ready_for_pickup', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function OrderRow({ order }: { order: Order }) {
  return (
    <Link
      to={`/orders/${order.id}`}
      className="block hover:bg-gray-50 transition-colors"
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">
                  {order.orderNumber}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    statusColors[order.status]
                  }`}
                >
                  {statusLabels[order.status]}
                </span>
                {order.requiresRx && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    Rx
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {order.customer.name || order.customer.phone}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="text-right">
              {order.totalAmount && (
                <div className="font-medium text-gray-900">
                  Rs. {order.totalAmount.toFixed(2)}
                </div>
              )}
              <div className="text-sm text-gray-500">
                {format(new Date(order.createdAt), 'MMM d, h:mm a')}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {order.parsedItems && order.parsedItems.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            {order.parsedItems
              .slice(0, 3)
              .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
              .join(', ')}
            {order.parsedItems.length > 3 && ` +${order.parsedItems.length - 3} more`}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function Orders() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', { status, search, page }],
    queryFn: () =>
      getOrders({
        status: status || undefined,
        search: search || undefined,
        page,
        limit: 20,
      }),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order #, phone, or name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            Failed to load orders. Please try again.
          </div>
        ) : data?.orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No orders found</div>
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {data?.orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * 20 + 1} to{' '}
                  {Math.min(page * 20, data.pagination.total)} of{' '}
                  {data.pagination.total} orders
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= data.pagination.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
