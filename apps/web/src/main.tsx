import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AgentsPage } from "@/pages/AgentsPage";
import { CouncilPage } from "@/pages/CouncilPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ThroneRoomPage } from "@/pages/ThroneRoomPage";
import { TreasuryPage } from "@/pages/TreasuryPage";
import { UsersPage } from "@/pages/UsersPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/throne-room" element={<ThroneRoomPage />} />
          <Route path="/council" element={<CouncilPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/treasury" element={<TreasuryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/security" element={<SecurityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
