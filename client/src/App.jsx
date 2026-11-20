/**
 * App.jsx - The route table of the whole website.
 * Public pages are open to everyone; <ProtectedRoute> guards customer and admin areas
 * (role-based). "/*" routes (dashboard, admin) choose their section from the URL.
 */
import { Routes, Route } from './router/index.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import ServiceDetail from './pages/ServiceDetail.jsx';
import Shop from './pages/Shop.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Book from './pages/Book.jsx';
import Pay from './pages/Pay.jsx';
import Confirmation from './pages/Confirmation.jsx';
import BookingDetails from './pages/BookingDetails.jsx';
import OrderDetails from './pages/OrderDetails.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import CustomerDashboard from './pages/dashboard/CustomerDashboard.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import NotFound from './pages/NotFound.jsx';

const customer = (el) => <ProtectedRoute role="customer">{el}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/services" element={<Services />} />
      <Route path="/services/:slug" element={<ServiceDetail />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/shop/:slug" element={<ProductDetail />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout" element={customer(<Checkout />)} />
      <Route path="/book" element={customer(<Book />)} />
      <Route path="/pay/:purpose/:id" element={customer(<Pay />)} />
      <Route path="/confirmation/:purpose/:id" element={customer(<Confirmation />)} />
      <Route path="/bookings/:id" element={<ProtectedRoute><BookingDetails /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard/*" element={customer(<CustomerDashboard />)} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
