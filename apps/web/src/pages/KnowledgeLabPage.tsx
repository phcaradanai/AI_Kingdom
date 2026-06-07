import { BookMarked, Brain, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function KnowledgeLabPage() {
  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Knowledge Lab</h1>
        <p className="mt-1 text-muted-foreground">
          Review, approve, and manage agent-proposed knowledge in a governed, traceable system.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/knowledge-lab/candidates" className="group block">
          <div className="rounded-xl border border-border/60 bg-card/60 p-6 transition-all hover:border-amber-400/40 hover:bg-card/80 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/20">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <h2 className="font-semibold text-foreground">Pending Candidates</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Review knowledge proposed by agents. Approve, reject, or merge before it becomes trusted memory.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10">
                Review Queue
              </Button>
            </div>
          </div>
        </Link>

        <Link to="/knowledge-lab/memories" className="group block">
          <div className="rounded-xl border border-border/60 bg-card/60 p-6 transition-all hover:border-emerald-400/40 hover:bg-card/80 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 border border-emerald-400/20">
                <Brain className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="font-semibold text-foreground">Approved Memories</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Browse trusted agent knowledge. Search by agent, project, category, or tag.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10">
                Browse Memories
              </Button>
            </div>
          </div>
        </Link>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-6">
        <div className="flex items-start gap-3">
          <BookMarked className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-foreground mb-1">How Knowledge Lab Works</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /><span>Agents propose knowledge candidates from their traces — durable facts, decisions, and patterns.</span></li>
              <li className="flex items-start gap-2"><Clock className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" /><span>Candidates remain <strong>PENDING</strong> until a reviewer approves, rejects, or merges them.</span></li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /><span>Only <strong>APPROVED</strong> memories are included in agent prompt context — never pending or rejected.</span></li>
              <li className="flex items-start gap-2"><XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" /><span>Duplicate fingerprints are blocked automatically — no memory spam.</span></li>
              <li className="flex items-start gap-2"><BookMarked className="h-4 w-4 text-primary mt-0.5 shrink-0" /><span>Every item links to its source trace, task, council session, and the agent that proposed it.</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
