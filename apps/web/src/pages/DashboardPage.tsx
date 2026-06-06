import { Landmark, ScrollText, Shield, Vault } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TaskCard } from "@/components/TaskCard";
import { Card } from "@/components/ui/card";
import { useKingdomStore } from "@/stores/kingdomStore";

export function DashboardPage() {
  const { agents, tasks, reports, memories } = useKingdomStore();
  const stats = [
    { label: "Royal Agents", value: agents.length, icon: Shield },
    { label: "Commands", value: tasks.length, icon: Landmark },
    { label: "Reports", value: reports.length, icon: ScrollText },
    { label: "Memories", value: memories.length, icon: Vault }
  ];

  return (
    <>
      <PageHeader
        eyebrow="Royal Overview"
        title="The Kingdom at a glance"
        description="Monitor agents, council deliberations, generated reports, and institutional memory from one command center."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <stat.icon className="h-5 w-5 text-primary" />
            <div className="mt-4 text-3xl font-bold">{stat.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {tasks.slice(0, 4).map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}
