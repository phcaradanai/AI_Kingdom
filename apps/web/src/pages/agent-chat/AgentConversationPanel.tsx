import { Brain, ExternalLink, Send, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { agentTitle, promptExampleKeys } from "./agentChatModels";
import type { AgentChatController } from "./useAgentChatController";

export function AgentConversationPanel({ controller }: { controller: AgentChatController }) {
  const tk = useTk();
  const selectedTitle = agentTitle(controller.selectedAgent) || tk("agentChat.agent.select");
  return <section aria-label={tk("agentChat.conversation.aria")} className="flex h-[520px] min-h-0 min-w-0 flex-col overflow-hidden border border-border bg-card/35 xl:h-full">
    <header className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
      <AgentPortrait agent={controller.selectedAgent} size="sm" status={controller.sending ? "RESPONDING" : "IDLE"} />
      <div className="min-w-0 flex-1"><div className="truncate text-base font-semibold text-foreground sm:text-lg">{selectedTitle}</div><div className="truncate text-xs text-muted-foreground sm:text-sm">{controller.selectedSession?.title ?? controller.selectedAgent?.specialty ?? tk("agentChat.conversation.start")}</div></div>
      {controller.selectedSession?.latestTraceId ? <Link aria-label={tk("agentChat.source.openLatestTrace")} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-semibold text-primary hover:bg-primary/10" to={`/usage-traces/${controller.selectedSession.latestTraceId}`}><span className="hidden sm:inline">{tk("agentChat.source.trace")}</span><ExternalLink className="h-4 w-4" /></Link> : null}
    </header>

    <div aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
      {!controller.selectedSession ? <div className="flex h-full min-h-36 items-center justify-center border border-dashed border-border bg-background/20 p-5 text-center sm:p-6">
        <div className="max-w-md"><Brain className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 text-lg font-semibold text-foreground">{tk("agentChat.empty.title")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("agentChat.empty.description")}</p><Button className="mt-4 min-h-11 xl:hidden" onClick={() => controller.setPane("browse")} variant="outline">{tk("agentChat.empty.chooseAgent")}</Button></div>
      </div> : controller.selectedSession.messages.length === 0 ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">{tk("agentChat.conversation.noMessages")}</div> : controller.selectedSession.messages.map((message) => <article className={cn("max-w-[94%] border px-3 py-3 sm:max-w-[86%] sm:px-4", message.role === "USER" ? "ml-auto border-primary/25 bg-primary/10" : "border-border bg-background/55")} key={message.id}>
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground"><span className="truncate font-semibold text-foreground/85">{message.role === "USER" ? tk("agentChat.message.you") : agentTitle(controller.selectedSession?.agent) || tk("agentChat.agent.fallback")}</span><time className="shrink-0 tabular-nums">{formatDate(message.createdAt)}</time></div>
        {message.role === "AGENT" ? <div className="min-w-0 break-words"><MarkdownDocument content={message.content} /></div> : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{message.content}</p>}
      </article>)}
      {controller.sending ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />{tk("agentChat.sendingStatus", { agent: selectedTitle })}</div> : null}
    </div>

    <div className="border-t border-border bg-background/35 p-3 sm:p-4">
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="border border-border bg-card/50 px-2 py-1">{tk(`agentChat.request.${requestKey(controller.requestType)}`)}</span><span className="border border-border bg-card/50 px-2 py-1">{tk(`agentChat.save.${saveKey(controller.saveMode)}`)}</span></div>
      <label className="sr-only" htmlFor="agent-chat-prompt">{tk("agentChat.composer.label", { agent: selectedTitle })}</label>
      <Textarea id="agent-chat-prompt" className="max-h-48 min-h-24 resize-y" placeholder={tk("agentChat.composer.placeholder")} value={controller.prompt} onChange={(event) => controller.setPrompt(event.target.value)} />
      <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
        <Button className="min-h-11 min-w-0 px-3" onClick={() => controller.setPrompt(tk(promptExampleKeys[controller.requestType]))} type="button" variant="ghost"><Sparkles className="h-4 w-4 shrink-0" /><span className="truncate">{tk("agentChat.composer.example")}</span></Button>
        <Button aria-label={tk("agentChat.composer.sendAria")} className="min-h-11 shrink-0" disabled={controller.sending || !controller.prompt.trim() || (!controller.selectedSession && !controller.selectedAgentId)} onClick={() => void controller.submit()}><Send className="h-4 w-4" />{controller.sending ? tk("agentChat.composer.sending") : tk("agentChat.composer.send")}</Button>
      </div>
    </div>
  </section>;
}

function requestKey(value: AgentChatController["requestType"]) {
  return { GENERAL_QUESTION: "general", RESEARCH_ASSIGNMENT: "research", SUMMARY_ASSIGNMENT: "summary", PERSONAL_TASK: "personal" }[value];
}

function saveKey(value: AgentChatController["saveMode"]) {
  return { NONE: "none", ARTIFACT: "artifact", KNOWLEDGE_CANDIDATE: "knowledge", BOTH: "both" }[value];
}
