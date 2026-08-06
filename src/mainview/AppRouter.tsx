import { Routes, Route } from "react-router-dom";
import SetupPage from "./SetupPage";
import AppPage from "./AppPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/app" element={<AppPage />} />
    </Routes>
  );
}
