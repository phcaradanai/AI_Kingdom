import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AgentsPage } from "@/pages/AgentsPage";
import { AuditPage } from "@/pages/AuditPage";
import { CharterPage } from "@/pages/CharterPage";
import { ExternalAgentsPage } from "@/pages/ExternalAgentsPage";
import { MattersPage } from "@/pages/MattersPage";
import { NoticesPage } from "@/pages/NoticesPage";
import { VisionPage } from "@/pages/VisionPage";
import { WorkOrdersPage } from "@/pages/WorkOrdersPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import { ProjectInboxPage } from "@/pages/ProjectInboxPage";
import { ArtifactsPage } from "@/pages/ArtifactsPage";
import { CouncilPage } from "@/pages/CouncilPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ThroneRoomPage } from "@/pages/ThroneRoomPage";
import { TreasuryPage } from "@/pages/TreasuryPage";
import { UsageTracePage } from "@/pages/UsageTracePage";
import { UsersPage } from "@/pages/UsersPage";
import { LivingAgentsPage } from "@/pages/LivingAgentsPage";
import { LivingAgentProfilePage } from "@/pages/LivingAgentProfilePage";
import { KnowledgeLabPage } from "@/pages/KnowledgeLabPage";
import { KnowledgeCandidatesPage } from "@/pages/KnowledgeCandidatesPage";
import { KnowledgeMemoriesPage } from "@/pages/KnowledgeMemoriesPage";
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
          <Route path="/external-agents" element={<ExternalAgentsPage />} />
          <Route path="/work-orders" element={<WorkOrdersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/project-inbox" element={<ProjectInboxPage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/treasury" element={<TreasuryPage />} />
          <Route path="/usage-traces/:traceId" element={<UsageTracePage />} />
          <Route path="/living-agents" element={<LivingAgentsPage />} />
          <Route path="/living-agents/:agentId" element={<LivingAgentProfilePage />} />
          <Route path="/knowledge-lab" element={<KnowledgeLabPage />} />
          <Route path="/knowledge-lab/candidates" element={<KnowledgeCandidatesPage />} />
          <Route path="/knowledge-lab/memories" element={<KnowledgeMemoriesPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/charter" element={<CharterPage />} />
          <Route path="/vision" element={<VisionPage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/matters" element={<MattersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/security" element={<SecurityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
