import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ResetPassword from './pages/ResetPassword';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login standard (senza slug) */}
        <Route path="/" element={<Login />} />
        
        {/* NUOVO: Login personalizzato per scuola */}
        <Route path="/login/:schoolSlug" element={<Login />} />
        
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;