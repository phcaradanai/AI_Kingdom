import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { TaskDto } from "@/types/api";
import { StatusBadge } from "./StatusBadge";

export function TaskCard({ task }: { task: TaskDto }) {
  const report = task.reports[0];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{task.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.mode} decree · {formatDate(task.createdAt)}
          </p>
        </div>
        <StatusBadge status={task.status} />
      </div>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{task.command}</p>
      {report ? <p className="mt-4 border-t border-border pt-4 text-sm leading-6">{report.summary}</p> : null}
    </Card>
  );
}
