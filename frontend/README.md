# Car Spare Parts ERP Frontend

React, Vite, React Router, Axios, and lucide-react frontend for the car spare parts ERP system.

## Setup

```bash
cd frontend
npm install
cp .env.example .env
```

By default, the frontend calls the API with same-origin `/api`. This works with `localhost`, LAN IP, and WAN/router IP without changing the app URL.

For Vite development, `.env` can point the dev proxy to the backend:

```env
VITE_API_PROXY_TARGET=http://localhost:5000
```

Only set `VITE_API_BASE_URL` if the frontend and backend must be on different hosts or ports:

```env
VITE_API_BASE_URL=http://192.168.1.10:5000/api
```

Run the frontend:

```bash
npm run dev
```

The Vite dev server listens on all network interfaces by default. Other computers on the same network can open:

```text
http://<server-ip>:5173
```

If you expose the Vite dev server through a router, forward the public port to this computer's LAN IP and port `5173`. The Vite proxy will send `/api` requests to the backend. For a more stable one-port WAN setup, build the frontend and serve it from the backend on port `5000`.

If the page does not open, allow Node.js through Windows Firewall for ports `5173` and `5000`.

Build for production:

```bash
npm run build
```

## Login

Use the credentials configured by your backend seed. Common local values:

- `admin@example.com` / `admin123`
- `admin@example.com` / `12345678`

## Pages

- Login
- Dashboard
- Products
- Add/Edit Product
- Categories
- Brands
- Suppliers
- Customers
- Purchases
- Create Purchase
- Sales
- Create Sale
- Stock Movements
- Reports
