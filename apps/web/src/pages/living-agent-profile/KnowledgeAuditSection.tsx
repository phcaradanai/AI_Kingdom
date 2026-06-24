import { ArrowUpRight, CheckCircle2, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { SectionLoadError } from "./SectionLoadError";
import type { LivingAgentProfileController } from "./useLivingAgentProfileController";

export function KnowledgeAuditSection({
  controller,
}: {
  controller: LivingAgentProfileController;
}) {
  const tk = useTk();
  if (controller.knowledgeLoading)
    return <LoadingState message={tk("agentProfile.knowledge.loading")} />;
  const audit = controller.profile?.auditSummary ?? [];
  return (
    <div className="min-w-0 space-y-3">
      {controller.knowledgeError ? (
        <SectionLoadError
          message={tk("agentProfile.knowledge.error")}
          onRetry={() => void controller.loadKnowledge()}
        />
      ) : null}
      <section
        aria-label={tk("agentProfile.knowledge.aria")}
        className="grid min-w-0 gap-px border border-border bg-border lg:grid-cols-2"
      >
        <Collection
          title={tk("agentProfile.knowledge.candidates", {
            count: controller.knowledgeCandidates.length,
          })}
          icon={Sparkles}
          source={{
            aria: tk("agentProfile.knowledge.openCandidates"),
            to: `/knowledge-lab/candidates?agentId=${encodeURIComponent(controller.agentId)}`,
          }}
        >
          {controller.knowledgeCandidates.length ? (
            controller.knowledgeCandidates
              .slice(0, 10)
              .map((item) => (
                <Record
                  key={item.id}
                  title={item.title}
                  meta={`${item.status} · ${item.category.replaceAll("_", " ")}`}
                  detail={item.content}
                  traceId={item.traceId}
                />
              ))
          ) : (
            <None text={tk("agentProfile.knowledge.noCandidates")} />
          )}
        </Collection>
        <Collection
          title={tk("agentProfile.knowledge.memories", {
            count: controller.knowledgeMemories.length,
          })}
          icon={CheckCircle2}
          source={{
            aria: tk("agentProfile.knowledge.openMemories"),
            to: `/knowledge-lab/memories?agentId=${encodeURIComponent(controller.agentId)}`,
          }}
        >
          {controller.knowledgeMemories.length ? (
            controller.knowledgeMemories
              .slice(0, 10)
              .map((item) => (
                <Record
                  key={item.id}
                  title={item.title}
                  meta={`${item.trustLevel} · ${item.category.replaceAll("_", " ")} · ${tk("agentProfile.knowledge.used", { count: item.useCount })}`}
                  detail={item.content}
                  traceId={item.createdFromTraceId}
                />
              ))
          ) : (
            <None text={tk("agentProfile.knowledge.noMemories")} />
          )}
        </Collection>
        <div className="min-w-0 bg-card/55 p-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            {tk("agentProfile.audit.title")}
          </h2>
          <div className="mt-2 divide-y divide-border">
            {audit.length ? (
              audit.map((item, index) => (
                <div
                  className="flex min-h-12 min-w-0 items-center justify-between gap-3 py-2"
                  key={`${item.action}-${index}`}
                >
                  <span className="min-w-0 break-words font-mono text-sm text-foreground">
                    {item.action}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <None text={tk("agentProfile.audit.empty")} />
            )}
          </div>
          <Link
            aria-label={tk("agentProfile.audit.open")}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            to="/audit"
          >
            {tk("agentProfile.audit.source")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
function Collection({
  children,
  icon: Icon,
  source,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Sparkles;
  source: { aria: string; to: string };
  title: string;
}) {
  return (
    <div className="min-w-0 bg-card/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </h2>
        <Link
          aria-label={source.aria}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-semibold text-primary"
          to={source.to}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-2 divide-y divide-border">{children}</div>
    </div>
  );
}
function Record({
  detail,
  meta,
  title,
  traceId,
}: {
  detail: string;
  meta: string;
  title: string;
  traceId: string | null;
}) {
  const tk = useTk();
  return (
    <article className="min-w-0 py-3">
      <h3 className="break-words text-sm font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {detail}
      </p>
      {traceId ? (
        <Link
          aria-label={tk("agentProfile.knowledge.openTrace", { title })}
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary"
          to={`/usage-traces/${traceId}`}
        >
          {tk("agentProfile.knowledge.sourceTrace")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </article>
  );
}
function None({ text }: { text: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>;
}
