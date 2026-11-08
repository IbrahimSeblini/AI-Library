import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import FeaturePage from "./pages/FeaturePage";
import JudgmentDetail from "./pages/JudgmentDetail";
import CIPage from "./pages/CIPage";
import CIRunDetailPage from "./pages/CIRunDetailPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("judge_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/feature/:name" element={<RequireAuth><FeaturePage /></RequireAuth>} />
        <Route path="/judgments/:id" element={<RequireAuth><JudgmentDetail /></RequireAuth>} />
        <Route path="/ci" element={<RequireAuth><CIPage /></RequireAuth>} />
        <Route path="/ci/runs/:id" element={<RequireAuth><CIRunDetailPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
