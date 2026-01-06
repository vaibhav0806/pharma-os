# Pharma OS

WhatsApp-based operating system for local pharmacies to manage orders, prescriptions, payments, and delivery coordination.

## Tech Stack

- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL
- **WhatsApp:** Twilio API
- **Delivery:** Borzo API
- **Dashboard:** React + Vite + Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Twilio account with WhatsApp sandbox enabled
- Borzo account (optional, for automated delivery)
- ngrok (for local development)

### 1. Clone and Install

```bash
cd pharma-os
npm install
```

### 2. Configure Environment

Copy the example env file and update with your credentials:

```bash
cp .env.example .env
```

Update the following values in `.env`:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/pharma_os
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
BASE_URL=https://your-ngrok-url.ngrok.io
JWT_SECRET=your-secret-key

# Optional: Borzo delivery integration
BORZO_AUTH_TOKEN=your_borzo_api_token
BORZO_ENABLED=true
```

### 3. Set Up Database

Create the database and run migrations:

```bash
# Create database
createdb pharma_os

# Run migrations
npm run migrate
```

Seed the database with test data:

```bash
cd packages/server
npx ts-node src/db/seed.ts
```

This creates a test pharmacy with login:
- Email: `admin@pharmacy.com`
- Password: `password123`

### 4. Configure Twilio Webhook

Start ngrok to expose your local server:

```bash
ngrok http 3000
```

In Twilio Console:
1. Go to Messaging > Try it out > Send a WhatsApp message
2. Set webhook URL to: `https://your-ngrok-url.ngrok.io/api/webhook/twilio/incoming`
3. Join the sandbox by sending the code to the Twilio WhatsApp number

### 5. Run the Application

```bash
# Start backend (port 3000)
npm run dev

# In another terminal, start dashboard (port 5173)
npm run dev:dashboard
```

### 6. Access the Dashboard

Open http://localhost:5173 and login with:
- Email: `admin@pharmacy.com`
- Password: `password123`

## Project Structure

```
pharma-os/
├── packages/
│   ├── server/           # Backend API
│   │   ├── src/
│   │   │   ├── api/      # Routes, controllers, middleware
│   │   │   ├── config/   # Configuration
│   │   │   ├── db/       # Migrations, client
│   │   │   ├── services/ # Business logic
│   │   │   └── utils/    # Utilities
│   │   └── package.json
│   │
│   └── dashboard/        # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── context/
│       │   ├── pages/
│       │   └── services/
│       └── package.json
│
├── .env.example
└── package.json
```

## Order Flow

1. **Customer sends WhatsApp message** → Bot acknowledges & creates order
2. **Pharmacist reviews in dashboard** → Confirms items, flags Rx if needed
3. **Bot requests prescription** if required → Customer uploads image
4. **Pharmacist confirms availability** → Sets price & payment method
5. **Bot sends payment instructions** (UPI) or confirms COD
6. **Pharmacist confirms payment** → Marks order ready
7. **Delivery auto-booked via Borzo** → Customer receives tracking link

## API Endpoints

### Webhooks
- `POST /api/webhook/twilio/incoming` - WhatsApp messages
- `POST /api/webhook/twilio/status` - Message status updates

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

### Orders
- `GET /api/orders` - List orders
- `GET /api/orders/:id` - Order details
- `PATCH /api/orders/:id/status` - Update status
- `POST /api/orders/:id/request-rx` - Request prescription
- `POST /api/orders/:id/send-payment` - Send payment details
- `GET /api/orders/:id/messages` - Message history
- `POST /api/orders/:id/messages` - Send message

### Pharmacy
- `GET /api/pharmacy` - Get settings
- `PATCH /api/pharmacy` - Update settings

### Delivery
- `GET /api/delivery/config` - Get delivery config
- `GET /api/delivery/order/:orderId` - Get delivery for order
- `POST /api/delivery/book` - Book delivery
- `DELETE /api/delivery/order/:orderId` - Cancel delivery
- `POST /api/delivery/webhook/borzo` - Borzo status webhook

## License

MIT
