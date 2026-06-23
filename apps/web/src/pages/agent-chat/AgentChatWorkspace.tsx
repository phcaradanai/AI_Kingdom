import { MessageSquareText, PanelLeft, Plus, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentChatPane } from "./agentChatModels";
import { AgentChatRail } from "./AgentChatRail";
import { AgentContextPanel } from "./AgentContextPanel";
import { AgentConversationPanel } from "./AgentConversationPanel";
import type { AgentChatController } from "./useAgentChatController";

export function AgentChatWorkspace({ controller }: { controller: AgentChatController }) {
  const tk = useTk();
  return <div className="min-w-0">
    <PageHeader eyebrow={tk("agentChat.eyebrow")} title={tk("agentChat.title")} description={tk("agentChat.description")} action={<Button className="min-h-11" onClick={() => controller.startNew()} variant="outline"><Plus className="h-4 w-4" />{tk("agentChat.new")}</Button>} />

    {controller.error ? <div className="mb-4 flex min-w-0 items-start gap-2 border-l-2 border-destructive bg-destructive/10 px-3 py-3 text-sm text-destructive" role="alert"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive" /><span className="min-w-0 break-words">{controller.error}</span></div> : null}

    <nav aria-label={tk("agentChat.panes.aria")} className="mb-4 grid grid-cols-3 border border-border bg-card/35 p-1 xl:hidden">
      <PaneButton active={controller.pane === "browse"} icon={PanelLeft} label={tk("agentChat.panes.browse")} onClick={() => controller.setPane("browse")} />
      <PaneButton active={controller.pane === "conversation"} icon={MessageSquareText} label={tk("agentChat.panes.conversation")} onClick={() => controller.setPane("conversation")} />
      <PaneButton active={controller.pane === "context"} icon={SlidersHorizontal} label={tk("agentChat.panes.context")} onClick={() => controller.setPane("context")} />
    </nav>

    <div className="grid min-w-0 gap-4 xl:h-[calc(100vh-210px)] xl:min-h-[660px] xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-rows-[minmax(0,1fr)]">
      <Pane active={controller.pane === "browse"} pane="browse"><AgentChatRail controller={controller} /></Pane>
      <Pane active={controller.pane === "conversation"} pane="conversation"><AgentConversationPanel controller={controller} /></Pane>
      <Pane active={controller.pane === "context"} pane="context"><AgentContextPanel controller={controller} /></Pane>
    </div>
  </div>;
}

function Pane({ active, children, pane }: { active: boolean; children: React.ReactNode; pane: AgentChatPane }) {
  return <div className={cn("min-h-0 min-w-0 overflow-hidden xl:block", !active && "hidden")} data-mobile-active={active ? "true" : "false"} data-pane={pane}>{children}</div>;
}

function PaneButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof PanelLeft; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1.5 border px-2 text-xs font-semibold transition-colors", active ? "border-primary/50 bg-primary/15 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground")} onClick={onClick} type="button"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></button>;
}
